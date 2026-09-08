/**
 * Vietnamese strings. Source of truth for the key shape — en.ts mirrors it.
 * OWNER: DEV-UI.
 *
 * Voice: address the customer as "ba mẹ". Short, warm, no technical words.
 */

export const vi = {
  common: {
    save: "Lưu",
    cancel: "Huỷ",
    confirm: "Xác nhận",
    back: "Quay lại",
    retry: "Thử lại",
    loading: "Đang tải…",
    saving: "Đang lưu…",
    saved: "Đã lưu",
    unsaved: "Chưa lưu",
    offline: "Mất kết nối — lựa chọn của ba mẹ được giữ và sẽ lưu khi có mạng",
  },
  gallery: {
    pinTitle: "Nhập 4 số cuối số điện thoại đã đăng ký",
    pinSubmit: "Xem album",
    pinWrong: "Mã PIN chưa đúng, ba mẹ còn {n} lần thử",
    pinLocked: "Ba mẹ đã nhập sai quá nhiều lần, vui lòng thử lại sau {m} phút",
    pinHelp: "Không nhớ mã? Ba mẹ gọi {hotline} giúp em nhé",

    filterAll: "Tất cả",
    filterSelected: "Đã chọn",
    filterFavorite: "Yêu thích",
    filterNoted: "Có ghi chú",
    filterUnselected: "Chưa chọn",

    quotaSummary: "Đã chọn {selected}/{quota}",
    quotaExtra: "thêm {count} ảnh = {amount}",
    quotaWarningTitle: "Ảnh này vượt gói của ba mẹ",
    quotaWarningBody: "Mỗi ảnh thêm phụ thu {price}. Ba mẹ vẫn chọn ảnh này chứ?",
    quotaWarningDontAsk: "Không hỏi lại trong lần chọn này",
    quotaHardLimit: "Ba mẹ đã chọn tối đa {max} ảnh cho album này",

    select: "Chọn ảnh này",
    deselect: "Bỏ chọn",
    favorite: "Yêu thích",
    addNote: "Thêm ghi chú chỉnh sửa",
    notePlaceholder: "Ví dụ: làm sáng da bé, xoá vật thể phía sau…",
    noteTags: {
      xoa_mun: "Xoá mụn sữa",
      lam_sang_da: "Làm sáng da",
      xoa_vat_the: "Xoá vật thể lạ",
      cat_cup: "Cắt cúp lại",
      doi_nen: "Đổi nền",
      ghep_mat: "Ghép mắt mở",
    },

    reviewCta: "Xem lại và xác nhận",
    reviewTitle: "Ba mẹ kiểm tra lại giúp em nhé",
    reviewUnusedQuota: "Ba mẹ còn {n} ảnh miễn phí chưa dùng. Chốt luôn ạ?",
    submitCta: "Chốt danh sách",
    submitConfirm: "Sau khi chốt, ba mẹ không đổi được nữa. Chắc chắn chứ ạ?",
    submitAgree: "Em xác nhận danh sách trên là cuối cùng",

    doneTitle: "Cảm ơn ba mẹ!",
    doneBody: "Studio đã nhận danh sách và bắt đầu chỉnh ảnh cho bé.",

    lockedBanner: "Ba mẹ đã chốt ngày {date}. Album đang ở chế độ chỉ xem.",
    expiredTitle: "Link đã hết hạn",
    expiredBody: "Ba mẹ liên hệ studio để được gửi lại link nhé.",
    notFoundTitle: "Không tìm thấy album",
    photoMissing: "Ảnh này không còn khả dụng, ba mẹ liên hệ studio giúp em nhé",
    emptyFilter: "Chưa có ảnh nào trong mục này",
    preparing: "Album đang được chuẩn bị. Studio sẽ báo ba mẹ khi sẵn sàng.",
  },
} as const;

/**
 * Widens string literals to `string` while keeping the key shape, so other
 * locales must supply every key but may use their own wording.
 */
type DeepWiden<T> = T extends string ? string : { [K in keyof T]: DeepWiden<T[K]> };

export type Messages = DeepWiden<typeof vi>;
