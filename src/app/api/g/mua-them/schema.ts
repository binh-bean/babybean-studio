import { z } from "zod";

/**
 * Một dòng yêu cầu mua thêm. KHÔNG phải đơn hàng — CSKH gọi lại chốt giá và
 * thanh toán ngoài app (BB-245). `soLuong` là số lượng MONG MUỐN gửi kèm yêu
 * cầu, không phải "đặt số lượng" như `/api/g/addons` (bảng này chỉ INSERT,
 * không có luật một sản phẩm một dòng).
 */
const DongYeuCauSchema = z.object({
  productId: z.string().uuid("productId phải là UUID hợp lệ"),
  /**
   * Tấm ảnh cần in/đóng khung. Bắt buộc với nhóm gắn ảnh (ảnh in, khung) —
   * route kiểm lại theo nhóm sản phẩm (@/lib/products/nhom-san-pham), không
   * tin vào mỗi cái schema này.
   */
  photoId: z.string().uuid("photoId phải là UUID hợp lệ").nullish(),
  soLuong: z
    .number({ required_error: "soLuong là bắt buộc" })
    .int("soLuong phải là số nguyên")
    .min(1, "soLuong tối thiểu 1")
    .max(20, "soLuong tối đa 20 — nhiều hơn thì ba mẹ nhắn thẳng CSKH giúp em"),
  ghiChu: z.string().max(500, "Ghi chú tối đa 500 ký tự").nullish(),
});

export const CreateYeuCauMuaThemSchema = z.object({
  items: z
    .array(DongYeuCauSchema)
    .min(1, "Cần ít nhất một sản phẩm")
    .max(10, "Mỗi lượt gửi tối đa 10 sản phẩm"),
});

export type CreateYeuCauMuaThemInput = z.infer<typeof CreateYeuCauMuaThemSchema>;
