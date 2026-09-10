/**
 * PATCH /api/admin/staff/:id — đổi vai trò, chi nhánh, bật/tắt, đặt lại mật khẩu
 *
 * OWNER: DEV-BE. Task BB-063.
 * Spec: docs/13-quyet-dinh-van-hanh.md §8
 *
 * Nghỉ việc là TẮT, không xoá. Nhật ký hoạt động phải giữ được tên người đã
 * tạo album nào, đã mở lại album nào — nên ở đây không có DELETE.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireRole, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { passwordProblem } from "@/lib/auth/username";
import { UpdateStaffSchema } from "../schema";
import type { StaffRole } from "@/types/domain";

export const runtime = "nodejs";

const CAN_MANAGE: StaffRole[] = ["owner", "admin"];

function assignableBy(role: StaffRole): readonly StaffRole[] {
  if (role === "owner") {
    return ["admin", "branch_manager", "cs", "photographer", "retoucher", "accountant", "viewer"];
  }
  return ["branch_manager", "cs", "photographer", "retoucher", "accountant", "viewer"];
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    requireRole(staff, CAN_MANAGE);

    const { id } = await context.params;
    const parsed = UpdateStaffSchema.safeParse(await request.json());
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;
    const admin = createAdminClient();

    const { data: target } = await admin
      .from("staff_profiles")
      .select("id, role, is_active, full_name")
      .eq("id", id)
      .maybeSingle();
    if (!target) return fail("NOT_FOUND", "Không tìm thấy nhân sự");

    const isSelf = target.id === staff.staffId;

    // Không ai được tự tắt mình hoặc tự đổi vai trò của mình. Chủ studio bấm
    // nhầm một cái là không còn đường vào hệ thống của chính mình.
    if (isSelf && (input.isActive === false || input.role !== undefined)) {
      return fail("FORBIDDEN", "Không thể tự đổi vai trò hoặc tự tắt tài khoản của mình");
    }

    // Chỉ owner mới đụng được vào một owner khác.
    if (target.role === "owner" && staff.role !== "owner") {
      return fail("FORBIDDEN", "Chỉ chủ studio mới sửa được tài khoản chủ studio");
    }

    if (input.role !== undefined && !assignableBy(staff.role).includes(input.role)) {
      return fail("FORBIDDEN", "Bạn không có quyền gán vai trò này");
    }

    // Tắt owner cuối cùng là tự khoá cửa từ bên trong.
    if (input.isActive === false && target.role === "owner") {
      const { count } = await admin
        .from("staff_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner")
        .eq("is_active", true);
      if ((count ?? 0) <= 1) {
        return fail("FORBIDDEN", "Đây là tài khoản chủ studio đang hoạt động duy nhất, không tắt được");
      }
    }

    if (input.password !== undefined) {
      const problem = passwordProblem(input.password);
      if (problem) return fail("INVALID_INPUT", problem);

      const { error } = await admin.auth.admin.updateUserById(id, { password: input.password });
      if (error) {
        console.error(JSON.stringify({ evt: "reset_password_failed", requestId, reason: error.message }));
        return fail("INTERNAL", "Không đặt lại được mật khẩu");
      }
    }

    const profilePatch: Record<string, unknown> = {};
    if (input.fullName !== undefined) profilePatch.full_name = input.fullName;
    if (input.role !== undefined) profilePatch.role = input.role;
    if (input.isActive !== undefined) profilePatch.is_active = input.isActive;
    if (input.phone !== undefined) profilePatch.phone = input.phone;

    if (Object.keys(profilePatch).length > 0) {
      profilePatch.updated_at = new Date().toISOString();
      const { error } = await admin.from("staff_profiles").update(profilePatch).eq("id", id);
      if (error) throw error;
    }

    if (input.branchIds !== undefined) {
      await admin.from("staff_branches").delete().eq("staff_id", id);
      if (input.branchIds.length > 0) {
        const { error } = await admin
          .from("staff_branches")
          .insert(input.branchIds.map((branch_id) => ({ staff_id: id, branch_id })));
        if (error) throw error;
      }
    }

    await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      action: "staff.update",
      entity_type: "staff_profile",
      entity_id: id,
      // Ghi ĐÃ đổi mật khẩu hay chưa, không bao giờ ghi mật khẩu.
      metadata: {
        target: target.full_name,
        fields: Object.keys(input).filter((k) => k !== "password"),
        passwordReset: input.password !== undefined,
      },
    });

    return ok({ id, updated: true });
  } catch (err) {
    // Thông báo mặc định của mã UNAUTHENTICATED viết cho khách hàng
    // ("Vui lòng mở lại link album"). Nhân viên cần câu khác.
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
