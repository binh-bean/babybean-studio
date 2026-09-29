/**
 * GET /api/admin/reports/yeu-cau-mo-lai — mọi bộ ảnh đang có yêu cầu "xin mở
 * lại" CHƯA XỬ LÝ, trong phạm vi chi nhánh CSKH được xem.
 *
 * OWNER: DEV-BE. Task BB-312. Dùng cho tab "Yêu cầu mở lại" ở
 * /admin/viec-can-xu-ly VÀ cho huy hiệu "Cần xử lý ngay" (qua
 * /api/admin/can-xu-ly, cùng công thức BB-283).
 *
 * Không viết RPC/migration cho task này — cùng luật với BB-257
 * (/api/admin/can-xu-ly): dữ liệu suy từ `activity_logs` bằng
 * `layDanhSachChoXuLyMoLai` (src/lib/gallery/yeu-cau-mo-lai.ts).
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { layDanhSachChoXuLyMoLai } from "@/lib/gallery/yeu-cau-mo-lai";
import { layCacDot } from "@/lib/gallery/dot-chon-server";

export const runtime = "nodejs";

/** CTV thời vụ không xử lý yêu cầu của khách — cùng luật với các báo cáo CSKH khác. */
const BLOCKED_ROLES = ["photoshop_ctv"];

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    if (BLOCKED_ROLES.includes(staff.role)) {
      return fail("FORBIDDEN", "Vai trò này không xem được danh sách yêu cầu mở lại");
    }

    const url = new URL(request.url);
    const branchFilter = url.searchParams.get("branchId");

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

    const admin = createAdminClient();
    const dsCho = await layDanhSachChoXuLyMoLai(admin, branchIds);
    // BB-327 — nút "Mở lại" ngay trên danh sách cần biết các đợt mua thêm của
    // từng bộ (cùng dữ liệu route /reopen dùng để quyết định đợt nào mở được).
    // Danh sách này nhỏ (chỉ yêu cầu CHƯA xử lý), mỗi bộ một lượt đọc nhẹ.
    const items = await Promise.all(
      dsCho.map(async (it) => ({
        ...it,
        cacDot: (await layCacDot(admin, it.galleryId)).map((d) => ({ soDot: d.soDot, trangThai: d.trangThai })),
      })),
    );

    return ok({ items, canReopen: staff.permissions.includes("galleries:reopen") });
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}
