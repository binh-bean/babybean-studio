/**
 * GET /api/admin/galleries/[id]/lam-anh-nhanh — màn chi tiết bộ ảnh: bộ có "Làm ảnh nhanh"
 * không + hạn trả ảnh chỉnh dự kiến (ngày chốt + 14 hoặc + 5 ngày, theo Cài đặt).
 *
 * OWNER: DEV-BE. Task BB-399. Cùng khuôn quyền với `tim-gia-dinh` (BB-383): xem được màn chi
 * tiết thì xem được khối này. Bộ chưa chốt → `daChot: false`.
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { xetQuyenXemBoAnh, CAU_CHAN_BO_ANH } from "@/lib/auth/quyen-xem-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { layHanTraNhieuBo } from "@/lib/dich-vu/lam-anh-nhanh-server";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    const { id: galleryId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const admin = createAdminClient();
    const { data: gallery, error: gErr } = await admin
      .from("galleries")
      .select("id, branch_id, editor_id, status")
      .eq("id", galleryId)
      .maybeSingle();
    if (gErr || !gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    const lyDoChan = xetQuyenXemBoAnh(staff, gallery as { branch_id: string; editor_id: string | null });
    if (lyDoChan) return fail("FORBIDDEN", CAU_CHAN_BO_ANH[lyDoChan].tieuDe);

    const han = (await layHanTraNhieuBo(admin, [galleryId])).get(galleryId) ?? null;
    return ok({
      daChot: !!han,
      lamNhanh: han?.lamNhanh ?? false,
      uuTien: han?.uuTien ?? false,
      soNgay: han?.soNgay ?? null,
      hanTra: han?.hanTra ?? null,
      chotLuc: han?.chotLuc ?? null,
      trangThai: gallery.status,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền xem bộ ảnh này");
    return failUnexpected(err, requestId);
  }
}
