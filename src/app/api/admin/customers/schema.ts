/**
 * Request schemas cho /api/admin/customers.
 *
 * OWNER: DEV-BE. Task BB-061.
 */

import { z } from "zod";

/**
 * Số điện thoại: chỉ chặn thứ rõ ràng là rác, không ép một khuôn.
 *
 * Trong bảng thật đang có "(415)62440454" — khách Việt kiều. Ép regex 10 số
 * kiểu Việt Nam là CSKH không sửa nổi hồ sơ những khách đó nữa. Cột
 * `phone_normalized` (chỉ giữ chữ số) mới là thứ dùng để so trùng và tra cứu,
 * nên định dạng người ta gõ vào không quan trọng — miễn có đủ chữ số.
 */
const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === "" || v.replace(/\D/g, "").length >= 8, {
    message: "Số điện thoại phải có ít nhất 8 chữ số",
  });

export const UpdateCustomerSchema = z
  .object({
    fullName: z.string().trim().min(1, "Tên khách không được để trống").max(120).optional(),
    phone: phoneSchema.nullable().optional(),
    email: z.string().trim().email("Email không hợp lệ").max(120).nullable().optional(),
    zalo: z.string().trim().max(30).nullable().optional(),
    address: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Không có gì để đổi" });

export const BabySchema = z.object({
  fullName: z.string().trim().min(1, "Tên bé không được để trống").max(120),
  nickname: z.string().trim().max(60).nullable().optional(),
  /** Ngày sinh là chìa khoá cho chiến dịch nhắc sinh nhật (docs/03 mục 2.2). */
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày sinh phải dạng YYYY-MM-DD")
    .nullable()
    .optional(),
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const UpdateBabySchema = BabySchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "Không có gì để đổi" },
);

export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;
export type BabyInput = z.infer<typeof BabySchema>;
