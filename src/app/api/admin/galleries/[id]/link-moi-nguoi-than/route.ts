/**
 * GET /api/admin/galleries/<id>/link-moi-nguoi-than — BB-372: link mời ông bà /
 * người thân nhìn từ MỘT bộ ảnh (CHỈ ĐỌC). Gồm link mời cả nhà của khách (ông bà
 * thấy mọi bộ, kể cả bộ này) và link mời cũ gắn đúng bộ này. Số tim và số yêu cầu
 * mua thêm chỉ đếm TRONG bộ này.
 *
 * OWNER: DEV-BE. Quyền: `galleries:read` + đúng chi nhánh của bộ. Không có
 * POST/DELETE. Không bao giờ trả mã đầy đủ — chỉ 6 ký tự đầu (`maDau`).
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { xetQuyenXemBoAnh, CAU_CHAN_BO_ANH } from "@/lib/auth/quyen-xem-bo-anh";
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
    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const admin = createAdminClient();
    const { data: g, error } = await admin.from("galleries").select("id, branch_id, customer_id, editor_id").eq("id", galleryId).maybeSingle();
    if (error) throw error;
    if (!g) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    // BB-383 — cùng luật với màn chi tiết (BB-382): xem được màn thì API trả được, và ngược lại.
    const lyDoChan = xetQuyenXemBoAnh(staff, g as { branch_id: string; editor_id: string | null });
    if (lyDoChan) return fail("FORBIDDEN", CAU_CHAN_BO_ANH[lyDoChan].tieuDe);

    return ok(await docLinkMoiNguoiThan(admin, { customerId: (g.customer_id as string | null) ?? null, galleryId }));
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền xem link mời người thân");
    return failUnexpected(err, requestId);
  }
}
