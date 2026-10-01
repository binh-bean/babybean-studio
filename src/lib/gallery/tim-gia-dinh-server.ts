/**
 * BB-345 — phần chạm cơ sở dữ liệu của "tim gia đình" và "đặt chỉnh sửa".
 *
 * Mọi hàm ĐỌC rớt về rỗng kèm `chuaApMigration: true` khi bảng/cột của 0083
 * chưa có (42P01/PGRST205/42703/PGRST204) — màn khách và màn quản trị không
 * hỏng, không 500 (cùng cách BB-332 `chuaApMigration`).
 *
 * Bảng `tim_gia_dinh` bật RLS không policy: chỉ client service_role ở đây đọc
 * được. Mọi truy vấn KHOÁ theo id lấy từ phiên/route đã kiểm quyền — không bao
 * giờ nhận id link/bộ ảnh từ thân yêu cầu.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { laLoiThieuBang, laLoiThieuCot } from "@/lib/gallery/dot-chon-server";

type LoiDb = { code?: string; message?: string } | null | undefined;

export function laChuaAp0083(err: LoiDb): boolean {
  return laLoiThieuBang(err) || laLoiThieuCot(err);
}

/** Tim của ĐÚNG MỘT link mời (khoá cả link lẫn bộ ảnh của phiên). */
export async function docTimCuaLink(
  admin: SupabaseClient,
  shareLinkId: string,
  galleryId: string,
): Promise<{ ids: string[]; chuaApMigration: boolean }> {
  const { data, error } = await admin
    .from("tim_gia_dinh")
    .select("photo_id")
    .eq("share_link_id", shareLinkId)
    .eq("gallery_id", galleryId)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) {
    if (laChuaAp0083(error)) return { ids: [], chuaApMigration: true };
    throw error;
  }
  return { ids: (data ?? []).map((r) => (r as { photo_id: string }).photo_id), chuaApMigration: false };
}

/** Tim của MỌI link mời trong một bộ ảnh, gom theo tấm: photoId → số người thả. */
export async function demTimGiaDinh(
  admin: SupabaseClient,
  galleryId: string,
): Promise<{ theoAnh: Map<string, number>; chuaApMigration: boolean }> {
  const theoAnh = new Map<string, number>();
  const { data, error } = await admin
    .from("tim_gia_dinh")
    .select("photo_id")
    .eq("gallery_id", galleryId)
    .limit(5000);
  if (error) {
    if (laChuaAp0083(error)) return { theoAnh, chuaApMigration: true };
    throw error;
  }
  for (const r of (data ?? []) as { photo_id: string }[]) {
    theoAnh.set(r.photo_id, (theoAnh.get(r.photo_id) ?? 0) + 1);
  }
  return { theoAnh, chuaApMigration: false };
}

/** Một yêu cầu "đặt chỉnh sửa" còn chờ CSKH (hàng đợi "Khách gửi ảnh chọn"). */
export interface DongDatChinhSua {
  id: string;
  galleryId: string;
  galleryTitle: string;
  branchName: string | null;
  customerName: string | null;
  soAnh: number;
  tamTinh: number;
  trangThai: string;
  nguoiGui: string | null;
  submittedAt: string;
}

/**
 * Yêu cầu chỉnh sửa còn mở ('moi' hoặc 'da_lien_he') trong phạm vi chi nhánh.
 * `branchIds = null` = mọi chi nhánh. Chưa áp 0083 → [].
 */
export async function layDatChinhSuaChoXuLy(
  admin: SupabaseClient,
  branchIds: string[] | null,
): Promise<DongDatChinhSua[]> {
  const { data, error } = await admin
    .from("yeu_cau_mua_them")
    .select(
      "id, gallery_id, so_luong, tam_tinh, trang_thai, ten_nguoi_mua, created_at, " +
        "galleries!inner(title, branch_id, customer_id, branches(name))",
    )
    .eq("loai", "chinh_sua")
    .in("trang_thai", ["moi", "da_lien_he"])
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    if (laChuaAp0083(error)) return [];
    throw error;
  }
  type G = {
    title: string;
    branch_id: string;
    customer_id: string | null;
    branches: { name: string } | { name: string }[] | null;
  };
  type R = {
    id: string;
    gallery_id: string;
    so_luong: number;
    tam_tinh: number | string | null;
    trang_thai: string;
    ten_nguoi_mua: string | null;
    created_at: string;
    galleries: G | G[] | null;
  };
  const rows = ((data ?? []) as unknown as R[])
    .map((r) => ({ r, g: Array.isArray(r.galleries) ? r.galleries[0] : r.galleries }))
    .filter((x): x is { r: R; g: G } => !!x.g && (!branchIds || branchIds.includes(x.g.branch_id)));
  if (rows.length === 0) return [];

  const kIds = Array.from(new Set(rows.map((x) => x.g.customer_id).filter((v): v is string => !!v)));
  const { data: ks } = kIds.length
    ? await admin.from("customers").select("id, full_name").in("id", kIds)
    : { data: [] as { id: string; full_name: string }[] };
  const kMap = new Map((ks ?? []).map((k) => [k.id as string, k.full_name as string]));
  const tenCn = (raw: G["branches"]) => (Array.isArray(raw) ? raw[0]?.name : raw?.name) ?? null;

  return rows.map(({ r, g }) => ({
    id: r.id,
    galleryId: r.gallery_id,
    galleryTitle: g.title,
    branchName: tenCn(g.branches),
    customerName: g.customer_id ? (kMap.get(g.customer_id) ?? null) : null,
    soAnh: r.so_luong,
    tamTinh: Number(r.tam_tinh ?? 0),
    trangThai: r.trang_thai,
    nguoiGui: r.ten_nguoi_mua,
    submittedAt: r.created_at,
  }));
}
