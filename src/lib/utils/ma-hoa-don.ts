/**
 * BB-369 mục 4 (chủ studio 06/10/2026, ảnh de6ab031/af58bce5): trang khách hiện
 * "Lịch sử chụp (1)" với một bộ tên "Album · HD_…#5034_12576,HD_…#5034_12772",
 * chữ dài không ngắt, chồng lên nhãn trạng thái.
 *
 * Điều tra bb-dev (chỉ đọc, 06/10): 2 bộ có tên kiểu này; cả hai là MỘT dòng
 * Hậu Kỳ, MỘT hoá đơn — phần `_12576`, `_12772` là số thứ tự DÒNG CHI TIẾT của
 * hợp đồng (ô tra cứu "Hợp đồng chi tiết" nhiều giá trị, Lark nối bằng dấu
 * phẩy). `syncSingleRetouchRecord` lấy nhầm ô đó làm mã hợp đồng. Không phải
 * nhiều buổi chụp bị gộp.
 *
 * Hàm thuần: tách chuỗi đó thành danh sách MÃ HOÁ ĐƠN (bỏ đuôi `_<stt>`, bỏ trùng).
 */
const MAU_MA = /HD_\d{6,8}#\d+/gi;

/** "HD_20260907#5034_12576,HD_20260907#5034_12772" → ["HD_20260907#5034"]. */
export function tachMaHoaDon(...nguon: Array<string | null | undefined>): string[] {
  const ra: string[] = [];
  for (const chu of nguon) {
    if (!chu) continue;
    const thay = chu.match(MAU_MA);
    const ds = thay && thay.length > 0 ? thay : [];
    for (const m of ds) {
      const ma = m.toUpperCase();
      if (!ra.includes(ma)) ra.push(ma);
    }
  }
  return ra;
}

/**
 * Tên bộ ảnh để hiển thị: phần chữ trước mã ("Album") + danh sách mã hoá đơn
 * riêng từng cái. Tên không có mã nào thì giữ nguyên.
 */
export function tachTieuDeBoAnh(title: string, maHopDong: string[] = []): { nhan: string; ma: string[] } {
  const ma = tachMaHoaDon(...maHopDong, title);
  if (ma.length === 0) return { nhan: title, ma: [] };
  const nhan = title
    .replace(/HD_\d{6,8}#\d+(_\d+)?/gi, "")
    .replace(/[,+]/g, " ")
    .replace(/\s*·\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*·$/, "");
  return { nhan: nhan || "Bộ ảnh", ma };
}

/**
 * BB-392 mục 3b — tên bộ để HIỂN THỊ ở màn quản trị (danh sách bộ ảnh, Việc cần
 * xử lý, Bàn làm việc, chi tiết bộ, thẻ Lark). Bộ cũ còn dính đuôi số dòng chi
 * tiết hoá đơn ("Album · HD_20260910#5074_12654,HD_20260910#5074_12886") →
 * "Album · HD_20260910#5074". Chỉ hiển thị — KHÔNG sửa dữ liệu. Tên không có mã
 * hoá đơn thì giữ nguyên từng chữ.
 */
export function hienTieuDeBoAnh(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (!t) return t;
  const { nhan, ma } = tachTieuDeBoAnh(t);
  if (ma.length === 0) return t;
  // Tên chỉ có mã (không nhãn chữ) → chỉ mã, không bịa "Bộ ảnh · …".
  const conChu = t.replace(/HD_\d{6,8}#\d+(_\d+)?/gi, "").replace(/[,+·\s]/g, "");
  return conChu ? `${nhan} · ${ma.join(" + ")}` : ma.join(" + ");
}
