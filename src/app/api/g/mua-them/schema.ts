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

/** SĐT Việt Nam 10 số, bắt đầu bằng 0 — cùng luật với ô nhập của viewer. */
const SDT_VN_RE = /^0[0-9]{9}$/;

export const CreateYeuCauMuaThemSchema = z.object({
  items: z
    .array(DongYeuCauSchema)
    .min(1, "Cần ít nhất một sản phẩm")
    .max(10, "Mỗi lượt gửi tối đa 10 sản phẩm"),
  /**
   * BB-254 — tên/SĐT người THỰC SỰ gửi yêu cầu. BẮT BUỘC khi phiên là
   * 'viewer' (ông bà/người thân) để CSKH gọi lại đúng người, chứ không phải
   * ba mẹ đứng hợp đồng. Route tự kiểm lại theo `session.role`, không tin
   * mỗi cái schema optional này — xem `route.ts`.
   */
  tenNguoiMua: z.string().trim().min(1, "Tên người mua không được để trống").max(100).nullish(),
  sdtNguoiMua: z
    .string()
    .trim()
    .regex(SDT_VN_RE, "Số điện thoại phải là số Việt Nam hợp lệ (10 số, bắt đầu bằng 0)")
    .nullish(),
});

export type CreateYeuCauMuaThemInput = z.infer<typeof CreateYeuCauMuaThemSchema>;
