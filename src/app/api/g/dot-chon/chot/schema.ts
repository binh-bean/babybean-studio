import { vi } from "@/i18n";
import { z } from "zod";

/** Một dòng sản phẩm khách bỏ vào đợt — cùng hình dạng với `/api/g/mua-them`. */
const DongSanPhamSchema = z.object({
  productId: z.string().uuid("productId phải là UUID hợp lệ"),
  photoId: z.string().uuid("photoId phải là UUID hợp lệ").nullish(),
  soLuong: z
    .number({ required_error: "soLuong là bắt buộc" })
    .int("soLuong phải là số nguyên")
    .min(1, "soLuong tối thiểu 1")
    .max(20, vi.gallery.loiBean.toiDa20),
  /** BB-398 vòng 3 — khung gắn một dòng in ĐÃ LƯU (id `selection_addons`); máy chủ kiểm `kiemKhungGanIn`. */
  ganVoiAddonId: z.string().uuid("ganVoiAddonId phải là UUID hợp lệ").nullish(),
});

export const ChotDotChonSchema = z.object({
  /** Tên người bấm chốt — cùng luật với nút Chốt đợt 1 (BB-276: có trần). */
  tenNguoiChot: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập tên người xác nhận")
    .max(200, "Tên tối đa 200 ký tự"),
  /**
   * Ô tick "Tôi biết nếu chưa chọn ảnh in, thời gian nhận ảnh sẽ lâu hơn timeline".
   * BẮT BUỘC (true) khi có sản phẩm in/album chưa gắn ảnh; máy chủ tự đếm và từ chối
   * nếu thiếu, không tin giao diện.
   */
  bietAnhInChamHon: z.boolean().optional(),
  /** Ảnh CHỌN THÊM ở đợt này. Rỗng được nếu chỉ mua sản phẩm. Trần 500 để chặn body khổng lồ. */
  photoIds: z.array(z.string().uuid("photoId phải là UUID hợp lệ")).max(500).default([]),
  items: z.array(DongSanPhamSchema).max(30, "Mỗi đợt tối đa 30 dòng sản phẩm").default([]),
  /** BB-399 — ô "Làm ảnh nhanh" ở hộp chốt đợt (không tích sẵn). Giá máy chủ tự đọc từ `products`. */
  lamAnhNhanh: z.boolean().optional(),
});

export type ChotDotChonInput = z.infer<typeof ChotDotChonSchema>;
