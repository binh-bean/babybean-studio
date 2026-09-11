import { z } from "zod";

export const PreviewGallerySchema = z.object({
  driveUrl: z.string().min(1, "Link không được để trống"),
});

export type PreviewGalleryInput = z.infer<typeof PreviewGallerySchema>;
