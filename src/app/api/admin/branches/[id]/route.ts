/**
 * PATCH /api/admin/branches/:id — sửa tên, địa chỉ, hotline, bật/tắt
 *
 * OWNER: DEV-BE. Task BB-063.
 *
 * DELETE (BB-331) — chỉ cho chi nhánh RỖNG: không bộ ảnh, không nhân sự, không
 * khách/buổi chụp/lượt giao/gói/sản phẩm riêng. Còn dữ liệu thì trả CONFLICT
 * kèm lý do để màn hình mời "Ngừng hoạt động" thay thế — xoá một chi nhánh
 * đang có bộ ảnh là xoá luôn lịch sử của nó.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { UpdateBranchSchema } from "../schema";
import { lyDoKhongXoaChiNhanh } from "@/lib/utils/xoa-chi-nhanh";

export const runtime = "nodejs";


export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    requirePermission(staff, "branches:write");

    const { id } = await context.params;
    // branch_manager chỉ sửa được chi nhánh mình phụ trách.
    requireBranch(staff, id);

    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT");
    const parsed = UpdateBranchSchema.safeParse(body.data);
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
      requirePermission(staff, "branches:manage");

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

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      branch_id: id,
      action: "branch.update",
      entity_type: "branch",
      entity_id: id,
      metadata: { target: target.name, fields: Object.keys(input) },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({ id, updated: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    requirePermission(staff, "branches:manage");
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("INVALID_INPUT");

    const admin = createAdminClient();
    const { data: target } = await admin
      .from("branches")
      .select("id, code, name, is_active")
      .eq("id", id)
      .maybeSingle();
    if (!target) return fail("NOT_FOUND", "Không tìm thấy chi nhánh");

    const dem = async (table: string) => {
      const { count, error } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("branch_id", id);
      if (error) throw error;
      return count ?? 0;
    };
    const [galleries, staffCount, customers, shoots, deliveries, packages, products] = await Promise.all([
      dem("galleries"),
      dem("staff_branches"),
      dem("customers"),
      dem("shoots"),
      dem("deliveries"),
      dem("packages"),
      dem("products"),
    ]);
    const lyDo = lyDoKhongXoaChiNhanh({
      galleries,
      staff: staffCount,
      customers,
      shoots,
      deliveries,
      packages,
      products,
    });
    if (lyDo) return fail("CONFLICT", lyDo, { canDeactivate: target.is_active });

    if (target.is_active) {
      const { count } = await admin
        .from("branches")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      if ((count ?? 0) <= 1) {
        return fail("FORBIDDEN", "Đây là chi nhánh đang hoạt động duy nhất, không xoá được");
      }
    }

    // Nhật ký giữ lại (chỉ bỏ liên kết chi nhánh); thông báo và cài đặt riêng
    // của chi nhánh không còn ý nghĩa khi chi nhánh không còn.
    const { error: e1 } = await admin.from("activity_logs").update({ branch_id: null }).eq("branch_id", id);
    if (e1) throw e1;
    const { error: e2 } = await admin.from("notifications").delete().eq("branch_id", id);
    if (e2) throw e2;
    const { error: e3 } = await admin.from("settings").delete().eq("branch_id", id);
    if (e3) throw e3;
    const { error } = await admin.from("branches").delete().eq("id", id);
    if (error) throw error;

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      branch_id: null,
      action: "branch.delete",
      entity_type: "branch",
      entity_id: id,
      metadata: { target: target.name, code: target.code },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({ id, deleted: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
