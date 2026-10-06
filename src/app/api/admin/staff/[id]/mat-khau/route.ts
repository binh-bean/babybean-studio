/**
 * POST /api/admin/staff/:id/mat-khau — Admin tự gõ mật khẩu mới cho nhân viên.
 *
 * OWNER: DEV-BE. Task BB-373 (anh chốt 06/10/2026).
 *
 * - Chỉ vai `owner`/`admin` (và phải có quyền `staff:manage`); vai khác 403.
 * - Admin thường không đụng được tài khoản `owner` (cùng luật PATCH nhân sự).
 * - Mật khẩu đi thẳng vào Supabase Auth (service role, chỉ ở máy chủ). Không
 *   lưu, không log, không trả lại. Mật khẩu cũ chỉ có mã băm nên cũng không có
 *   cách nào cho xem lại.
 * - Nhật ký: `staff.update` + `passwordReset: true` — đúng dạng BB-327 đọc để
 *   dòng "Quên mật khẩu" của nhân viên đó tự rời danh sách.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { laVaiAdmin, vanDeMatKhauMoi } from "@/lib/nhan-su/dat-mat-khau";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    requirePermission(staff, "staff:manage");
    if (!laVaiAdmin(staff.role)) {
      return fail("FORBIDDEN", "Chỉ Admin mới đặt được mật khẩu cho nhân viên");
    }

    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT");
    const matKhau = (body.data as { password?: unknown } | null)?.password;
    const van = vanDeMatKhauMoi(matKhau);
    if (van) return fail("INVALID_INPUT", van);

    const admin = createAdminClient();
    const { data: target } = await admin
      .from("staff_profiles")
      .select("id, role, full_name")
      .eq("id", id)
      .maybeSingle();
    if (!target) return fail("NOT_FOUND", "Không tìm thấy nhân sự");

    if (target.role === "owner" && staff.role !== "owner") {
      return fail("FORBIDDEN", "Chỉ Admin cao nhất mới đặt được mật khẩu cho tài khoản này");
    }

    const { error } = await admin.auth.admin.updateUserById(id, { password: matKhau as string });
    if (error) {
      // Chỉ ghi lý do của Auth, không bao giờ ghi mật khẩu.
      console.error(JSON.stringify({ evt: "dat_mat_khau_hut", requestId, loi: error.message }));
      return fail("INTERNAL", "Không đặt được mật khẩu");
    }

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      action: "staff.update",
      entityType: "staff_profile",
      entityId: id,
      metadata: { target: target.full_name, fields: ["password"], passwordReset: true },
    });

    return ok({ id, passwordReset: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
