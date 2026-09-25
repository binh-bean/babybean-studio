/**
 * POST /api/admin/customers/:id/babies — thêm bé vào hồ sơ khách.
 *
 * OWNER: DEV-BE. Task BB-061.
 *
 * Một gia đình có thể có nhiều bé, và `birth_date` là chìa khoá cho chiến dịch
 * nhắc sinh nhật ở giai đoạn sau (docs/03 mục 2.2). Hiện 254 bé trong cơ sở dữ
 * liệu đều KHÔNG có ngày sinh — đường Lark không mang ô đó sang, nên chỗ duy
 * nhất điền được là màn này.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { BabySchema } from "../../schema";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "customers:write");

    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT");
    const parsed = BabySchema.safeParse(body.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", parsed.error.issues[0]?.message, {
        issues: parsed.error.issues,
      });
    }
    const input = parsed.data;
    const admin = createAdminClient();

    const { data: khach } = await admin
      .from("customers")
      .select("id, branch_id")
      .eq("id", id)
      .maybeSingle();
    if (!khach) return fail("NOT_FOUND", "Không tìm thấy khách hàng");
    requireBranch(staff, String(khach.branch_id));

    const { data, error } = await admin
      .from("babies")
      .insert({
        customer_id: id,
        full_name: input.fullName,
        nickname: input.nickname ?? null,
        birth_date: input.birthDate ?? null,
        gender: input.gender ?? null,
        note: input.note ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      branch_id: khach.branch_id,
      action: "baby.create",
      entity_type: "customer",
      entity_id: id,
      metadata: { babyId: data.id },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({ id: data.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
