import { z } from "zod";

export const PhotosQuerySchema = z.object({
  cursor: z.string().optional(),
  /**
   * BB-341 — "lấy ảnh có sort_index LỚN HƠN số này". Cho phép màn khách xin
   * nhiều trang CÙNG LÚC (trang k bắt đầu sau k×200) thay vì chờ con trỏ của
   * trang trước. Có `sau` thì bỏ qua `cursor`.
   */
  sau: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  subfolder: z.string().optional(),
  filter: z.enum(["all", "selected", "unselected", "favorite", "noted"]).default("all"),
});
