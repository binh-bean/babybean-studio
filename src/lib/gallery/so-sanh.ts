/**
 * So sánh nhiều tấm (BB-218) — toán thuần: thêm/bớt danh sách so sánh và chọn
 * bố cục theo số tấm + hướng màn.
 *
 * OWNER: DEV-FE.
 *
 * Lời chủ studio (24/09/2026): "So sánh hai tấm cạnh nhau — có thể cạnh nhau
 * hoặc không cạnh nhau nếu khách hàng muốn. Ví dụ chọn quá nhiều cần bỏ bớt."
 * Tức ba mẹ chọn BẤT KỲ 2–4 tấm trong lưới (không cần liền nhau), xem chúng
 * cạnh nhau, và bỏ bớt ngay tại đó.
 *
 * Tách khỏi `so-sanh-anh.tsx` vì đây là phần TOÁN THUẦN (không đụng DOM),
 * nên phép thử chạy được không cần trình duyệt — cùng lý do với `phong-anh.ts`.
 */

/** Ít hơn 2 tấm thì không còn gì để so sánh. */
export const SO_SANH_TOI_THIEU = 2;
/** Chủ studio không nói số cụ thể, nhưng màn hình chỉ có chỗ cho lưới 2×2 —
 * quá 4 tấm thì mỗi tấm còn quá nhỏ để so sánh cho ra so sánh. */
export const SO_SANH_TOI_DA = 4;

/**
 * Thêm một tấm vào danh sách so sánh.
 *
 * Đã có trong danh sách thì không thêm trùng (bấm lại một tấm đang so sánh
 * không được nhân đôi nó). Đã đủ tối đa thì bỏ qua, giữ nguyên danh sách —
 * chỗ gọi hàm này quyết định có báo cho ba mẹ biết hay không.
 */
export function themVaoSoSanh(ds: readonly string[], id: string): string[] {
  if (ds.includes(id)) return [...ds];
  if (ds.length >= SO_SANH_TOI_DA) return [...ds];
  return [...ds, id];
}

/** Bỏ một tấm khỏi danh sách so sánh. Không có trong danh sách thì không đổi gì. */
export function boKhoiSoSanh(ds: readonly string[], id: string): string[] {
  return ds.filter((x) => x !== id);
}

/** Đã đủ tối đa 4 tấm — dùng để khoá thêm ở lưới hoặc báo cho ba mẹ biết. */
export function daDuSoSanh(ds: readonly string[]): boolean {
  return ds.length >= SO_SANH_TOI_DA;
}

/** Đủ tối thiểu 2 tấm để mở màn so sánh. */
export function duSoSanh(ds: readonly string[]): boolean {
  return ds.length >= SO_SANH_TOI_THIEU;
}

export type BoCucSoSanh = "doc" | "ngang" | "luoi";

/**
 * Bố cục màn so sánh theo lời chủ studio:
 * - 2 tấm: điện thoại dọc xếp TRÊN/DƯỚI (đúng chiều khách đang cầm máy);
 *   màn ngang hoặc máy tính xếp TRÁI/PHẢI (đủ rộng để đặt cạnh nhau).
 * - 3–4 tấm: luôn lưới 2×2, không phụ thuộc hướng màn — xếp trên/dưới hay
 *   trái/phải với 3-4 tấm đều làm mỗi tấm quá nhỏ hoặc quá dài một chiều.
 */
export function boCucSoSanh(soTam: number, manHinhDoc: boolean): BoCucSoSanh {
  if (soTam <= SO_SANH_TOI_THIEU) return manHinhDoc ? "doc" : "ngang";
  return "luoi";
}
