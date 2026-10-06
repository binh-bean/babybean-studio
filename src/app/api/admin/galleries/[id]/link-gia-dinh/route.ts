/**
 * GET /api/admin/galleries/<id>/link-gia-dinh — BB-368: link gia đình nhìn từ MỘT bộ ảnh.
 *
 * OWNER: DEV-BE. Hợp đồng: docs/29-link-gia-dinh.md §3.5.
 *
 * Anh chốt 06/10: ở màn chi tiết bộ ảnh, khách đã có link gia đình thì bộ này là
 * một "màn con" `/k/<mã>/<n>` của trang gia đình — CSKH chép link màn con, không
 * tạo link theo bộ nữa. Khách chưa có thì màn hình gọi `POST
 * /api/admin/customers/<id>/link-gia-dinh` (BB-334A, cùng quyền) để tạo.
 *
 * `soThuTu` tính bằng `soThuTuCacBo` — đúng cách trang gia đình đánh số, không
 * phụ thuộc cột `so_thu_tu_khach` (0090 chưa áp).
 *
 * Quyền: `galleries:share` + đúng chi nhánh của bộ. Mã trần chỉ đọc lại từ bản
 * mã hoá (BB-201), không bao giờ ghi vào nhật ký.
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { diaChiDayDu } from "@/lib/lark/ghi-link-app";
import {
  linkGiaDinhSong,
  giaiMaLink,
  duongDanGiaDinh,
  duongDanManCon,
  duocDoiLinkGiaDinh,
} from "@/lib/gia-dinh/link-gia-dinh";
import { soThuTuCacBo } from "@/lib/gia-dinh/bo-anh-gia-dinh";
import { TRANG_THAI_AN_VOI_GIA_DINH } from "@/lib/auth/phien-bo-anh";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:share");
    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const admin = createAdminClient();
    const { data: g, error } = await admin
      .from("galleries")
      .select("id, branch_id, customer_id, status, photo_count")
      .eq("id", galleryId)
      .maybeSingle();
    if (error) throw error;
    if (!g) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, String(g.branch_id));

    // Link cũ theo bộ của CHÍNH bộ này còn mở được (sống, chưa hết hạn).
    const { data: cu, error: cuErr } = await admin
      .from("share_links")
      .select("id, expires_at")
      .eq("gallery_id", galleryId)
      .eq("status", "active");
    if (cuErr) throw cuErr;
    const soLinkCuConSong = (cu ?? []).filter(
      (l) => !l.expires_at || new Date(l.expires_at as string) > new Date(),
    ).length;

    const soAnh = (g.photo_count as number | null) ?? 0;
    const an = TRANG_THAI_AN_VOI_GIA_DINH as readonly string[];

    if (!g.customer_id) {
      return ok({
        customerId: null,
        soThuTu: null,
        coAnh: soAnh > 0,
        hienVoiGiaDinh: false,
        linkGiaDinh: null,
        soLinkCuConSong,
        duocDoi: duocDoiLinkGiaDinh(staff),
      });
    }

    const customerId = g.customer_id as string;
    const soThuTu = (await soThuTuCacBo(admin, customerId)).get(galleryId) ?? null;

    const song = await linkGiaDinhSong(admin, customerId);
    let linkGiaDinh = null;
    if (song) {
      const ma = await giaiMaLink(admin, song);
      const duongDanManConBo = ma && soThuTu ? duongDanManCon(ma, soThuTu) : null;
      linkGiaDinh = {
        shareLinkId: song.id,
        tokenPrefix: song.token_prefix,
        duongDan: ma ? duongDanGiaDinh(ma) : null,
        duongDanManCon: duongDanManConBo,
        diaChiManCon: duongDanManConBo ? diaChiDayDu(duongDanManConBo) : null,
        soLanMo: song.view_count ?? 0,
      };
    }

    return ok({
      customerId,
      soThuTu,
      coAnh: soAnh > 0,
      hienVoiGiaDinh: soAnh > 0 && !an.includes(g.status as string),
      linkGiaDinh,
      soLinkCuConSong,
      duocDoi: duocDoiLinkGiaDinh(staff),
    });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền xem link gia đình");
    return failUnexpected(err, requestId);
  }
}
