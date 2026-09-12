/**
 * Hình thức thu tiền phát sinh: một chỗ duy nhất.
 *
 * OWNER: PM. Task BB-123.
 * Spec: docs/16 mục 6b
 *
 * Chủ studio chốt ngày 12.09.2026: ba chi nhánh **chỉ** thu tiền mặt và
 * chuyển khoản. Bản đầu PM tự thêm quẹt thẻ, ví điện tử và "khác" — mục không
 * bao giờ dùng để trong danh sách chỉ tổ nhân viên chọn nhầm, và một dòng sổ
 * sai hình thức thì báo cáo đối chiếu ngân hàng lệch theo.
 *
 * Để ở đây chứ không chép hai bản: danh sách trạng thái bộ ảnh từng nằm ở sáu
 * chỗ chép tay, mỗi bản thiếu một kiểu khác nhau, và hai trong số đó là lỗ
 * hổng thật. Không lặp lại chuyện đó với danh sách thứ hai.
 */

export const PAYMENT_METHODS = [
  { value: "tien_mat", label: "Tiền mặt" },
  { value: "chuyen_khoan", label: "Chuyển khoản" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export function isPaymentMethod(v: string): v is PaymentMethod {
  return PAYMENT_METHODS.some((m) => m.value === v);
}

/** Nhãn tiếng Việt để hiện lại trên báo cáo. */
export function paymentMethodLabel(v: string): string {
  return PAYMENT_METHODS.find((m) => m.value === v)?.label ?? v;
}
