/**
 * PATCH  /api/admin/roles/:id — đổi tên hoặc đổi bộ quyền của một vai
 * DELETE /api/admin/roles/:id — xoá một vai tự tạo
 *
 * OWNER: SEC-ARCH. Task BB-172 chặng 2b.
 *
 * Vai hệ thống bị chặn ở HAI lớp: ở đây, và bằng trigger trong migration 0053.
 * Lớp ở đây cho thông báo đọc được; lớp dưới cơ sở dữ liệu mới là lớp không đi
 * vòng qua được.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { MA_QUYEN_HOP_LE, tenVaiCoVanDeGi } from "@/lib/auth/danh-muc-quyen";

export const runtime = "nodejs";


const SuaVaiSchema = z.object({
  name: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "roles:manage");
    const { id } = await params;

    const parsed = SuaVaiSchema.safeParse(await request.json());
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }

    const admin = createAdminClient();
    const { data: vai, error: loiDoc } = await admin
      .from("roles")
      .select("id, name, permissions, is_system")
      .eq("id", id)
      .maybeSingle();
    if (loiDoc) throw loiDoc;
    if (!vai) return fail("NOT_FOUND", "Không có vai trò này");
    if (vai.is_system) {
      return fail("FORBIDDEN", `"${vai.name}" là vai hệ thống, không sửa được`);
    }

    const capNhat: Record<string, unknown> = {};

    if (parsed.data.name !== undefined) {
      const ten = parsed.data.name.trim();
      const vanDe = tenVaiCoVanDeGi(ten);
      if (vanDe) return fail("INVALID_INPUT", vanDe);
      capNhat.name = ten;
    }

    if (parsed.data.permissions !== undefined) {
      const la = parsed.data.permissions.filter((p) => !MA_QUYEN_HOP_LE.has(p));
      if (la.length > 0) return fail("INVALID_INPUT", `Không có quyền tên: ${la.join(", ")}`);
      capNhat.permissions = [...new Set(parsed.data.permissions)];
    }

    if (Object.keys(capNhat).length === 0) return ok({ id, daDoi: false });

    const { error: loiGhi } = await admin.from("roles").update(capNhat).eq("id", id);
    if (loiGhi) throw loiGhi;

    // Nhật ký ghi CẢ quyền cũ lẫn quyền mới — ADR-0007 mục 4. Ghi mỗi "đã sửa
    // vai trò" thì lúc có chuyện không ai dựng lại được ai đã mở quyền gì.
    const { error: loiNhatKy } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      action: "role.update",
      entity_type: "role",
      entity_id: id,
      metadata: {
        name: { cu: vai.name, moi: capNhat.name ?? vai.name },
        permissions: { cu: vai.permissions ?? [], moi: capNhat.permissions ?? vai.permissions ?? [] },
      },
    });
    if (loiNhatKy) console.error("[roles] ghi activity_logs hụt:", loiNhatKy);

    return ok({ id, daDoi: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "roles:manage");
    const { id } = await params;

    const admin = createAdminClient();
    const { data: vai, error: loiDoc } = await admin
      .from("roles")
      .select("id, name, is_system")
      .eq("id", id)
      .maybeSingle();
    if (loiDoc) throw loiDoc;
    if (!vai) return fail("NOT_FOUND", "Không có vai trò này");
    if (vai.is_system) {
      return fail("FORBIDDEN", `"${vai.name}" là vai hệ thống, không xoá được`);
    }

    // Xoá một vai đang có người giữ là đẩy những người đó vào trạng thái không
    // ai định nghĩa. Chặn, và nói rõ đang vướng bao nhiêu người.
    const { count, error: loiDem } = await admin
      .from("staff_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role_id", id);
    if (loiDem) throw loiDem;
    if ((count ?? 0) > 0) {
      return fail("CONFLICT", `Còn ${count} người đang giữ vai này. Chuyển họ sang vai khác trước.`);
    }

    const { error: loiXoa } = await admin.from("roles").delete().eq("id", id);
    if (loiXoa) throw loiXoa;

    const { error: loiNhatKy } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      action: "role.delete",
      entity_type: "role",
      entity_id: id,
      metadata: { name: vai.name },
    });
    if (loiNhatKy) console.error("[roles] ghi activity_logs hụt:", loiNhatKy);

    return ok({ id, daXoa: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
