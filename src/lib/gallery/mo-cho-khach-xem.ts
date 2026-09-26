/**
 * Bộ ảnh còn "mở cho khách xem" hay không — tách khỏi giao diện, cùng khuôn
 * với `moi-mua-lan-hai-rules.ts` (BB-245).
 *
 * OWNER: PM. Task BB-254.
 *
 * ---------------------------------------------------------------------------
 * Vì sao KHÔNG dùng `isGalleryLocked`
 * ---------------------------------------------------------------------------
 * `isGalleryLocked` (src/lib/gallery-status.ts) trả lời "ba mẹ còn SỬA lựa
 * chọn được không" — khoá từ `in_retouch` trở đi. Câu hỏi ở đây khác: "ông
 * bà/người thân còn XEM và MUA THÊM được không". Chủ studio chốt 26/09/2026:
 * ông bà mua thêm KHÔNG cần điều kiện "đã duyệt" của ba mẹ (khác hẳn luật
 * BB-245 `duocMoiMuaLanHai`) — chỉ cần bộ ảnh chưa hết hạn/lưu trữ. Dùng
 * `isGalleryLocked` ở đây sẽ chặn nhầm ông bà ngay từ lúc `in_retouch`, trước
 * khi ba mẹ kịp duyệt gì cả.
 *
 * Chỉ hai trạng thái đóng cửa thật sự: `expired` (link hết hạn — nhưng bản
 * thân phiên khách đã bị `assertShareLinkUsable` chặn trước khi tới đây) và
 * `archived` (studio đã lưu trữ, không còn phục vụ khách nữa).
 */

const TRANG_THAI_DONG = ["expired", "archived"] as const;

export function dangMoChoKhachXem(status: string): boolean {
  return !(TRANG_THAI_DONG as readonly string[]).includes(status);
}
