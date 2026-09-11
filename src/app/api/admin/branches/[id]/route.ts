/**
 * PATCH /api/admin/branches/:id — sửa tên, địa chỉ, hotline, bật/tắt
 *
 * OWNER: DEV-BE. Task BB-063.
 *
 * Không có DELETE. Album, buổi chụp và nhật ký đều tham chiếu tới chi nhánh;
 * xoá một chi nhánh là xoá luôn lịch sử của nó. Đóng cửa một chi nhánh thì tắt.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireRole, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { UpdateBranchSchema } from "../schema";
import type { StaffRole } from "@/types/domain";

export const runtime = "nodejs";

const CAN_EDIT: StaffRole[] = ["owner", "admin", "branch_manager"];
const CAN_TOGGLE: StaffRole[] = ["owner", "admin"];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    requireRole(staff, CAN_EDIT);

    const { id } = await context.params;
    // branch_manager chỉ sửa được chi nhánh mình phụ trách.
    requireBranch(staff, id);

    const parsed = UpdateBranchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return fail("INVALID_INPUT", parsed.error.issues[0]?.message, {
        issues: parsed.error.issues,
      });
    }
    const input = parsed.data;
    const admin = createAdminClient();

    const { data: target } = await admin
      .from("branches")
      .select("id, code, name, is_active")
      .eq("id", id)
      .maybeSingle();
    if (!target) return fail("NOT_FOUND", "Không tìm thấy chi nhánh");

    if (input.isActive !== undefined) {
      requireRole(staff, CAN_TOGGLE);

      // Tắt chi nhánh cuối cùng là tắt cả studio: mọi album đều thuộc về một
      // chi nhánh, và phép kiểm quyền theo chi nhánh sẽ không còn gì để cho qua.
      if (input.isActive === false) {
        const { count } = await admin
          .from("branches")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true);
        if ((count ?? 0) <= 1) {
          return fail("FORBIDDEN", "Đây là chi nhánh đang hoạt động duy nhất, không tắt được");
        }
      }
    }

    if (input.code !== undefined && input.code !== target.code) {
      const { data: taken } = await admin
        .from("branches")
        .select("id")
        .eq("code", input.code)
        .maybeSingle();
      if (taken) return fail("CONFLICT", `Mã chi nhánh ${input.code} đã tồn tại`);
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.code !== undefined) patch.code = input.code;
    if (input.name !== undefined) patch.name = input.name;
    if (input.address !== undefined) patch.address = input.address;
    if (input.hotline !== undefined) patch.hotline = input.hotline;
    if (input.isActive !== undefined) patch.is_active = input.isActive;

    const { error } = await admin.from("branches").update(patch).eq("id", id);
    if (error) throw error;

    await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      branch_id: id,
      action: "branch.update",
      entity_type: "branch",
      entity_id: id,
      metadata: { target: target.name, fields: Object.keys(input) },
    });

    return ok({ id, updated: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
