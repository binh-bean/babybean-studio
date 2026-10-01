/**
 * BB-339 — BẢNG GIÁ anh gửi ngày 01/10/2026: danh sách (chất liệu, kích thước)
 * ĐƯỢC BÁN cho khách.
 *
 * Anh chốt: **"App ẩn theo bảng giá"** — khách chỉ thấy sản phẩm CÓ trong bảng
 * này, kể cả khi Lark còn ghi "đang kinh doanh" (vd Gỗ 120×180, Tráng gương
 * 15×21, Khung kim loại — có trên Lark nhưng không có trong bảng → ẨN).
 *
 * File này CHỈ quyết định MÓN NÀO được bán. GIÁ vẫn lấy từ Lark
 * (`products.list_price`, đồng bộ bằng `sync:catalog`) — KHÔNG ghi giá ở đây.
 * Ngày 01/10 đối chiếu: mọi cặp có trong cả bảng lẫn DB đều khớp giá.
 *
 * Tên chất liệu trong bảng của anh khác tên trên Lark/DB ở vài chỗ:
 *   "Kim Tuyến"        ↔ "Cavas/Kim tuyến"
 *   "Khung Hàn Quốc"   ↔ "Khung HQ"
 *   "Tờ (Ultra HD)"    ↔ "tờ Album (Ultra HD)"
 *   "Tráng Gương", "Thủy Tinh" ↔ "Tráng gương", "Thủy tinh" (khác hoa/thường)
 * — so khớp bằng `chatLieuTheoBangGia()` (bỏ dấu, chữ thường).
 *
 * Có trong bảng nhưng CHƯA có trên Lark/DB (anh cần thêm bên Lark): Mica HD
 * 100×150 và 120×180. Thêm xong và đồng bộ là tự hiện — không cần sửa file này.
 */

/** Chất liệu (tên trong bảng của anh) → các kích thước được bán. */
export const BANG_GIA_01_10: Readonly<Record<string, readonly string[]>> = {
  UV: ["10x15", "13x18", "15x21", "20x30"],
  "Gỗ": ["15x21", "20x30", "30x45", "35x50", "40x60", "50x75", "60x90", "70x110", "80x120", "100x150"],
  "Kim Tuyến": ["30x45", "35x50", "40x60", "50x75", "60x90", "70x110", "80x120"],
  "Tráng Gương": ["20x30", "30x45", "35x50", "40x60", "50x75", "60x90", "70x110", "80x120"],
  "Thủy Tinh": ["35x50", "40x60", "50x75", "60x90", "70x110", "80x120"],
  "Mica HD": ["40x60", "50x75", "60x90", "70x110", "80x120", "100x150", "120x180"],
  "Album (Ultra HD)": ["15x21", "20x20", "25x25", "20x30", "30x30"],
  "Tờ (Ultra HD)": ["15x21", "20x20", "25x25", "20x30", "30x30"],
  "Khung Hàn Quốc": ["15x21", "20x30", "30x45", "35x50", "40x60", "50x75", "60x90", "70x110", "80x120", "100x150"],
};

function boDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tên chất liệu trên Lark/DB → tên chất liệu trong bảng giá của anh, hoặc
 * `null` khi chất liệu đó không có trong bảng (vd "Khung kim loại").
 */
export function chatLieuTheoBangGia(material: string | null): string | null {
  const m = boDau(material ?? "");
  if (!m) return null;
  if (m.includes("kim tuyen")) return "Kim Tuyến";
  if (m === "khung hq" || m === "khung han quoc") return "Khung Hàn Quốc";
  if (m === "to album (ultra hd)" || m === "to (ultra hd)") return "Tờ (Ultra HD)";
  for (const ten of Object.keys(BANG_GIA_01_10)) {
    if (boDau(ten) === m) return ten;
  }
  return null;
}

/** "40 X 60", "40×60" → "40x60". */
function chuanHoaKichThuoc(size: string | null): string {
  return (size ?? "").toLowerCase().replace(/×/g, "x").replace(/\s+/g, "");
}

/** Cặp (chất liệu, kích thước) này có trong bảng giá 01/10 không. */
export function coTrongBangGia(material: string | null, size: string | null): boolean {
  const ten = chatLieuTheoBangGia(material);
  if (!ten) return false;
  const kt = chuanHoaKichThuoc(size);
  if (!kt) return false;
  return (BANG_GIA_01_10[ten] ?? []).includes(kt);
}
