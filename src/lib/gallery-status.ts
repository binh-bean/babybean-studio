/**
 * Trạng thái bộ ảnh: một chỗ duy nhất.
 *
 * OWNER: PM. Task BB-121.
 * Spec: docs/16 mục 4b
 *
 * ---------------------------------------------------------------------------
 * Vì sao phải gom
 * ---------------------------------------------------------------------------
 * Danh sách "trạng thái nào thì khoá lựa chọn" từng nằm ở BỐN chỗ: thân hàm
 * `patch_selection_batch`, route ảnh của khách, màn khách, màn CSKH. BB-121
 * thêm hai trạng thái `awaiting_approval` và `approved`; SQL được sửa, ba chỗ
 * TypeScript thì không — nên màn hình vẫn hiện nút sửa, bấm vào thì API trả
 * GALLERY_LOCKED, và nhân viên tưởng hệ thống hỏng.
 *
 * Bên SQL đã gom vào `app.gallery_is_locked()` ở migration 0033. File này là
 * bản tương ứng bên TypeScript. Hai bản phải khớp nhau — sửa một bên thì sửa
 * cả bên kia; đó là lý do danh sách dưới đây ghi chú kèm số migration.
 */

/**
 * TẤT CẢ trạng thái của bộ ảnh, đúng bằng kiểu enum `gallery_status` trong cơ
 * sở dữ liệu.
 *
 * Trước BB-121 danh sách này nằm ở SÁU chỗ, và mỗi bản thiếu một kiểu khác
 * nhau: `GALLERY_STATUSES` trong types/domain thiếu hai trạng thái mới,
 * `GALLERY_STATUS_VALUES` trong schema lọc danh sách thiếu cả `sync_error` —
 * nên CSKH không lọc được bộ ảnh "chờ khách duyệt", Zod từ chối thẳng giá trị
 * đó. Không bản nào sai to đến mức gây lỗi đỏ; tất cả đều sai âm thầm.
 *
 * Có phép thử so danh sách này với enum thật trong cơ sở dữ liệu.
 */
export const GALLERY_STATUSES = [
  "draft",
  "syncing",
  "sync_error",
  "ready",
  "in_review",
  "submitted",
  "in_retouch",
  "awaiting_approval",
  "approved",
  "delivered",
  "expired",
  "archived",
] as const;

export type GalleryStatusValue = (typeof GALLERY_STATUSES)[number];

/**
 * Khách không sửa lựa chọn được nữa.
 *
 * Phải khớp `app.gallery_is_locked()` CHÍNH XÁC — có phép thử so từng giá trị
 * enum giữa hai bên (tests/unit/gallery-status-khop-sql.test.ts). Chính phép
 * thử đó tìm ra `expired`: bản TypeScript coi là khoá, bản SQL thì không, nên
 * bộ ảnh hết hạn vẫn đổi được lựa chọn. Migration 0035 vá bên SQL.
 */
export const LOCKED_STATUSES = [
  /*
    'submitted' CỐ Ý KHÔNG có ở đây — xem migration 0060.

    Chủ studio 22/09/2026: "mở tự do cho tới khi nhân sự chốt". Ba mẹ bấm Chốt
    xong, mở lại thấy thiếu tấm bà nội thích, thì vẫn thêm được — lúc đó CSKH
    còn chưa xem tới bộ ảnh, khoá vào lúc ấy không bảo vệ gì mà chỉ tạo ra một
    cuộc gọi. Mốc khoá thật là lúc CSKH XÁC NHẬN và chuyển cho thợ chỉnh ảnh.
  */
  "in_retouch",
  "awaiting_approval",
  "approved",
  "delivered",
  "archived",
  "expired",
] as const;

export function isGalleryLocked(status: string): boolean {
  return (LOCKED_STATUSES as readonly string[]).includes(status);
}

/**
 * Khách đã chốt chọn ảnh — dùng để quyết định hiển thị con số đã chụp lại
 * (snapshot) thay vì đếm sống.
 *
 * KHÔNG cùng danh sách với khoá: bộ ảnh hết hạn thì khoá, nhưng hết hạn không
 * có nghĩa là khách đã chốt. Lấy snapshot của một bộ khách chưa chốt thì ra
 * số 0, và màn hình báo khách chọn 0 ảnh.
 */
export function isSubmittedOrLater(status: string): boolean {
  // Danh sách RIÊNG, không dẫn xuất từ `isGalleryLocked` nữa: từ 0060 'chốt'
  // và 'khoá' là hai mốc khác nhau. Dẫn xuất thì bộ ảnh vừa chốt sẽ bị coi là
  // "chưa chốt", và màn hình lấy số đếm sống thay vì số đã chụp lại.
  return ["submitted", "in_retouch", "awaiting_approval", "approved", "delivered", "archived"]
    .includes(status);
}

/** Nhãn tiếng Việt. Không ai ngoài lập trình viên đọc được tên trong máy. */
export const GALLERY_STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  syncing: "Đang tải ảnh",
  sync_error: "Tải ảnh lỗi",
  ready: "Sẵn sàng gửi khách",
  in_review: "Khách đang chọn ảnh",
  reopened: "Đã mở lại cho khách chọn",
  submitted: "Khách đã chốt, chờ xác nhận",
  in_retouch: "Đang chỉnh ảnh",
  awaiting_approval: "Chờ khách duyệt ảnh đã chỉnh",
  approved: "Khách đã duyệt, chuyển in",
  expired: "Link đã hết hạn",
  delivered: "Đã giao",
  archived: "Đã lưu trữ",
};
