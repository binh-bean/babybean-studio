/**
 * Request schemas for /api/admin/branches.
 *
 * OWNER: DEV-BE. Task BB-063.
 */

import { z } from "zod";

/** 'BB-Q1', 'BB-TD' — chữ in hoa, số và gạch ngang. */
const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(16)
  .regex(/^[A-Z][A-Z0-9-]*$/, "Mã chi nhánh chỉ gồm chữ in hoa, số và dấu gạch ngang");

export const CreateBranchSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(200).optional().nullable(),
  hotline: z.string().trim().max(30).optional().nullable(),
});

export const UpdateBranchSchema = z
  .object({
    code: codeSchema.optional(),
    name: z.string().trim().min(2).max(80).optional(),
    address: z.string().trim().max(200).nullable().optional(),
    hotline: z.string().trim().max(30).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Không có gì để đổi" });

export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;
export type UpdateBranchInput = z.infer<typeof UpdateBranchSchema>;
