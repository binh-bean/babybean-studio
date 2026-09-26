/**
 * Validation schema for GET /api/admin/can-xu-ly.
 *
 * Task BB-257.
 */

import { z } from "zod";

export const GetCanXuLyQuerySchema = z.object({
  // Không bắt buộc: bỏ trống thì xem theo mọi chi nhánh nhân viên đang được
  // gán (tính trong route qua staff.branchIds). Có truyền thì phải là UUID
  // hợp lệ VÀ nằm trong tập chi nhánh của nhân viên — route tự kiểm bằng
  // requireBranch, không phải Zod.
  branchId: z.string().uuid("branchId phải là UUID hợp lệ").optional(),
});
