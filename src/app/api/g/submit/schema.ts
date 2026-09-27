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
});

export type SubmitSelectionInput = z.infer<typeof SubmitSelectionSchema>;
