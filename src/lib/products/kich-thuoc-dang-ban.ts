/**
 * LUẬT GIÁ — sản phẩm nào được bày cho khách và được bán (BB-105 → BB-335).
 *
 * Nguồn giá (scripts/sync-lark-catalog.mjs):
 *   - Cột "Giá Bán" trên bảng danh mục Lark (nhập tay bên Lark) → `list_price`,
 *     `price_confidence = 1`, `price_samples` = số lần bán quan sát được (có thể 0).
 *   - Không có "Giá Bán" → giá QUAN SÁT: mức hay gặp nhất trên hoá đơn;
 *     `price_confidence` = (số lần bán đúng mức đó) / (tổng số lần bán), `price_samples`
 *     = tổng số lần bán. Có giá quan sát thì luôn có ≥ 1 lần bán.
 *
 * BB-105 cũ đòi độ tin cậy ≥ 0,8 VÀ ≥ 5 lần bán. Đo 30/09 (BB-331): mọi giá
 * trên bb-dev đều có độ tin cậy 1,000 — thứ ẩn 70×110, 80×120… là ngưỡng 5 lần
 * bán, không phải giá lệch. Anh chốt 30/09 (BB-335): "hạ ngưỡng + nhập giá".
 *
 * Luật anh chốt 30/09 (sau BB-335): "kích thước kể cả chưa bán nhưng có giá
 * cũng hiện" → bày cho khách khi CÓ GIÁ > 0. Không còn ngưỡng số lần bán hay
 * độ tin cậy. "thieu_mau_gia" giữ trong kiểu cho tương thích, không còn trả ra.
 *
 * Còn đang kinh doanh / không phải canvas là luật riêng (`sanPhamBanChoKhach`):
 * cột "Trạng Thái Sử Dụng" trên Lark = "Ngừng Kinh Doanh" → `is_active = false`
 * (scripts/sync-lark-catalog.mjs) → ẩn.
 * Hàm này dùng chung cho màn khách (/api/g/gallery), ba chỗ ghi tiền
 * (/api/g/addons, /api/g/mua-them, dot-chon-server) và khối "Kích thước đang
 * bán" ở Cài đặt — để chỗ bày và chỗ bán không bao giờ lệch nhau. KHÔNG bịa giá.
 */
export interface GiaSanPham {
  listPrice: number | null;
  priceConfidence: number | null;
  priceSamples: number | null;
}

export type TrangThaiKichThuoc = "khach_thay" | "thieu_mau_gia" | "chua_co_gia";

export function trangThaiKichThuoc(sp: GiaSanPham): TrangThaiKichThuoc {
  const gia = sp.listPrice === null || sp.listPrice === undefined ? NaN : Number(sp.listPrice);
  if (!Number.isFinite(gia) || gia <= 0) return "chua_co_gia";
  return "khach_thay";
}

/** Giá này có được báo cho khách / được ghi vào đơn không. */
export function giaDuocBaoChoKhach(sp: GiaSanPham): boolean {
  return trangThaiKichThuoc(sp) === "khach_thay";
}

/** Tiện cho dòng `products` đọc thẳng từ Supabase (numeric về dạng chuỗi). */
export function giaDuocBaoTuDong(p: {
  list_price: number | string | null;
  price_confidence: number | string | null;
  price_samples: number | null;
}): boolean {
  return giaDuocBaoChoKhach({
    listPrice: p.list_price === null ? null : Number(p.list_price),
    priceConfidence: p.price_confidence === null ? null : Number(p.price_confidence),
    priceSamples: p.price_samples,
  });
}

/** "70x110" → [70, 110] để xếp nhỏ → lớn; không đọc được thì xếp cuối. */
export function khoaXepKichThuoc(size: string | null): [number, number] {
  const m = String(size ?? "").match(/(\d+)\s*[x×]\s*(\d+)/i);
  return m ? [Number(m[1]), Number(m[2])] : [Number.MAX_SAFE_INTEGER, 0];
}
