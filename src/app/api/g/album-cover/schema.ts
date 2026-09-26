import { z } from "zod";

/**
 * POST /api/g/album-cover — chọn (hoặc đổi) ảnh bìa cho một album TRONG GÓI.
 *
 * OWNER: DEV-BE. Task BB-202.
 */
export const SetAlbumCoverSchema = z.object({
  /** Dòng hợp đồng ALBUM (gallery_items) nhận bìa này. */
  galleryItemId: z.string().uuid("galleryItemId không hợp lệ"),
  /** Ảnh làm bìa — phải là ảnh ba mẹ ĐÃ THẢ TIM của đúng lượt chọn này. */
  photoId: z.string().uuid("photoId không hợp lệ"),
});

export type SetAlbumCoverInput = z.infer<typeof SetAlbumCoverSchema>;
