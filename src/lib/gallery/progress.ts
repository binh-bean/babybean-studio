import { GalleryStatus } from "@/types/domain";

export type CustomerProgressStep = 1 | 2 | 3 | 4 | 5 | 6;

export function getCustomerProgressStep(status: GalleryStatus): CustomerProgressStep {
  switch (status) {
    case "draft":
    case "syncing":
    case "sync_error":
      return 1; // 1. Đã chụp xong
    case "ready":
      return 2; // 2. Ảnh đã sẵn sàng, mời bạn chọn
    case "in_review":
    case "expired":
      return 3; // 3. Bạn đang chọn ảnh
    case "submitted":
      return 4; // 4. Đã chốt, đang chỉnh ảnh
    case "in_retouch":
      return 5; // 5. Ảnh chỉnh xong
    case "delivered":
    case "archived":
      return 6; // 6. Đang in và giao
    default:
      return 1;
  }
}
