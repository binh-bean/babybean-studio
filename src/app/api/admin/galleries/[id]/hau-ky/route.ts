/**
 * GET /api/admin/galleries/[id]/hau-ky — BB-381. Màn chi tiết bộ ảnh:
 *   · bộ này là ĐƠN HẬU KỲ mua thêm (0 ảnh, hoá đơn không có dịch vụ chụp) → bộ gốc của khách;
 *   · bộ này là BỘ GỐC → các đơn mua thêm ngoài app của khách ("Đơn mua thêm ngoài app: HD_… · …").
 * CHỈ ĐỌC.
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { xetQuyenXemBoAnh, CAU_CHAN_BO_ANH } from "@/lib/auth/quyen-xem-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { layHauKyCuaBo } from "@/lib/gallery/bo-anh-rong";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    const { id } = await params;
    if (!UUID_RE.test(id)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");
    const admin = createAdminClient();
    const { data: g, error } = await admin.from("galleries").select("id, branch_id, editor_id").eq("id", id).maybeSingle();
    if (error) return failUnexpected(error, requestId);
    if (!g) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    // BB-383 — cùng luật với màn chi tiết (BB-382): xem được màn thì API trả được, và ngược lại.
    const lyDoChan = xetQuyenXemBoAnh(staff, g as { branch_id: string; editor_id: string | null });
    if (lyDoChan) return fail("FORBIDDEN", CAU_CHAN_BO_ANH[lyDoChan].tieuDe);
    const kq = await layHauKyCuaBo(admin, id);
    return ok(kq);
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
