/**
 * POST /api/admin/galleries/[id]/dong-hop-dong — BB-331: kéo dòng hợp đồng
 * (và do đó HẠN MỨC, `app.gallery_quota`) của bộ ảnh từ hóa đơn Lark.
 *
 * Tự chạy ngay sau khi tạo bộ / gắn dòng Hậu Kỳ (xem `galleries/route.ts`,
 * `gan-lark/route.ts`); route này là nút "Kéo dòng hợp đồng từ Lark" cho bộ
 * đã gắn từ trước mà vẫn "Chưa có dòng hàng nào". CHỈ ĐỌC Lark.
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { keoDongHopDongTuLark } from "@/lib/lark/dong-hop-dong";
import { ghiNhatKy } from "@/lib/nhat-ky";

export const runtime = "nodejs";
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const admin = createAdminClient();
    const { data: gal } = await admin
      .from("galleries")
      .select("id, branch_id, lark_contract_code")
      .eq("id", id)
      .maybeSingle();
    if (!gal) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, String(gal.branch_id));
    if (!gal.lark_contract_code) return fail("CONFLICT", "Bộ ảnh chưa có mã hóa đơn Lark — gắn dòng Hậu Kỳ trước.");

    let kq;
    try {
      kq = await keoDongHopDongTuLark(admin, id);
    } catch (err) {
      console.error(JSON.stringify({ evt: "keo_dong_hop_dong_loi", requestId, galleryId: id, loi: String((err as Error)?.message ?? err) }));
      return fail("INTERNAL", "Chưa kéo được dòng hợp đồng từ Lark, thử lại sau ít phút.");
    }

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      actorLabel: staff.role,
      branchId: String(gal.branch_id),
      action: "gallery.keo_dong_hop_dong",
      entityType: "gallery",
      entityId: id,
      galleryId: id,
      metadata: { ...kq },
    });
    return ok(kq);
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
