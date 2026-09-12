/**
 * POST /api/admin/galleries/[id]/confirm — CSKH xác nhận chốt đơn và chuyển album sang 'in_retouch'.
 *
 * OWNER: DEV-BE. Task BB-114.
 * Spec: docs/16-quy-trinh-dau-cuoi.md §4
 *
 * Luật 2: CHỈ CSKH mới chuyển được giai đoạn. Không phải khách, và KHÔNG tự động
 * theo việc thanh toán. Máy không được tự quyết thay người ở bước này.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireRole, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CSKH_ROLES = ["owner", "admin", "branch_manager", "cs"] as const;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const requestId = randomUUID();

  try {
    // 1. Xác thực nhân viên
    const staff = await requireStaff();

    // 2. Kiểm tra vai trò: Chỉ CSKH, Quản lý, Admin, Owner
    requireRole(staff, CSKH_ROLES as unknown as Parameters<typeof requireRole>[1]);

    // 3. Kiểm tra gallery ID
    const { id: galleryId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) {
      return fail("INVALID_INPUT", "Gallery ID không hợp lệ");
    }

    const admin = createAdminClient();

    // 4. Lấy thông tin album & kiểm tra quyền chi nhánh
    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, branch_id, status, title")
      .eq("id", galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    requireBranch(staff, gallery.branch_id);

    // 5. Kiểm tra trạng thái: Phải đang ở 'submitted'
    if (gallery.status !== "submitted") {
      return fail(
        "INVALID_INPUT",
        `Không thể xác nhận bộ ảnh ở trạng thái '${gallery.status}'. Chỉ bộ ảnh 'submitted' mới được chuyển sang 'in_retouch'.`
      );
    }

    const now = new Date().toISOString();

    // 6. Cập nhật trạng thái sang 'in_retouch'
    const { error: updateError } = await admin
      .from("galleries")
      .update({
        status: "in_retouch",
        updated_at: now,
      })
      .eq("id", galleryId);

    if (updateError) {
      throw updateError;
    }

    // 7. Ghi nhật ký hoạt động
    await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      actor_label: staff.role,
      action: "gallery.confirm_retouch",
      entity_type: "gallery",
      entity_id: galleryId,
      metadata: {
        fromStatus: "submitted",
        toStatus: "in_retouch",
        confirmedAt: now,
      },
    });

    return ok({
      galleryId,
      status: "in_retouch",
      message: "Đã xác nhận và chuyển bộ ảnh sang giai đoạn chỉnh sửa (in_retouch)",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.message);
    }
    return failUnexpected(err, requestId);
  }
}
