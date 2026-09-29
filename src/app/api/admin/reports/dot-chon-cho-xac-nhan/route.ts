/**
 * GET /api/admin/reports/dot-chon-cho-xac-nhan — mọi đợt mua thêm đang CHỜ CSKH
 * xác nhận, trong phạm vi chi nhánh được xem.
 *
 * OWNER: DEV-BE. Task BB-321. Dùng cho tab "Khách mua thêm" ở
 * /admin/viec-can-xu-ly và cho huy hiệu "Cần xử lý ngay" (qua
 * /api/admin/can-xu-ly, cùng công thức BB-283). Cùng khuôn với
 * `/api/admin/reports/yeu-cau-mo-lai` (BB-312).
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { layDanhSachChoXacNhanDot, layDanhSachViecDot1 } from "@/lib/gallery/dot-chon-server";

export const runtime = "nodejs";

/** CTV thời vụ không xử lý việc của khách — cùng luật với các báo cáo CSKH khác. */
const BLOCKED_ROLES = ["photoshop_ctv"];

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    if (BLOCKED_ROLES.includes(staff.role)) {
      return fail("FORBIDDEN", "Vai trò này không xem được danh sách đợt mua thêm");
    }

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
      if (branchIds.length === 0) return ok({ items: [], viecDot1: [], canConfirm: false });
    }

    const admin = createAdminClient();
    const [items, viecDot1] = await Promise.all([
      layDanhSachChoXacNhanDot(admin, branchIds),
      layDanhSachViecDot1(admin, branchIds),
    ]);

    return ok({
      // Không trả anh_ids (danh sách id ảnh) — hàng đợi chỉ cần số liệu; ảnh xem ở trang bộ ảnh.
      items: items.map((d) => ({
        galleryId: d.galleryId,
        galleryTitle: d.galleryTitle,
        branchName: d.branchName,
        customerName: d.customerName,
        soDot: d.soDot,
        soAnh: d.soAnh,
        soSanPhamInChuaAnh: d.soSanPhamInChuaAnh,
        tienAnh: d.tienAnh,
        tienSanPham: d.tienSanPham,
        tong: d.tong,
        submittedAt: d.submittedAt,
        submittedByName: d.submittedByName,
        sanPham: d.sanPham.map((s) => ({ ten: s.ten, soLuong: s.soLuong })),
      })),
      // Đợt 1: khách nhờ studio chọn thêm ảnh / chốt khi còn sản phẩm in chưa chọn ảnh.
      viecDot1,
      canConfirm: staff.permissions.includes("galleries:write"),
    });
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}
