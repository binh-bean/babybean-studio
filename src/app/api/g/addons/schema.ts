import { z } from "zod";

export const CreateAddonSchema = z.object({
  productId: z.string().uuid("productId phải là UUID hợp lệ"),
  /**
   * SỐ LƯỢNG MONG MUỐN, không phải "thêm bao nhiêu".
   *
   * `0` nghĩa là bỏ mua sản phẩm đó. Trước 22/09/2026 đường này chèn thẳng một
   * dòng mới mỗi lượt gọi, nên bấm dấu cộng ba lần là ba dòng cùng một sản
   * phẩm và hoá đơn tính tiền ba lần — còn giảm hay bỏ thì không có đường nào.
   */
  quantity: z
    .number({ required_error: "quantity là bắt buộc" })
    .int("quantity phải là số nguyên")
    .min(0, "quantity không âm")
    .max(99, "Số lượng tối đa 99 — nhiều hơn thì ba mẹ nhắn CSKH giúp em"),
});

export type CreateAddonInput = z.infer<typeof CreateAddonSchema>;
