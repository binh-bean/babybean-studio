/**
 * GET /api/admin/reports/anh-chinh-sua — tab "Ảnh chỉnh sửa" của Việc cần xử lý (BB-371).
 *
 * Mỗi bộ ảnh một dòng: "Bộ X có N ảnh chỉnh sửa — kiểm rồi gửi khách", hoặc
 * "ba mẹ xin sửa lần N". Lọc chi nhánh như các báo cáo CSKH khác; CTV thời vụ
 * không vào (việc gửi khách là của CSKH). Không trả tên/SĐT khách.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { layViecAnhChinh } from "@/lib/anh-chinh-sua/viec-can-lam";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    if (staff.role === "photoshop_ctv") return fail("FORBIDDEN", "Vai trò này không xem được danh sách này");

    const branchFilter = new URL(request.url).searchParams.get("branchId");
    let branchIds: string[] | null;
    if (branchFilter) {
      if (!staff.branchIds.includes(branchFilter) && !staff.permissions.includes("system:superuser")) {
        return fail("FORBIDDEN", "Không có quyền xem chi nhánh này");
      }
      branchIds = [branchFilter];
    } else if (staff.permissions.includes("system:superuser")) {
      branchIds = null;
    } else {
      branchIds = staff.branchIds;
      if (branchIds.length === 0) return ok({ items: [] });
    }

    const items = await layViecAnhChinh(createAdminClient(), branchIds);
    return ok({ items, coTheGui: staff.permissions.includes("galleries:write") });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
