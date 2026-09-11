import { z } from "zod";

export const PhotosQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  subfolder: z.string().optional(),
  filter: z.enum(["all", "selected", "unselected", "favorite", "noted"]).default("all"),
});
