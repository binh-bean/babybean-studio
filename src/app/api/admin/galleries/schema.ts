/**
 * Validation schema for POST /api/admin/galleries.
 *
 * OWNER: DEV-BE. Task BB-023.
 * Spec: docs/04-api-spec.md §4.1
 */

import { z } from "zod";

export const CreateGallerySchema = z
  .object({
    branchId: z.string().uuid("branchId phải là UUID hợp lệ"),
    customerId: z.string().uuid("customerId phải là UUID hợp lệ").optional(),
    newCustomer: z
      .object({
        fullName: z.string().min(1, "Họ tên khách hàng không được để trống"),
        phone: z.string().min(1, "Số điện thoại không được để trống"),
        zalo: z.string().optional(),
      })
      .optional(),
    babyId: z.string().uuid("babyId phải là UUID hợp lệ").optional(),
    newBaby: z
      .object({
        fullName: z.string().min(1, "Tên bé không được để trống"),
        birthDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày sinh phải theo định dạng YYYY-MM-DD")
          .optional()
          .or(z.literal("")),
      })
      .optional(),
    packageId: z.string().uuid("packageId phải là UUID hợp lệ"),
    photographerId: z.string().uuid("photographerId phải là UUID hợp lệ").optional().nullable(),
    shootDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày chụp phải theo định dạng YYYY-MM-DD")
      .optional()
      .nullable(),
    title: z.string().min(1, "Tên album không được để trống"),
    driveUrl: z.string().min(1, "Link Google Drive không được để trống"),
    includedQuota: z.number().int().nonnegative().optional(),
    extraPhotoPrice: z.number().nonnegative().optional(),
    maxSelection: z.number().int().positive().optional().nullable(),
    dueAt: z.string().datetime().optional().nullable(),
    welcomeMessage: z.string().optional().nullable(),
    options: z
      .object({
        requirePin: z.boolean().default(true),
        pin: z
          .string()
          .regex(/^\d{4}$/, "Mã PIN phải gồm đúng 4 chữ số")
          .optional()
          .nullable(),
        watermark: z.boolean().default(true),
        download: z.boolean().default(false),
        notes: z.boolean().default(true),
        invite: z.boolean().default(true),
      })
      .default({}),
  })
  .refine((data) => data.customerId || data.newCustomer, {
    message: "Cần cung cấp customerId hoặc newCustomer",
    path: ["customerId"],
  })
  .refine(
    (data) =>
      !data.maxSelection ||
      !data.includedQuota ||
      data.maxSelection >= data.includedQuota,
    {
      message: "maxSelection không được nhỏ hơn includedQuota",
      path: ["maxSelection"],
    },
  );

export type CreateGalleryInput = z.infer<typeof CreateGallerySchema>;
