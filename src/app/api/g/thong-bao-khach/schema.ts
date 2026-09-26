import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * BB-261 — đánh dấu đã đọc: hoặc MỘT thông báo cụ thể (`id`), hoặc TẤT CẢ
 * (`tatCa: true`). Đúng một trong hai, không cả hai và không thiếu cả hai —
 * `refine` chặn thân mơ hồ như `{}` hay `{ id, tatCa: true }`.
 */
export const DanhDauDaDocSchema = z
  .object({
    id: z.string().regex(UUID_RE, "id phải là UUID hợp lệ").optional(),
    tatCa: z.literal(true).optional(),
  })
  .refine((v) => (v.id !== undefined) !== (v.tatCa !== undefined), {
    message: "Cần đúng một trong hai: id (một thông báo) hoặc tatCa: true (tất cả)",
  });

export type DanhDauDaDocInput = z.infer<typeof DanhDauDaDocSchema>;
