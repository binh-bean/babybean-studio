/**
 * POST /api/admin/galleries/:id/thung-rac — BB-409: "Xoá bộ ảnh" = đưa vào THÙNG RÁC.
 *
 * Quyền `bo_anh:xoa` (Admin + Quản lý, migration 0109) + đúng chi nhánh. Bộ biến
 * khỏi mọi danh sách, link khách thấy "bộ ảnh không còn"; 10 ngày sau cron 01:00
 * dọn hẳn. Khôi phục / xoá hẳn ngay: /api/admin/thung-rac/:id.
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { boVaoThungRac } from "@/lib/thung-rac/thung-rac-server";
import { QUYEN_XOA_BO_ANH, maBo, mocDonHan } from "@/lib/thung-rac/thung-rac";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, QUYEN_XOA_BO_ANH);

    const { id } = await context.params;
    if (!UUID_RE.test(id)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const admin = createAdminClient();
    const { data: gallery, error } = await admin
      .from("galleries")
      .select("id, branch_id, drive_folder_id, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id as string);
    if (gallery.deleted_at) return fail("CONFLICT", "Bộ ảnh này đã ở thùng rác");

    const luc = await boVaoThungRac(
      admin,
      {
        id: gallery.id as string,
        branch_id: (gallery.branch_id as string | null) ?? null,
        drive_folder_id: (gallery.drive_folder_id as string | null) ?? null,
      },
      { staffId: staff.staffId },
    );
    if (!luc) return fail("CONFLICT", "Bộ ảnh này đã ở thùng rác");

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: (gallery.branch_id as string | null) ?? null,
      action: "gallery.thung_rac",
      entityType: "gallery",
      entityId: id,
      galleryId: id,
      metadata: { maBo: maBo(id) },
    });

    return ok({ id, deletedAt: luc, donHanLuc: mocDonHan(luc).toISOString() });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
