import { z } from "zod";

/**
 * Ba mẹ mời một người thân (BB-254) — chỉ cần một nhãn để nhận ra ai giữ
 * link nào ("Bà nội", "Cậu Ba"…). Không thu thập gì khác: người thân không
 * có tài khoản, không cần liên hệ ở bước này.
 */
export const MoiNguoiThanSchema = z.object({
  nhan: z
    .string({ required_error: "Nhãn là bắt buộc" })
    .trim()
    .min(1, "Nhãn không được để trống")
    .max(40, "Nhãn tối đa 40 ký tự"),
});

export type MoiNguoiThanInput = z.infer<typeof MoiNguoiThanSchema>;
