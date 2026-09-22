/**
 * PATCH / DELETE /api/admin/customers/:id/babies/:babyId
 *
 * OWNER: DEV-BE. Task BB-061.
 *
 * DELETE dùng cho bé nhập nhầm, và chỉ khi chưa có bộ ảnh nào gắn vào bé đó —
 * `galleries.baby_id` trỏ tới đây, xoá bé đang có bộ ảnh là cắt mất đường tra
 * ngược "bộ này chụp cho bé nào".
 *
 * Dữ liệu thì khoá ngoại đã giữ rồi: bỏ câu đếm bên dưới đi, cơ sở dữ liệu vẫn
 * từ chối — nhưng người dùng nhận 500 "Có lỗi xảy ra" và không biết vì sao.
 * Đo bằng phép kiểm ngược ngày 22/09/2026: bỏ câu đếm thì phép thử 12 của
 * tests/unit/bb-061-khach-hang.test.ts chuyển từ 409 sang 500, còn hàng bé vẫn
 * nằm nguyên. Nên câu đếm này đổi một lỗi câm thành một câu tiếng Việt, chứ
 * không phải là lớp chặn duy nhất.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { UpdateBabySchema } from "../../../schema";

export const runtime = "nodejs";

/**
 * Mở khoá chung cho cả hai phương thức: bé phải thuộc đúng khách trong URL, và
 * khách phải thuộc chi nhánh người xem được phép.
 *
 * Kiểm cả `customer_id` chứ không chỉ `babyId`: thiếu vế đó thì đoán một id bé
 * bất kỳ rồi ghép với id khách của mình là sửa được bé của chi nhánh khác.
 */
async function moKhoa(
  id: string,
  babyId: string,
  quyen: string,
): Promise<
  | { loi: Response }
  | { admin: ReturnType<typeof createAdminClient>; branchId: string; staffId: string }
> {
  const staff = await requireStaff();
  requirePermission(staff, quyen);

  const admin = createAdminClient();
  const { data: khach } = await admin
    .from("customers")
    .select("id, branch_id")
    .eq("id", id)
    .maybeSingle();
  if (!khach) return { loi: fail("NOT_FOUND", "Không tìm thấy khách hàng") };
  requireBranch(staff, String(khach.branch_id));

  const { data: be } = await admin
    .from("babies")
    .select("id")
    .eq("id", babyId)
    .eq("customer_id", id)
    .maybeSingle();
  if (!be) return { loi: fail("NOT_FOUND", "Không tìm thấy bé trong hồ sơ này") };

  return { admin, branchId: String(khach.branch_id), staffId: staff.staffId };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; babyId: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { id, babyId } = await context.params;
    const parsed = UpdateBabySchema.safeParse(await request.json());
    if (!parsed.success) {
      return fail("INVALID_INPUT", parsed.error.issues[0]?.message, {
        issues: parsed.error.issues,
      });
    }
    const input = parsed.data;

    const cua = await moKhoa(id, babyId, "customers:write");
    if ("loi" in cua) return cua.loi;
    const { admin, branchId, staffId } = cua;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.fullName !== undefined) patch.full_name = input.fullName;
    if (input.nickname !== undefined) patch.nickname = input.nickname;
    if (input.birthDate !== undefined) patch.birth_date = input.birthDate;
    if (input.gender !== undefined) patch.gender = input.gender;
    if (input.note !== undefined) patch.note = input.note;

    const { error } = await admin.from("babies").update(patch).eq("id", babyId);
    if (error) throw error;

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staffId,
      branch_id: branchId,
      action: "baby.update",
      entity_type: "customer",
      entity_id: id,
      metadata: { babyId, fields: Object.keys(input) },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({ id: babyId, updated: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; babyId: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { id, babyId } = await context.params;

    const cua = await moKhoa(id, babyId, "customers:delete");
    if ("loi" in cua) return cua.loi;
    const { admin, branchId, staffId } = cua;

    const { count } = await admin
      .from("galleries")
      .select("id", { count: "exact", head: true })
      .eq("baby_id", babyId);
    if ((count ?? 0) > 0) {
      return fail("CONFLICT", `Bé này đang gắn với ${count} bộ ảnh, không xoá được`);
    }

    const { error } = await admin.from("babies").delete().eq("id", babyId);
    if (error) throw error;

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staffId,
      branch_id: branchId,
      action: "baby.delete",
      entity_type: "customer",
      entity_id: id,
      metadata: { babyId },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({ id: babyId, deleted: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
