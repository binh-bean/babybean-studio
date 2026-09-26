/**
 * Validation schema for GET /api/admin/bao-cao/[ma].
 *
 * Task BB-260.
 */

import { z } from "zod";

export const GetBaoCaoQuerySchema = z.object({
  // ISO date (yyyy-mm-dd) hoặc ISO datetime. Cả hai đều thiếu = dùng mặc định
  // "7 ngày qua" ở tầng route.
  tu: z.string().min(1).optional(),
  den: z.string().min(1).optional(),
  nhom: z.enum(["ngay", "tuan", "thang"]).optional().default("ngay"),
  soSanh: z
    .union([z.literal("1"), z.literal("0")])
    .optional()
    .transform((v) => v === "1"),
  chiNhanh: z.string().uuid("chiNhanh phải là UUID hợp lệ").optional(),
  dinhDang: z.enum(["json", "csv"]).optional().default("json"),
});

export type GetBaoCaoQuery = z.infer<typeof GetBaoCaoQuerySchema>;
