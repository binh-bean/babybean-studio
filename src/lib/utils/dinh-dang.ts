/**
 * Định dạng dùng chung cho MÀN KHÁCH — BB-287.
 *
 * Trước bản vá, mỗi màn tự viết ngày/kích thước theo cách riêng:
 *   - `toLocaleDateString("vi-VN")` in ra "27/9/2026" (KHÔNG có số 0 đệm),
 *     trong khi quản trị và bản vẽ đều dùng "27/09/2026".
 *   - Kích thước sản phẩm lẫn cả "x" ("40x60") lẫn "×" ("15×21") tuỳ nơi gõ.
 *
 * Hai hàm dưới đây là NGUỒN DUY NHẤT cho hai việc này trên màn khách — đổi
 * định dạng thì chỉ sửa ở đây, không tự viết `toLocaleDateString` hay nối
 * chuỗi kích thước ở nơi khác.
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
