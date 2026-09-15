/**
 * Lightbox utilities & memory management — BB-143.
 * OWNER: DEV-FE.
 *
 * Đảm bảo màn xem ảnh lớn:
 * 1. Giữ cửa sổ trượt (sliding window) nhỏ gọn quanh ảnh đang xem để không phá vỡ
 *    hiệu năng cuộn ảo BB-131 trên bộ 1.235 tấm.
 * 2. Cỡ ảnh đúng hợp đồng chung (THUMBNAIL_WIDTHS: 200, 400, 800, 1600).
 * 3. Nhận diện thao tác vuốt màn hình cảm ứng chính xác.
 */

import { THUMBNAIL_WIDTHS } from "@/types/domain";

/**
 * Tính toán danh sách chỉ số ảnh cần hiển thị/giữ trong DOM (Sliding Window).
 * Mặc định bán kính = 1 (chỉ giữ tấm trước, tấm hiện tại, tấm kế tiếp).
 */
export function getVisibleIndices(
  currentIndex: number,
  total: number,
  radius = 1
): number[] {
  if (total <= 0) return [];
  const safeCurrent = Math.max(0, Math.min(currentIndex, total - 1));
  const indices: number[] = [];

  for (let offset = -radius; offset <= radius; offset++) {
    const idx = safeCurrent + offset;
    if (idx >= 0 && idx < total) {
      indices.push(idx);
    }
  }

  return indices;
}

/**
 * Tạo URL ảnh lớn an toàn theo hợp đồng chung THUMBNAIL_WIDTHS.
 * Mặc định w=2048 cho màn xem lớn chất lượng cao (BB-161).
 */
export function buildLightboxImageUrl(
  photoId: string,
  width: (typeof THUMBNAIL_WIDTHS)[number] = 2048
): string {
  if (!THUMBNAIL_WIDTHS.includes(width)) {
    throw new Error(
      `Cỡ ảnh ${width} không hợp lệ. THUMBNAIL_WIDTHS chỉ chấp nhận: ${THUMBNAIL_WIDTHS.join(", ")}`
    );
  }
  return `/api/img/${photoId}?w=${width}`;
}

/**
 * Tạo srcSet cho màn xem ảnh lớn hỗ trợ màn hình độ phân giải cao và xoay ngang.
 */
export function buildLightboxSrcSet(photoId: string): string {
  return `${buildLightboxImageUrl(photoId, 800)} 800w, ${buildLightboxImageUrl(photoId, 1600)} 1600w`;
}

/**
 * Xác định hướng chuyển ảnh khi vuốt màn hình cảm ứng (Touch Swipe).
 * Chỉ nhận thao tác vuốt khi độ dịch chuyển ngang vượt ngưỡng và lớn hơn độ dịch dọc.
 */
export function calculateSwipeAction(
  deltaX: number,
  deltaY: number,
  threshold = 50
): "next" | "prev" | null {
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) {
    return null;
  }
  return deltaX < 0 ? "next" : "prev";
}
