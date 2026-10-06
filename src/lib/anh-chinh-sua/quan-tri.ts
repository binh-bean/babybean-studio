/**
 * BB-371 — luật hiển thị màn quản trị cho ảnh chỉnh sửa (hàm thuần, phép thử gọi thẳng).
 */

export const CAU_XAC_NHAN_VA_KHOA = "Danh sách chọn của khách sẽ được xác nhận và khoá";

/**
 * Hộp hỏi lại trước khi "Gửi khách duyệt". Anh chốt 06/10: bộ còn "Chờ xác nhận"
 * (`submitted`) thì nút này xác nhận + khoá danh sách chọn luôn — hộp PHẢI nói rõ điều đó.
 */
export function cauHoiGuiKhach(
  trangThai: string,
  soAnh: number,
): { tieuDe: string; chiTiet: string[]; seXacNhanVaKhoa: boolean } {
  const seXacNhanVaKhoa = trangThai === "submitted";
  const chiTiet = [`Khách sẽ thấy ${soAnh} ảnh chỉnh ngay trong app và nhận thông báo.`];
  if (seXacNhanVaKhoa) {
    chiTiet.unshift(`${CAU_XAC_NHAN_VA_KHOA} — khách không đổi ảnh chọn được nữa.`);
  }
  return { tieuDe: "Gửi ảnh chỉnh cho khách duyệt?", chiTiet, seXacNhanVaKhoa };
}

/**
 * Khối cũ "Vòng duyệt ảnh đã chỉnh" (gửi link Drive, BB-121) chỉ cho bộ KHÔNG có ảnh
 * chỉnh trong app. Bộ có thư mục ảnh chỉnh thì khối mới đã hiện đủ vòng sửa — hiện cả
 * hai là ghi chú xin sửa lặp hai lần.
 *
 * `coAnhChinhTrongApp = null` (chưa tải xong / tải hỏng) → giữ khối cũ: thà lặp còn
 * hơn mất đường gửi link Drive.
 */
export function hienKhoiVongDuyetCu(p: {
  status: string;
  soVongSua: number;
  coAnhChinhTrongApp: boolean | null;
}): boolean {
  if (p.coAnhChinhTrongApp === true) return false;
  return p.status === "in_retouch" || p.status === "awaiting_approval" || p.soVongSua > 0;
}

/**
 * BB-375 — `revision_requests.note` là bản GHÉP (`ghepGhiChu`): ghi chú chung + một dòng
 * "• <tên tấm>: <ghi chú>" cho từng tấm. Khi bảng chi tiết (0091) có từng tấm thì khối quản
 * trị đã vẽ ghi chú của tấm ngay dưới ảnh — vẽ thêm cả bản ghép là ghi chú xin sửa hiện HAI
 * lần. Trả phần ghi chú CHUNG: bỏ đúng các dòng của những tấm đã có trong `tenCacTam`.
 * Dòng của tấm KHÔNG có trong chi tiết (ghi hụt) vẫn giữ — không để mất chữ khách viết.
 */
export function ghiChuChungCuaVong(note: string, tenCacTam: readonly string[]): string {
  if (tenCacTam.length === 0) return note;
  return note
    .split("\n")
    .filter((dong) => !tenCacTam.some((ten) => dong.startsWith(`• ${ten}: `)))
    .join("\n")
    .trim();
}
