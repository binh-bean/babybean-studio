import { z } from "zod";

export const PlacePhotoSchema = z
  .object({
    /** Dòng hàng TRONG GÓI nhận tấm ảnh này. */
    galleryItemId: z.string().uuid("galleryItemId không hợp lệ").optional(),
    /**
     * Album MUA THÊM nhận tấm ảnh này (migration 0062).
     *
     * Album là thứ duy nhất gộp nhiều ảnh vào một sản phẩm, nên nó cần đường
     * riêng: ảnh in và khung mua thêm gắn thẳng vào `selection_addons.photo_id`
     * (0061), một sản phẩm một tấm.
     */
    addonId: z.string().uuid("addonId không hợp lệ").optional(),
    photoId: z.string().uuid("photoId không hợp lệ").optional(),
    selectionItemId: z.string().uuid("selectionItemId không hợp lệ").optional(),
  })
  .refine((data) => !!data.photoId || !!data.selectionItemId, {
    message: "Cần cung cấp photoId hoặc selectionItemId",
    path: ["photoId"],
  })
  .refine((data) => !!data.galleryItemId !== !!data.addonId, {
    message: "Chọn đúng một trong hai: dòng hàng trong gói, hoặc album mua thêm",
    path: ["galleryItemId"],
  });

export type PlacePhotoInput = z.infer<typeof PlacePhotoSchema>;

export const RemovePhotoPlacementSchema = z
  .object({
    galleryItemId: z.string().uuid("galleryItemId không hợp lệ").optional(),
    addonId: z.string().uuid("addonId không hợp lệ").optional(),
    photoId: z.string().uuid("photoId không hợp lệ").optional(),
    selectionItemId: z.string().uuid("selectionItemId không hợp lệ").optional(),
  })
  .refine((data) => !!data.photoId || !!data.selectionItemId, {
    message: "Cần cung cấp photoId hoặc selectionItemId",
    path: ["photoId"],
  });

export type RemovePhotoPlacementInput = z.infer<typeof RemovePhotoPlacementSchema>;
