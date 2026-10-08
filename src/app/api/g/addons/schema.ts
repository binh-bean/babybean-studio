import { vi } from "@/i18n";
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
    .max(99, vi.gallery.loiBean.toiDa99),

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

  /**
   * BB-279 — đặt cùng lúc nhiều tấm (lưới chọn ảnh trong cửa hàng, hoặc "Đặt
   * in tấm này" từ màn xem lớn không dùng nhánh này, chỉ dùng `photoId` đơn).
   *
   * Có mặt thì route dùng NHÁNH BATCH: ghi một dòng `selection_addons`/tấm,
   * cùng `quantity`, bỏ qua `photoId` đơn. Trần 50 tấm một lượt — khớp trần
   * dòng giỏ một lần gọi theo đề bài BB-279; nhiều hơn thì gọi thêm lượt.
   */
  photoIds: z
    .array(z.string().uuid("mỗi phần tử của photoIds phải là UUID hợp lệ"))
    .min(1, "photoIds không được rỗng nếu có mặt")
    .max(50, "Mỗi lượt chỉ đặt tối đa 50 tấm")
    .optional(),

  /**
   * BB-398 — KHUNG GẮN DÒNG IN: id dòng `selection_addons` (ảnh in) mà khung này bọc
   * ("Đóng khung ảnh đã đặt in"). Chỉ dùng với sản phẩm khung; route tự lấy `photo_id`
   * của dòng in (bỏ qua `photoId` gửi lên) và kiểm `kiemKhungGanIn`. Không dùng chung
   * với `photoIds`.
   */
  ganVoiAddonId: z.string().uuid("ganVoiAddonId phải là UUID hợp lệ").nullish(),
});

export type CreateAddonInput = z.infer<typeof CreateAddonSchema>;
