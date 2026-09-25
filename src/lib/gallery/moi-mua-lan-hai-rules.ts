/**
 * Luật "mời mua lần hai", tách khỏi giao diện.
 *
 * OWNER: PM. Task BB-245. Chủ studio chốt:
 *
 *     "Mời mua lần hai khi khách duyệt không yêu cầu chỉnh lại."
 *
 * Dự án chưa có thư viện dựng DOM để thử (xem @/lib/selection/review-rules),
 * nên luật quan trọng tách ra hàm thuần — phép thử gọi đúng hàm mà cả màn
 * hình (`moi-mua-lan-hai.tsx`) lẫn route (`/api/g/mua-them`) cùng dùng.
 */

/** Trạng thái bộ ảnh coi là "đã duyệt" — mở cửa cho thẻ mời mua lần hai. */
const TRANG_THAI_DA_DUYET = ["approved", "delivered"] as const;

/**
 * Có nên mời mua lần hai không?
 *
 * Hai điều kiện, cả hai đều bắt buộc:
 *   1. Bộ ảnh đã DUYỆT (`approved`/`delivered`) — không phải chỉ "đã khoá".
 *      `in_retouch`/`awaiting_approval`/`submitted` cũng khoá nhưng khách
 *      chưa hề nói "tôi ưng bộ ảnh này".
 *   2. KHÔNG có vòng xin sửa nào (`soVongSua === 0`). Có vòng sửa nghĩa là
 *      lần đầu khách chưa ưng — "mời mua lần hai" chỉ đúng khi khách ưng ý
 *      ngay từ đầu.
 */
export function duocMoiMuaLanHai(status: string, soVongSua: number): boolean {
  return (TRANG_THAI_DA_DUYET as readonly string[]).includes(status) && soVongSua === 0;
}
