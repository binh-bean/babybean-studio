/**
 * Sáu bước khách nhìn thấy trên dải tiến trình.
 *
 * OWNER: PM. Task BB-121.
 * Spec: docs/16 mục 5
 *
 * ---------------------------------------------------------------------------
 * Vì sao switch này phải VÉT HẾT
 * ---------------------------------------------------------------------------
 * Bản trước có `default: return 1` và một nhánh `case "reopened"` — mà
 * `reopened` không hề có trong kiểu enum. Hậu quả: bộ ảnh `awaiting_approval`
 * rơi vào `default`, khách đang chờ duyệt ảnh đã chỉnh thì màn hình báo
 * "đã chụp xong" — lùi bốn bước.
 *
 * Bỏ `default` và thêm phép kiểm `never` ở cuối: thêm trạng thái vào enum mà
 * quên file này thì KHÔNG BIÊN DỊCH ĐƯỢC. Cổng lúc biên dịch chắc hơn phép
 * thử, vì không ai quên chạy trình biên dịch.
 */

import type { GalleryStatus } from "@/types/domain";

export type CustomerProgressStep = 1 | 2 | 3 | 4 | 5 | 6;

export function getCustomerProgressStep(status: GalleryStatus): CustomerProgressStep {
  switch (status) {
    case "draft":
    case "syncing":
    case "sync_error":
      return 1; // 1. Đã chụp xong

    case "ready":
      return 2; // 2. Ảnh đã sẵn sàng, mời ba mẹ chọn

    case "in_review":
    // Hết hạn thì khách vẫn đang ở bước chọn, chỉ là không thao tác được nữa.
    // Lùi về bước 1 sẽ như thể buổi chụp chưa từng xảy ra.
    case "expired":
      return 3; // 3. Ba mẹ đang chọn ảnh

    case "submitted":
      return 4; // 4. Đã chốt, đang chỉnh ảnh

    case "in_retouch":
    // Chờ khách duyệt vẫn nằm ở bước "ảnh chỉnh xong": việc đang nằm ở phía
    // khách, chưa chuyển sang in.
    case "awaiting_approval":
      return 5; // 5. Ảnh chỉnh xong

    case "approved":
    case "delivered":
    case "archived":
      return 6; // 6. Đang in và giao
  }

  // Không tới được nếu switch đã vét hết. Nếu enum thêm giá trị mới, dòng này
  // là chỗ trình biên dịch báo lỗi.
  const chuaXuLy: never = status;
  throw new Error(`Trạng thái bộ ảnh chưa xử lý: ${String(chuaXuLy)}`);
}
