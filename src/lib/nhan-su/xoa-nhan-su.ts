/**
 * BB-409 — Xoá nhân sự: luật quyền + kế hoạch chuyển dữ liệu (thuần, thử được).
 *
 * Chủ studio chốt 10/10/2026:
 *   - Admin (vai `owner`) và Quản lý được xoá (quyền `nhan_su:xoa`, migration 0109).
 *   - KHÔNG AI xoá được tài khoản Admin.
 *   - Quản lý không xoá được Admin hay Quản lý khác.
 *   - Việc ĐANG PHỤ TRÁCH chuyển về "Tổ chức BabyBean"; cột LỊCH SỬ giữ nguyên,
 *     tên hiện kèm "(đã nghỉ)". Tài khoản đăng nhập bị khoá ngay.
 */
import type { StaffRole } from "@/types/domain";

export const QUYEN_XOA_NHAN_SU = "nhan_su:xoa";
export const TEN_TO_CHUC = "Tổ chức BabyBean";
export const DUOI_DA_NGHI = " (đã nghỉ)";

/** Vai "quản lý trở lên": người không phải Admin không xoá được những vai này. */
const VAI_QUAN_LY: readonly StaffRole[] = ["owner", "admin", "branch_manager"];

/**
 * Cột "đang phụ trách" → chuyển về Tổ chức BabyBean (hàm SQL
 * `xoa_nhan_su_chuyen_du_lieu`, migration 0109). Giữ danh sách này KHỚP hàm SQL.
 */
export const COT_PHU_TRACH = [
  { bang: "galleries", cot: "photographer_id", nhan: "Bộ ảnh (thợ chụp)" },
  { bang: "galleries", cot: "cskh_id", nhan: "Bộ ảnh (CSKH)" },
  { bang: "galleries", cot: "editor_id", nhan: "Bộ ảnh (chỉnh ảnh)" },
  { bang: "deliveries", cot: "retoucher_id", nhan: "Việc chỉnh ảnh" },
  { bang: "shoots", cot: "photographer_id", nhan: "Buổi chụp sắp tới" }, // buổi đã chụp giữ tên thợ (anh 12/10)
] as const;

/** Cột "lịch sử" → GIỮ nguyên người đã làm; hiển thị kèm "(đã nghỉ)". */
export const COT_LICH_SU = [
  "customers.created_by",
  "shoots.created_by",
  "shoots.photographer_id (buổi đã chụp)",
  "galleries.created_by",
  "galleries.deleted_by",
  "share_links.created_by",
  "share_links.revoked_by",
  "gallery_payments.confirmed_by",
  "settings.updated_by",
  "activity_logs.actor_id",
  "selection_rounds.confirmed_by",
  "selection_rounds.xu_ly_by",
  "selection_rounds.da_thanh_toan_boi",
  "selections.studio_xu_ly_dot1_boi",
  "goi_chup_gia_anh_them.cap_nhat_boi",
  "hoa_don_bo_anh.gan_boi",
  "bo_anh_da_xoa.xoa_boi",
] as const;

export interface NguoiXoa {
  staffId: string;
  role: StaffRole;
  permissions: readonly string[];
  branchIds: readonly string[];
}

export interface NguoiBiXoa {
  id: string;
  role: StaffRole;
  /** Quyền của vai người bị xoá (để nhận ra "Quản lý" ở vai tự tạo). */
  permissions: readonly string[];
  branchIds: readonly string[];
  laToChuc?: boolean;
  daNghiLuc?: string | null;
}

export type LyDoTuChoi =
  | "KHONG_CO_QUYEN"
  | "TU_XOA"
  | "LA_ADMIN"
  | "LA_QUAN_LY"
  | "LA_TO_CHUC"
  | "DA_XOA"
  | "KHAC_CHI_NHANH";

export const CAU_TU_CHOI: Record<LyDoTuChoi, string> = {
  KHONG_CO_QUYEN: "Bạn không có quyền xoá nhân sự",
  TU_XOA: "Không thể tự xoá tài khoản của mình",
  LA_ADMIN: "Không ai xoá được tài khoản Admin",
  LA_QUAN_LY: "Chỉ Admin mới xoá được Quản lý",
  LA_TO_CHUC: "Đây là chủ thể chung Tổ chức BabyBean, không xoá được",
  DA_XOA: "Nhân sự này đã được xoá trước đó",
  KHAC_CHI_NHANH: "Nhân sự này làm ở chi nhánh bạn không quản lý",
};

/**
 * Ai được xoá ai. Trả `null` = được; còn lại là lý do từ chối (route trả 403/409).
 * Thứ tự kiểm cố ý: quyền → tự xoá → Admin → chủ thể chung → đã xoá → cấp bậc → chi nhánh.
 */
export function kiemQuyenXoaNhanSu(nguoi: NguoiXoa, bi: NguoiBiXoa): LyDoTuChoi | null {
  if (!nguoi.permissions.includes(QUYEN_XOA_NHAN_SU)) return "KHONG_CO_QUYEN";
  if (nguoi.staffId === bi.id) return "TU_XOA";
  if (bi.role === "owner") return "LA_ADMIN";
  if (bi.laToChuc) return "LA_TO_CHUC";
  if (bi.daNghiLuc) return "DA_XOA";

  const laAdmin = nguoi.role === "owner";
  if (!laAdmin) {
    const biLaQuanLy =
      VAI_QUAN_LY.includes(bi.role) ||
      bi.permissions.includes(QUYEN_XOA_NHAN_SU) ||
      bi.permissions.includes("system:superuser");
    if (biLaQuanLy) return "LA_QUAN_LY";

    // Quản lý chi nhánh chỉ xoá người thuộc TRỌN chi nhánh mình quản lý.
    if (!nguoi.permissions.includes("system:superuser")) {
      const ngoai = bi.branchIds.length === 0 || bi.branchIds.some((b) => !nguoi.branchIds.includes(b));
      if (ngoai) return "KHAC_CHI_NHANH";
    }
  }
  return null;
}

/** Màn danh sách: có bày nút "Xoá nhân sự" cho dòng này không (cùng luật với route). */
export function hienNutXoa(nguoi: NguoiXoa, bi: NguoiBiXoa): boolean {
  return kiemQuyenXoaNhanSu(nguoi, bi) === null;
}

export interface SoLieuChuyen {
  boAnhPhoto: number;
  boAnhCskh: number;
  boAnhChinh: number;
  viecChinhAnh: number;
  buoiChup: number;
  khachTao: number;
  dongNhatKy: number;
}

export interface KeHoachChuyen {
  /** Số bộ ảnh đang phụ trách (một bộ có thể đếm ở nhiều vai — cộng theo vai). */
  soBoAnh: number;
  soViec: number;
  soBuoiChup: number;
  /** Khách do người này tạo — GIỮ người tạo (lịch sử), chỉ báo để người xoá biết. */
  soKhach: number;
  soDongNhatKy: number;
  /** Câu hiện ở hộp xác nhận. */
  cau: string;
}

function so(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
}

export function keHoachChuyen(raw: Partial<SoLieuChuyen> | null | undefined, tenNguoi: string): KeHoachChuyen {
  const r = raw ?? {};
  const soBoAnh = so(r.boAnhPhoto) + so(r.boAnhCskh) + so(r.boAnhChinh);
  const soViec = so(r.viecChinhAnh);
  const soBuoiChup = so(r.buoiChup);
  const soKhach = so(r.khachTao);
  const soDongNhatKy = so(r.dongNhatKy);
  const phan: string[] = [];
  if (soBoAnh) phan.push(`${soBoAnh} bộ ảnh`);
  if (soViec) phan.push(`${soViec} việc chỉnh ảnh`);
  if (soBuoiChup) phan.push(`${soBuoiChup} buổi chụp sắp tới`);
  const cau =
    phan.length > 0
      ? `${phan.join(", ")} đang do ${tenNguoi} phụ trách sẽ chuyển về ${TEN_TO_CHUC}.`
      : `${tenNguoi} không còn việc nào đang phụ trách.`;
  return { soBoAnh, soViec, soBuoiChup, soKhach, soDongNhatKy, cau };
}

/** Tên hiển thị một nhân sự ở mọi chỗ đọc tên (danh sách, nhật ký, người phụ trách). */
export function tenHienThiNhanSu(
  p: { full_name?: string | null; da_nghi_luc?: string | null; la_to_chuc?: boolean | null } | null | undefined,
): string | null {
  if (!p) return null;
  if (p.la_to_chuc) return TEN_TO_CHUC;
  const ten = p.full_name ?? null;
  if (!ten) return null;
  return p.da_nghi_luc ? `${ten}${DUOI_DA_NGHI}` : ten;
}

/** Dịch lỗi 'BB409_*' do hàm SQL ném ra sang lý do. */
export function lyDoTuLoiSql(message: string | undefined | null): LyDoTuChoi | "THIEU_TO_CHUC" | "KHONG_THAY" | null {
  const m = String(message ?? "");
  if (m.includes("BB409_TU_XOA")) return "TU_XOA";
  if (m.includes("BB409_ADMIN")) return "LA_ADMIN";
  if (m.includes("BB409_TO_CHUC")) return "LA_TO_CHUC";
  if (m.includes("BB409_DA_XOA")) return "DA_XOA";
  if (m.includes("BB409_THIEU_TO_CHUC")) return "THIEU_TO_CHUC";
  if (m.includes("BB409_KHONG_THAY")) return "KHONG_THAY";
  return null;
}
