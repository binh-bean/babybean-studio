/**
 * GET /api/admin/reports/anh-chinh-sua — tab "Ảnh chỉnh sửa" của Việc cần xử lý (BB-371).
 *
 * Mỗi bộ ảnh một dòng: "Bộ X có N ảnh chỉnh sửa — kiểm rồi gửi khách", hoặc
 * "ba mẹ xin sửa lần N". Nút gửi khách hiện cho `anh_chinh:gui_khach` HOẶC
 * `galleries:write` (BB-387, cùng luật route gửi khách). Lọc chi nhánh như các báo cáo CSKH khác; CTV thời vụ
 * không vào (việc gửi khách là của CSKH). Không trả tên/SĐT khách.
 */

import { layHanTraNhieuBo } from "@/lib/dich-vu/lam-anh-nhanh-server";
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { CAC_QUYEN_GUI_KHACH_DUYET, coMotTrongCacQuyen } from "@/lib/auth/quyen-xem-bo-anh";
import { layViecAnhChinh } from "@/lib/anh-chinh-sua/viec-can-lam";
import { docNhaCuaCacBo } from "@/lib/gia-dinh/nha-cua-bo";
import { layLinkChatTheoBo } from "@/lib/lien-lac/link-chat-khach-server";

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

    const admin = createAdminClient();
    const items = await layViecAnhChinh(admin, branchIds);
    // BB-392 mục 3a — nhãn nhà (khách có ≥ 2 bộ). Lỗi đọc nhãn không làm hỏng danh sách việc.
    const nha = await docNhaCuaCacBo(admin, items.map((v) => v.galleryId)).catch(() => ({}));
    // BB-399 — bộ khách mua "Làm ảnh nhanh": nhãn + hạn trả dự kiến (lỗi đọc → không nhãn).
    const hanTra = await layHanTraNhieuBo(admin, items.map((v) => v.galleryId));
    const lamNhanh = Object.fromEntries(
      [...hanTra].filter(([, h]) => h.lamNhanh).map(([id, h]) => [id, { soNgay: h.soNgay, hanTra: h.hanTra, uuTien: h.uuTien }]),
    );
    // BB-404 — link chat riêng của khách theo bộ (một truy vấn) cho icon "Nhắn khách" trên từng dòng.
    const chatTheoBo = await layLinkChatTheoBo(admin, items.map((v) => v.galleryId));
    return ok({ items, nha, chatTheoBo, lamNhanh, coTheGui: coMotTrongCacQuyen(staff.permissions, CAC_QUYEN_GUI_KHACH_DUYET) });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
