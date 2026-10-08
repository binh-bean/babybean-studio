/**
 * BB-402 — NÚT CHÍNH của ba mẹ ở thanh đáy, theo đúng giai đoạn của bộ ảnh.
 *
 * HÀM THUẦN (không mạng, không DB): màn khách (`gallery-app.tsx`) và phép thử
 * gọi cùng một hàm.
 *
 * Lỗi anh báo 08/10/2026 (bộ HD_20260924#5261): ba mẹ đã chốt, đã DUYỆT ảnh chỉnh
 * (`approved`), studio đã đi in — mà nút chính ở thanh đáy vẫn là "Yêu cầu sửa
 * lại" (nhánh "đã khoá thật" của `gallery-app` không phân biệt giai đoạn). Sau
 * khi duyệt thì việc tiếp theo của ba mẹ là MUA THÊM, nên nút chính phải là
 * "Chọn thêm ảnh" (mở màn đợt mua thêm như thẻ `DotChonTrenManChinh`).
 *
 * Giai đoạn đọc từ `trangThaiKhach()` — CÙNG hàm với bìa, thẻ tiến trình và nhãn
 * quản trị (`trangThaiBoAnh`) — không tự đoán lại từ status.
 *
 * Thứ tự luật:
 *   1. Chưa khoá                      → "chot"           (Chốt danh sách)
 *   2. Vừa chốt, CSKH chưa xác nhận   → "sua_danh_sach"  (ba mẹ tự mở lại)
 *   3. Có ảnh chỉnh CHỜ DUYỆT          → "duyet"          (bộ gốc `awaiting_approval`,
 *      hoặc một đợt mua thêm đã gửi duyệt) — thanh đáy duyệt (`thanhDayBuocDuyet`)
 *   4. Studio ĐÃ XÁC NHẬN danh sách trở đi (xếp hàng chỉnh, đang chỉnh, đã duyệt, in,
 *      giao)                          → "chon_them"      (Chọn thêm ảnh)
 *      Anh chốt 08/10 (vòng 2): cả lúc ĐANG CHỈNH, nút chính cũng là "Chọn thêm ảnh";
 *      muốn đổi danh sách đã chốt thì lối PHỤ "Nhắn Bean" (`coLoiNhanBean`).
 *      Máy chủ đã cho mở đợt mua thêm từ `in_retouch` (`dangCheDoChonThem`).
 *   5. Còn lại (khoá mà chưa tới bước xác nhận: hết hạn / quá hạn 60 ngày)
 *                                     → "xin_sua_lai"   (xin mở lại)
 */
import { trangThaiKhach, type MaTrangThaiBoAnh } from "@/lib/lark/trang-thai-app-lark";

export type LoaiNutChinh = "chot" | "sua_danh_sach" | "duyet" | "chon_them" | "xin_sua_lai";

export interface DauVaoNutChinh {
  status: string;
  /** `giaiDoanTienDo` máy chủ gửi (đã tính Lark còn hiệu lực + sàn của app). */
  giaiDoan: number | null;
  /** Khoá chọn ảnh (máy chủ gộp Lark/hạn 60 ngày + trạng thái app). */
  khoa: boolean;
  /** `submitted` mà máy chủ chưa khoá thật — ba mẹ tự sửa được danh sách. */
  daChotChoXacNhan: boolean;
  /** Đợt mua thêm đang chờ ba mẹ duyệt ảnh chỉnh (máy chủ đếm, `soDotMuaThemChoDuyet`). */
  soDotMuaThemChoDuyet?: number;
}

/** Giai đoạn của bộ: ba mẹ đã duyệt ảnh chỉnh (hoặc xa hơn — in, về, giao). */
export function daQuaBuocDuyet(status: string, giaiDoan: number | null): boolean {
  if (status === "awaiting_approval") return false;
  const ma = trangThaiKhach(status, giaiDoan).ma;
  return ma === "da_chot_cho_in" || ma === "dang_in" || ma === "hinh_da_ve" || ma === "da_giao" || ma === "da_cham_soc";
}

/** Mã trạng thái mà studio CHƯA xác nhận danh sách đợt 1 (hoặc bộ không còn mở). */
const CHUA_XAC_NHAN: ReadonlySet<MaTrangThaiBoAnh> = new Set<MaTrangThaiBoAnh>([
  "moi_nhap",
  "dang_tai",
  "loi_tai",
  "cho_tao_link",
  "san_sang",
  "cho_khach_chon",
  "cho_studio_xac_nhan",
  "het_han",
  "luu_tru",
]);

/** Studio đã xác nhận danh sách (đợt 1 khoá) — từ "Đã chọn hình"/`in_retouch` trở đi. */
export function studioDaXacNhan(status: string, giaiDoan: number | null): boolean {
  return !CHUA_XAC_NHAN.has(trangThaiKhach(status, giaiDoan).ma);
}

export function loaiNutChinh(p: DauVaoNutChinh): LoaiNutChinh {
  if (!p.khoa) return "chot";
  if (p.daChotChoXacNhan) return "sua_danh_sach";
  if (p.status === "awaiting_approval" || (p.soDotMuaThemChoDuyet ?? 0) > 0) return "duyet";
  if (studioDaXacNhan(p.status, p.giaiDoan)) return "chon_them";
  return "xin_sua_lai";
}

/**
 * Lối PHỤ "Nhắn Bean" cạnh nút "Chọn thêm ảnh" khi bộ CHƯA duyệt xong (đang xếp hàng /
 * đang chỉnh): đổi danh sách đã chốt là việc nói chuyện với Bean, không phải nút chính.
 */
export function coLoiNhanBean(p: DauVaoNutChinh): boolean {
  return loaiNutChinh(p) === "chon_them" && !daQuaBuocDuyet(p.status, p.giaiDoan);
}

/** Nhãn nút cho từng loại (không gồm "chot" — chuỗi `vi.gallery.submitCta`). */
export const NHAN_NUT_CHINH = {
  sua_danh_sach: "Sửa danh sách",
  chon_them: "Chọn thêm ảnh",
  xin_sua_lai: "Yêu cầu sửa lại",
  /** Lối phụ (`coLoiNhanBean`). */
  nhan_bean: "Nhắn Bean",
} as const;
