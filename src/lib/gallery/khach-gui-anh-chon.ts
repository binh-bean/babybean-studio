/**
 * BB-337 mục 1 — hàng đợi "Khách gửi ảnh chọn" (Việc cần xử lý): MỖI BỘ ẢNH MỘT
 * DÒNG, gom mọi việc khách vừa gửi mà CSKH chưa xử lý:
 *   · đợt 1 khách đã chốt, chờ studio xác nhận (`trangThaiBoAnh()` = "cho_studio_xac_nhan", BB-332);
 *   · đợt mua thêm ≥ 2 đang `cho_xac_nhan` (BB-321, `layDanhSachChoXacNhanDot`);
 *   · khách nhờ studio chọn giúp / còn sản phẩm in chưa có ảnh (BB-321, `layDanhSachViecDot1`);
 *   · BB-345 — gia đình (link mời) "đặt chỉnh sửa" các tấm đã thả tim, còn mở
 *     ('moi'/'da_lien_he' trong `yeu_cau_mua_them`, `layDatChinhSuaChoXuLy`).
 *
 * Không viết lại luật nào: ba nguồn trên là các hàm có sẵn; ở đây chỉ GOM.
 * `gomTheoBoAnh` là hàm thuần để thử đơn vị.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { trangThaiBoAnh } from "@/lib/lark/trang-thai-app-lark";
import {
  layDanhSachChoXacNhanDot,
  layDanhSachViecDot1,
  type DongChoXacNhanDot,
  type DongViecDot1,
} from "@/lib/gallery/dot-chon-server";
import { layDatChinhSuaChoXuLy, type DongDatChinhSua } from "@/lib/gallery/tim-gia-dinh-server";

export interface Dot1ChoXacNhan {
  galleryId: string;
  galleryTitle: string;
  branchName: string | null;
  customerName: string | null;
  submittedAt: string | null;
}

export interface DotMuaThemCho {
  soDot: number;
  soAnh: number;
  tong: number;
  soSanPhamInChuaAnh: number;
  submittedAt: string | null;
  sanPham: Array<{ ten: string; soLuong: number }>;
}

export interface DongKhachGuiAnhChon {
  galleryId: string;
  galleryTitle: string;
  branchName: string | null;
  customerName: string | null;
  /** Lúc khách gửi gần nhất trong các việc của dòng — để sắp cũ nhất lên trước. */
  guiLuc: string | null;
  /** Đợt 1 đang chờ CSKH xác nhận danh sách. */
  dot1ChoXacNhan: boolean;
  /** Các đợt mua thêm (≥ 2) đang chờ xác nhận. */
  dotMuaThem: DotMuaThemCho[];
  /** Khách nhờ studio chọn thêm N ảnh (0 = không). */
  nhoStudioChonThem: number;
  /** Còn N sản phẩm in khách chưa chọn ảnh (0 = không). */
  soSanPhamInChuaAnh: number;
  /** BB-345 — yêu cầu "đặt chỉnh sửa" của gia đình còn mở. */
  datChinhSua: DatChinhSuaCho[];
}

export interface DatChinhSuaCho {
  id: string;
  soAnh: number;
  tamTinh: number;
  trangThai: string;
  nguoiGui: string | null;
  submittedAt: string | null;
}

function cuHon(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/** Gom ba nguồn thành một dòng mỗi bộ ảnh. Cũ nhất lên trước. HÀM THUẦN. */
export function gomTheoBoAnh(
  dot1: Dot1ChoXacNhan[],
  dotMuaThem: Pick<
    DongChoXacNhanDot,
    | "galleryId"
    | "galleryTitle"
    | "branchName"
    | "customerName"
    | "soDot"
    | "soAnh"
    | "tong"
    | "soSanPhamInChuaAnh"
    | "submittedAt"
    | "sanPham"
  >[],
  viecDot1: Pick<
    DongViecDot1,
    "galleryId" | "galleryTitle" | "branchName" | "customerName" | "nhoStudioChonThem" | "soSanPhamInChuaAnh" | "submittedAt"
  >[],
  datChinhSua: Pick<
    DongDatChinhSua,
    "id" | "galleryId" | "galleryTitle" | "branchName" | "customerName" | "soAnh" | "tamTinh" | "trangThai" | "nguoiGui" | "submittedAt"
  >[] = [],
): DongKhachGuiAnhChon[] {
  const theoBo = new Map<string, DongKhachGuiAnhChon>();
  const lay = (g: { galleryId: string; galleryTitle: string; branchName: string | null; customerName: string | null }) => {
    let d = theoBo.get(g.galleryId);
    if (!d) {
      d = {
        galleryId: g.galleryId,
        galleryTitle: g.galleryTitle,
        branchName: g.branchName,
        customerName: g.customerName,
        guiLuc: null,
        dot1ChoXacNhan: false,
        dotMuaThem: [],
        nhoStudioChonThem: 0,
        soSanPhamInChuaAnh: 0,
        datChinhSua: [],
      };
      theoBo.set(g.galleryId, d);
    }
    return d;
  };

  for (const g of dot1) {
    const d = lay(g);
    d.dot1ChoXacNhan = true;
    d.guiLuc = cuHon(d.guiLuc, g.submittedAt);
  }
  for (const g of dotMuaThem) {
    const d = lay(g);
    d.dotMuaThem.push({
      soDot: g.soDot,
      soAnh: g.soAnh,
      tong: g.tong,
      soSanPhamInChuaAnh: g.soSanPhamInChuaAnh ?? 0,
      submittedAt: g.submittedAt ?? null,
      sanPham: (g.sanPham ?? []).map((s) => ({ ten: s.ten, soLuong: s.soLuong })),
    });
    d.guiLuc = cuHon(d.guiLuc, g.submittedAt ?? null);
  }
  for (const g of viecDot1) {
    const d = lay(g);
    d.nhoStudioChonThem = g.nhoStudioChonThem;
    d.soSanPhamInChuaAnh = g.soSanPhamInChuaAnh;
    d.guiLuc = cuHon(d.guiLuc, g.submittedAt);
  }

  for (const g of datChinhSua) {
    const d = lay(g);
    d.datChinhSua.push({
      id: g.id,
      soAnh: g.soAnh,
      tamTinh: g.tamTinh,
      trangThai: g.trangThai,
      nguoiGui: g.nguoiGui,
      submittedAt: g.submittedAt ?? null,
    });
    d.guiLuc = cuHon(d.guiLuc, g.submittedAt ?? null);
  }

  for (const d of theoBo.values()) d.dotMuaThem.sort((a, b) => a.soDot - b.soDot);
  return Array.from(theoBo.values()).sort((a, b) => (a.guiLuc ?? "").localeCompare(b.guiLuc ?? ""));
}

/**
 * Bộ ảnh ĐỢT 1 đang chờ studio xác nhận — đúng nhãn "Chờ studio xác nhận" của
 * `trangThaiBoAnh()`: status `submitted` mà Lark chưa sang "Đã chọn hình" (Lark
 * đi trước thì CSKH đã xử lý bên Lark, không còn là việc ở đây).
 */
export async function layDot1ChoXacNhan(
  admin: SupabaseClient,
  branchIds: string[] | null,
): Promise<Dot1ChoXacNhan[]> {
  let q = admin
    .from("galleries")
    .select(
      "id, title, branch_id, customer_id, status, lark_trang_thai, lark_trang_thai_tu, reopened_at, drive_folder_url, branches(name)",
    )
    .eq("status", "submitted")
    .limit(500);
  if (branchIds) q = q.in("branch_id", branchIds);
  const { data, error } = await q;
  if (error) throw error;

  type G = {
    id: string;
    title: string;
    branch_id: string;
    customer_id: string | null;
    status: string;
    lark_trang_thai: string | null;
    lark_trang_thai_tu: string | null;
    reopened_at: string | null;
    drive_folder_url: string | null;
    branches: { name: string } | { name: string }[] | null;
  };
  const gs = ((data ?? []) as unknown as G[]).filter(
    (g) =>
      trangThaiBoAnh({
        status: g.status,
        larkTrangThai: g.lark_trang_thai,
        larkTrangThaiTu: g.lark_trang_thai_tu,
        reopenedAt: g.reopened_at,
        coDriveLink: !!g.drive_folder_url,
        coLinkApp: true,
      }).ma === "cho_studio_xac_nhan",
  );
  if (gs.length === 0) return [];

  const ids = gs.map((g) => g.id);
  const kIds = Array.from(new Set(gs.map((g) => g.customer_id).filter((v): v is string => !!v)));
  const [{ data: ks }, { data: sel }] = await Promise.all([
    kIds.length
      ? admin.from("customers").select("id, full_name").in("id", kIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    admin.from("selections").select("gallery_id, submitted_at").eq("is_primary", true).in("gallery_id", ids),
  ]);
  const kMap = new Map(((ks ?? []) as { id: string; full_name: string }[]).map((k) => [k.id, k.full_name]));
  const guiMap = new Map(
    ((sel ?? []) as { gallery_id: string; submitted_at: string | null }[]).map((s) => [s.gallery_id, s.submitted_at]),
  );
  const tenCn = (raw: G["branches"]) => (Array.isArray(raw) ? raw[0]?.name : raw?.name) ?? null;

  return gs.map((g) => ({
    galleryId: g.id,
    galleryTitle: g.title,
    branchName: tenCn(g.branches),
    customerName: g.customer_id ? (kMap.get(g.customer_id) ?? null) : null,
    submittedAt: guiMap.get(g.id) ?? null,
  }));
}

/** Đủ bốn nguồn (BB-345 thêm "đặt chỉnh sửa"), đã gom. `branchIds = null` = mọi chi nhánh (superuser). */
export async function layKhachGuiAnhChon(
  admin: SupabaseClient,
  branchIds: string[] | null,
): Promise<DongKhachGuiAnhChon[]> {
  const [dot1, dotMuaThem, viecDot1, datChinhSua] = await Promise.all([
    layDot1ChoXacNhan(admin, branchIds),
    layDanhSachChoXacNhanDot(admin, branchIds),
    layDanhSachViecDot1(admin, branchIds),
    layDatChinhSuaChoXuLy(admin, branchIds),
  ]);
  return gomTheoBoAnh(dot1, dotMuaThem, viecDot1, datChinhSua);
}
