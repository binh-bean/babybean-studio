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
    title: z.string().min(1, "Tên bộ ảnh không được để trống"),
    driveUrl: z.string().min(1, "Link Google Drive không được để trống"),
    includedQuota: z.number().int().nonnegative().optional(),
    extraPhotoPrice: z.number().nonnegative().optional(),
    maxSelection: z.number().int().positive().optional().nullable(),
    dueAt: z.string().datetime().optional().nullable(),
    welcomeMessage: z.string().optional().nullable(),
    options: z
      .object({
        // Cả 457 bộ trên bb-prod đều `download_enabled = true` (BB-158). Để mặc
        // định `false` ở đây là bộ nào tạo từ lối gọi khác sẽ lệch với cả 457 bộ kia.
        download: z.boolean().default(true),
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

// Bản chép tay ở đây từng thiếu 'sync_error', 'awaiting_approval' và
// 'approved' — CSKH lọc theo các trạng thái đó thì Zod từ chối thẳng.
import { GALLERY_STATUSES } from "@/lib/gallery-status";
export const GALLERY_STATUS_VALUES = GALLERY_STATUSES;

export const GetGalleriesQuerySchema = z.object({
  branchId: z.string().uuid("branchId phải là UUID hợp lệ").optional(),
  status: z
    .union([
      z.enum(GALLERY_STATUS_VALUES),
      z.array(z.enum(GALLERY_STATUS_VALUES)),
      z.string().transform((val) =>
        val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) as (typeof GALLERY_STATUS_VALUES)[number][],
      ),
    ])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val;
      return [val];
    }),
  photographerId: z.string().uuid("photographerId phải là UUID hợp lệ").optional(),
  editorId: z.string().uuid("editorId phải là UUID hợp lệ").optional(),
  cskhId: z.string().uuid("cskhId phải là UUID hợp lệ").optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom phải theo định dạng YYYY-MM-DD").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo phải theo định dạng YYYY-MM-DD").optional(),
  fromShootDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fromShootDate phải theo định dạng YYYY-MM-DD").optional(),
  toShootDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "toShootDate phải theo định dạng YYYY-MM-DD").optional(),
  expiringSoon: z
    .union([
      z.boolean(),
      z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1"),
    ])
    .optional(),
  q: z.string().trim().optional(),
  search: z.string().trim().optional(),
  sortBy: z
    .enum([
      "createdAt",
      "shootDate",
      "dueAt",
      "title",
      "status",
      "photoCount",
      "selectedCount",
      "lastSelectedAt",
    ])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type GetGalleriesQueryInput = z.infer<typeof GetGalleriesQuerySchema>;
