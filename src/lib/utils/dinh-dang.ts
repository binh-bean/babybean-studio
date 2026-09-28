/**
 * Định dạng dùng chung — BB-287 (ban đầu cho màn khách, nay dùng chung cả
 * quản trị: `customers-manager.tsx`, `gallery-detail.tsx` đã import từ đây).
 *
 * Trước bản vá, mỗi màn tự viết ngày/kích thước theo cách riêng:
 *   - `toLocaleDateString("vi-VN")` in ra "27/9/2026" (KHÔNG có số 0 đệm),
 *     trong khi quản trị và bản vẽ đều dùng "27/09/2026".
 *   - Kích thước sản phẩm lẫn cả "x" ("40x60") lẫn "×" ("15×21") tuỳ nơi gõ.
 *
 * Các hàm dưới đây là NGUỒN DUY NHẤT cho những việc này — đổi định dạng thì
 * chỉ sửa ở đây, không tự viết `toLocaleDateString` hay nối chuỗi ở nơi khác.
 */

/** "27/9/2026" -> "27/09/2026". Nhận Date hoặc chuỗi ISO. */
export function formatNgayVN(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  const ngay = String(d.getDate()).padStart(2, "0");
  const thang = String(d.getMonth() + 1).padStart(2, "0");
  const nam = d.getFullYear();
  return `${ngay}/${thang}/${nam}`;
}

/**
 * Chuẩn hoá kích thước in ("10x15", "10 x 15", "10×15") về một dạng duy nhất
 * "10×15" — dấu nhân đúng kiểu in ấn, không phải chữ "x" của bàn phím.
 */
export function formatKichThuoc(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/(\d)\s*[xX]\s*(\d)/g, "$1×$2");
}

/**
 * BB-303 (bản vẽ BB-301) — số điện thoại Việt Nam 10 số hiển thị theo nhóm
 * 4-3-3 ("0901000001" -> "0901 000 001"), thay cho chuỗi liền hoặc font-mono
 * đơn cách — đúng cách người ta đọc số cho nhau qua điện thoại.
 *
 * Chỉ định dạng khi CHẮC là 10 chữ số (đầu số di động/cố định VN sau chuẩn
 * hoá 2018). Số khác độ dài (số bàn cũ, số nước ngoài, dữ liệu bẩn) trả
 * NGUYÊN VĂN — bịa nhóm cho một số không phải 10 số là hiển thị sai còn tệ
 * hơn không định dạng gì.
 */
export function formatSdt(input: string | null | undefined): string {
  if (!input) return "";
  const so = input.replace(/\D/g, "");
  if (so.length !== 10) return input;
  return `${so.slice(0, 4)} ${so.slice(4, 7)} ${so.slice(7, 10)}`;
}
