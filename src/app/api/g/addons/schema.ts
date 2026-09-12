import { z } from "zod";

export const CreateAddonSchema = z.object({
  productId: z.string().uuid("productId phải là UUID hợp lệ"),
  quantity: z
    .number({ required_error: "quantity là bắt buộc" })
    .int("quantity phải là số nguyên")
    .positive("quantity phải lớn hơn 0"),
});

export type CreateAddonInput = z.infer<typeof CreateAddonSchema>;
