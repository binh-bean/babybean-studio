/**
 * Request schemas for /api/admin/staff.
 *
 * OWNER: DEV-BE. Task BB-063.
 *
 * Schemas live beside route.ts, not inside it: Next.js route modules may only
 * export the HTTP verbs and a fixed set of route config values.
 */

import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/username";

/** 'viewer' is assignable; 'owner' is not — see the note in route.ts. */
export const ASSIGNABLE_ROLES = [
  "admin",
  "branch_manager",
  "cs",
  "photographer",
  "retoucher",
  "accountant",
  "viewer",
] as const;

export const CreateStaffSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  username: z.string().trim().toLowerCase().min(3).max(30),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  role: z.enum(ASSIGNABLE_ROLES),
  branchIds: z.array(z.string().uuid()).max(20).default([]),
  phone: z.string().trim().max(20).optional().nullable(),
});

export const UpdateStaffSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80).optional(),
    role: z.enum(ASSIGNABLE_ROLES).optional(),
    branchIds: z.array(z.string().uuid()).max(20).optional(),
    isActive: z.boolean().optional(),
    phone: z.string().trim().max(20).nullable().optional(),
    /** Present only when the owner is resetting someone's password. */
    password: z.string().min(MIN_PASSWORD_LENGTH).max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Không có gì để đổi" });

export type CreateStaffInput = z.infer<typeof CreateStaffSchema>;
export type UpdateStaffInput = z.infer<typeof UpdateStaffSchema>;
