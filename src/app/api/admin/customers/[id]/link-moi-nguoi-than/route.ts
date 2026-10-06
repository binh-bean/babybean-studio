/**
 * GET /api/admin/customers/<id>/link-moi-nguoi-than — BB-372: link mời ông bà /
 * người thân mà ba mẹ của khách này đã tạo (CHỈ ĐỌC). Cả nhà: mọi link mời gắn
 * theo khách, và link mời cũ gắn theo từng bộ của khách.
 *
 * OWNER: DEV-BE. Quyền: `galleries:read` + đúng chi nhánh của khách. Nhân viên
 * không sửa / thu hồi được link của khách ở đây (không có POST/DELETE).
 * Không bao giờ trả mã đầy đủ — chỉ 6 ký tự đầu (`maDau`).
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { docLinkMoiNguoiThan } from "@/lib/gia-dinh/link-moi-nguoi-than";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:read");
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return fail("INVALID_INPUT", "Mã khách không hợp lệ");

    const admin = createAdminClient();
    const { data: khach, error } = await admin.from("customers").select("id, branch_id").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!khach) return fail("NOT_FOUND", "Không tìm thấy khách");
    requireBranch(staff, String(khach.branch_id));

    return ok(await docLinkMoiNguoiThan(admin, { customerId: id }));
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền xem link mời người thân");
    return failUnexpected(err, requestId);
  }
}
