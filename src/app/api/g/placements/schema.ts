import { z } from "zod";

export const PlacePhotoSchema = z
  .object({
    galleryItemId: z.string().uuid("galleryItemId không hợp lệ"),
    photoId: z.string().uuid("photoId không hợp lệ").optional(),
    selectionItemId: z.string().uuid("selectionItemId không hợp lệ").optional(),
  })
  .refine((data) => !!data.photoId || !!data.selectionItemId, {
    message: "Cần cung cấp photoId hoặc selectionItemId",
    path: ["photoId"],
  });

export type PlacePhotoInput = z.infer<typeof PlacePhotoSchema>;

export const RemovePhotoPlacementSchema = z
  .object({
    galleryItemId: z.string().uuid("galleryItemId không hợp lệ"),
    photoId: z.string().uuid("photoId không hợp lệ").optional(),
    selectionItemId: z.string().uuid("selectionItemId không hợp lệ").optional(),
  })
  .refine((data) => !!data.photoId || !!data.selectionItemId, {
    message: "Cần cung cấp photoId hoặc selectionItemId",
    path: ["photoId"],
  });

export type RemovePhotoPlacementInput = z.infer<typeof RemovePhotoPlacementSchema>;
