/**
 * BB-349 — phần dùng chung giữa máy chủ (payments/route.ts, xac-nhan-danh-sach.ts) và
 * form thu tiền ở trình duyệt. Không `server-only`, không gọi mạng.
 */

/** Trạng thái để form thu tiền biết có cho "xác nhận + khoá" không và có phải cảnh báo không. */
export interface KhoaKhiThu {
  /** Có danh sách để khoá cùng lúc ghi thu. */
  coTheKhoa: boolean;
  /** Bộ (hoặc đợt) đã được mở lại và khách CHƯA gửi lại — số tiền có thể đổi. */
  dangMoLai: boolean;
  /** Đợt sẽ được xác nhận: 1 = danh sách chính, ≥ 2 = đợt mua thêm. null = không có gì để khoá. */
  soDot: number | null;
}

/** Câu cảnh báo khi khách đang sửa lại danh sách (form thu tiền + câu lỗi của máy chủ). */
export const CAU_KHACH_DANG_SUA =
  "Khách đang sửa lại danh sách, chưa gửi lại — số tiền có thể thay đổi; xác nhận lúc này sẽ KHOÁ theo danh sách khách đang chọn.";

