import { z } from "zod";

export const SubmitSelectionSchema = z.object({
  // BB-276: không có trần trước đây — một chuỗi tuỳ ý dài đi thẳng vào
  // `selections.submitted_by_name` và `activity_logs.actor_label`. Trần 200
  // ký tự đủ cho mọi tên người thật, cùng bậc với `moi-nguoi-than`'s `nhan`.
  confirmedByName: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập tên người xác nhận")
    .max(200, "Tên tối đa 200 ký tự"),
  agreed: z.literal(true, {
    errorMap: () => ({ message: "Bạn cần đồng ý với điều khoản chốt ảnh" }),
  }),
  generalNote: z.string().max(1000, "Ghi chú tối đa 1000 ký tự").optional(),
  /**
   * BB-321 — chốt đợt 1 khi còn THIẾU ảnh so với hạn mức, khách nhờ studio chọn
   * bổ sung. Máy chủ tự tính số ảnh nhờ (không tin số khách gửi) và bỏ qua nếu
   * không còn thiếu.
   */
  nhoStudioChonThem: z.boolean().optional(),
  /**
   * Ô tick "Tôi đồng ý với ảnh studio chọn dùm và không đổi lại" — BẮT BUỘC khi còn thiếu
   * ảnh so với hạn mức (chủ studio 29/09/2026: không có đường chốt thiếu mà không nhờ).
   * Có cờ này thì máy chủ tự ghi lời nhờ; `nhoStudioChonThem` chỉ còn để tương thích.
   */
  dongYAnhStudioChon: z.boolean().optional(),
  /** Ô tick "Tôi biết nếu chưa chọn ảnh in, thời gian nhận ảnh sẽ lâu hơn timeline" — bắt buộc khi còn sản phẩm in chưa gắn ảnh. */
  bietAnhInChamHon: z.boolean().optional(),
});

export type SubmitSelectionInput = z.infer<typeof SubmitSelectionSchema>;
