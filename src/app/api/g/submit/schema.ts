import { z } from "zod";

export const SubmitSelectionSchema = z.object({
  confirmedByName: z.string().trim().min(1, "Vui lòng nhập tên người xác nhận"),
  agreed: z.literal(true, {
    errorMap: () => ({ message: "Bạn cần đồng ý với điều khoản chốt ảnh" }),
  }),
  generalNote: z.string().max(1000, "Ghi chú tối đa 1000 ký tự").optional(),
});

export type SubmitSelectionInput = z.infer<typeof SubmitSelectionSchema>;
