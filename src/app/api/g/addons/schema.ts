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

  /**
   * Ảnh mà sản phẩm này in ra.
   *
   * Chủ studio 22/09/2026: "sản phẩm hậu kỳ muốn mua thêm cần gắn với ảnh
   * chọn". Không gắn thì thợ in nhận được "1 khung gỗ 40x60" mà không biết in
   * tấm nào, và CSKH lại phải gọi hỏi.
   *
   * Để trống chỉ đúng với nhóm KHÔNG gắn ảnh (album gộp nhiều ảnh). Route
   * kiểm lại theo nhóm sản phẩm, không tin vào mỗi cái schema này.
   */
  photoId: z.string().uuid("photoId phải là UUID hợp lệ").nullish(),
});

export type CreateAddonInput = z.infer<typeof CreateAddonSchema>;
