/**
 * Chốt an toàn: kiểm tra xem mã có đang chạy trong phép thử không.
 *
 * Học bằng cách làm hỏng, 21/09/2026: chạy test đẩy dữ liệu và tin nhắn lên hệ thống thật.
 *
 * Cửa thoát: bộ phép thử đã bọc hoặc giả lập fetch thì ĐƯỢC đặt
 * process.env.LARK_CHO_PHEP_GUI_TRONG_PHEP_THU="1" để mã chạy qua chốt này.
 */
export function dangChayPhepThu(): boolean {
  if (process.env.LARK_CHO_PHEP_GUI_TRONG_PHEP_THU === "1") return false;
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
}
