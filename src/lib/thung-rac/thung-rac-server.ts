/**
 * BB-409 — Thùng rác bộ ảnh: thao tác trên DB + Storage (chỉ máy chủ).
 *
 * Mọi bước ghi dữ liệu đi qua hàm SQL của migration 0109 (một giao dịch mỗi bước):
 *   bo_anh_vao_thung_rac  — đặt deleted_at + dấu chặn Lark
 *   bo_anh_khoi_phuc      — gỡ deleted_at + gỡ dấu
 *   bo_anh_don_han        — xoá hẳn dòng galleries (bảng con cascade), giữ dấu
 * Tệp Storage xoá TRƯỚC khi dọn DB (sau khi dọn thì không còn danh sách ảnh để
 * tìm tệp). Drive KHÔNG bị gọi gì — thư mục ảnh gốc giữ nguyên.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { bamThuMucDrive, chonBoQuaHan, maBo, mocCatQuaHan, TOI_DA_DON_MOI_LUOT } from "./thung-rac";

/** Storage API nhận tối đa ngần này đường dẫn mỗi lượt xoá (giữ an toàn). */
const LO_XOA_STORAGE = 100;

export interface NguoiThaoTac {
  staffId: string | null;
  actorLabel?: string;
}

export async function boVaoThungRac(
  admin: SupabaseClient,
  gallery: { id: string; branch_id: string | null; drive_folder_id: string | null },
  nguoi: NguoiThaoTac,
): Promise<string | null> {
  const { data, error } = await admin.rpc("bo_anh_vao_thung_rac", {
    p_gallery_id: gallery.id,
    p_actor_id: nguoi.staffId,
    p_drive_hash: bamThuMucDrive(gallery.drive_folder_id) ?? "",
  });
  if (error) throw error;
  // Nhật ký do ROUTE ghi (phép thử BB-052 quét route).
  const luc = (data as string | null) ?? null;
  return luc;
}

export async function khoiPhucBoAnh(
  admin: SupabaseClient,
  gallery: { id: string },
): Promise<boolean> {
  const { data, error } = await admin.rpc("bo_anh_khoi_phuc", { p_gallery_id: gallery.id });
  if (error) throw error;
  const ok = data === true;
  return ok;
}

export interface KetQuaDonMotBo {
  galleryId: string;
  soTepStorage: number;
  soLieu: Record<string, number> | null;
}

/**
 * Dọn hẳn MỘT bộ đang ở thùng rác: xoá tệp Storage của bộ rồi xoá dữ liệu trên DB.
 * Storage hỏng → ném lỗi, KHÔNG dọn DB (lượt sau thử lại; dọn DB trước là mất dấu
 * tệp mồ côi vĩnh viễn).
 */
export async function donHanBoAnh(
  admin: SupabaseClient,
  gallery: { id: string; branch_id: string | null },
  nguoi: NguoiThaoTac & { actorType: "staff" | "system" },
): Promise<KetQuaDonMotBo | null> {
  const { data: tep, error: loiTep } = await admin.rpc("duong_dan_storage_bo_anh", {
    p_gallery_id: gallery.id,
  });
  if (loiTep) throw loiTep;

  const theoBucket = new Map<string, string[]>();
  for (const t of (tep as Array<{ bucket: string; name: string }> | null) ?? []) {
    const ds = theoBucket.get(t.bucket) ?? [];
    ds.push(t.name);
    theoBucket.set(t.bucket, ds);
  }
  let soTep = 0;
  for (const [bucket, ds] of theoBucket) {
    for (let i = 0; i < ds.length; i += LO_XOA_STORAGE) {
      const lo = ds.slice(i, i + LO_XOA_STORAGE);
      const { error } = await admin.storage.from(bucket).remove(lo);
      if (error) throw error;
      soTep += lo.length;
    }
  }

  // Ghi nhật ký TRƯỚC khi xoá dòng galleries: sau đó gallery_id không còn để trỏ
  // tới (khoá ngoại 0051 là set null — dòng nhật ký vẫn còn, chỉ mang mã).
  await ghiNhatKy({
    actorType: nguoi.actorType,
    actorId: nguoi.staffId,
    actorLabel: nguoi.actorLabel ?? null,
    branchId: gallery.branch_id,
    action: "gallery.xoa_han",
    entityType: "gallery",
    entityId: gallery.id,
    galleryId: gallery.id,
    metadata: { maBo: maBo(gallery.id), soTepStorage: soTep },
  });

  const { data, error } = await admin.rpc("bo_anh_don_han", { p_gallery_id: gallery.id });
  if (error) throw error;
  if (!data) return null;
  return { galleryId: gallery.id, soTepStorage: soTep, soLieu: data as Record<string, number> };
}

/**
 * Bước cron: dọn các bộ đã quá 10 ngày trong thùng rác. Chỉ trả SỐ ĐẾM (không mã,
 * không tên) — kết quả cron được in ra log máy chủ.
 */
export async function donThungRacQuaHan(
  admin: SupabaseClient,
  tuyChon: { bayGio?: Date; gioiHan?: number; hetGioLuc?: number } = {},
): Promise<{ quaHan: number; daDon: number; loi: number; soTepStorage: number; hetGio: boolean }> {
  const bayGio = tuyChon.bayGio ?? new Date();
  const gioiHan = tuyChon.gioiHan ?? TOI_DA_DON_MOI_LUOT;
  const { data, error } = await admin
    .from("galleries")
    .select("id, branch_id, deleted_at")
    .not("deleted_at", "is", null)
    .lte("deleted_at", mocCatQuaHan(bayGio))
    .order("deleted_at", { ascending: true })
    .limit(gioiHan);
  if (error) throw error;

  const ds = chonBoQuaHan(
    ((data as Array<{ id: string; branch_id: string | null; deleted_at: string }> | null) ?? []).map((g) => ({
      id: g.id,
      branch_id: g.branch_id,
      deletedAt: g.deleted_at,
    })),
    bayGio,
    gioiHan,
  );

  let daDon = 0;
  let loi = 0;
  let soTep = 0;
  let hetGio = false;
  for (const g of ds) {
    if (tuyChon.hetGioLuc && Date.now() > tuyChon.hetGioLuc) {
      hetGio = true;
      break;
    }
    try {
      const kq = await donHanBoAnh(admin, g, { staffId: null, actorType: "system", actorLabel: "cron" });
      if (kq) {
        daDon++;
        soTep += kq.soTepStorage;
      }
    } catch (err) {
      loi++;
      console.error(
        JSON.stringify({ evt: "thung_rac.don_loi", loi: err instanceof Error ? err.message : String(err) }),
      );
    }
  }
  return { quaHan: ds.length, daDon, loi, soTepStorage: soTep, hetGio };
}
