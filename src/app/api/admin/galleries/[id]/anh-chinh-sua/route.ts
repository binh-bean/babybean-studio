/**
 * GET /api/admin/galleries/[id]/anh-chinh-sua — ảnh chỉnh sửa của một bộ ảnh cho nhân viên (BB-371).
 *
 * Trả: từng tấm ảnh chỉnh (ghép ảnh gốc theo tên), tấm nào CHƯA gửi khách
 * (mới về sau lần "Gửi khách duyệt" gần nhất), và các vòng khách xin sửa với
 * đủ chi tiết từng tấm: ghi chú, vùng khoanh, ảnh mẫu (URL KÝ 10 phút — bucket
 * riêng tư, không bao giờ trả đường công khai).
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghepAnhChinhVoiGoc, laAnhChuaGui, chuanHoaVung, TRANG_THAI_GUI_DUOC } from "@/lib/anh-chinh-sua/nhan-dien";
import {
  BUCKET_ANH_MAU,
  HAN_URL_KY_GIAY,
  coBangChiTiet,
  docAnhChinh,
  docAnhGoc,
  docChiTietVong,
  docMocGui,
} from "@/lib/anh-chinh-sua/du-lieu";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, status, editor_id")
      .eq("id", galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);
    if (staff.role === "photoshop_ctv" && gallery.editor_id !== staff.staffId) {
      return fail("FORBIDDEN", "Bộ ảnh này không giao cho bạn");
    }

    const [anhChinh, guiLuc, { data: vong }, chiTiet, coBang] = await Promise.all([
      docAnhChinh(admin, galleryId),
      docMocGui(admin, galleryId),
      admin
        .from("revision_requests")
        .select("id, round, note, created_at, resolved_at")
        .eq("gallery_id", galleryId)
        .order("round", { ascending: false }),
      docChiTietVong(admin, galleryId),
      coBangChiTiet(admin),
    ]);

    const goc = anhChinh.length > 0 ? await docAnhGoc(admin, galleryId) : [];
    const ghep = ghepAnhChinhVoiGoc(
      anhChinh.map((a) => ({ id: a.id, fileName: a.file_name })),
      goc.map((g) => ({ id: g.id, fileName: g.file_name })),
    );
    const gocTheoId = new Map(goc.map((g) => [g.id, g]));
    const tenTheoId = new Map<string, string>([
      ...anhChinh.map((a) => [a.id, a.file_name] as [string, string]),
      ...goc.map((g) => [g.id, g.file_name] as [string, string]),
    ]);

    // URL ký cho mọi ảnh mẫu trong một lượt.
    const duongDan = [...new Set(chiTiet.flatMap((c) => c.reference_paths ?? []))];
    const urlKy = new Map<string, string>();
    if (duongDan.length > 0) {
      const { data: ky } = await admin.storage.from(BUCKET_ANH_MAU).createSignedUrls(duongDan, HAN_URL_KY_GIAY);
      for (const k of ky ?? []) if (k.path && k.signedUrl) urlKy.set(k.path, k.signedUrl);
    }

    const anh = anhChinh.map((a) => {
      const g = gocTheoId.get(ghep.get(a.id) ?? "");
      return {
        id: a.id,
        fileName: a.file_name,
        width: a.width,
        height: a.height,
        taoLuc: a.created_at,
        chuaGui: laAnhChuaGui(guiLuc, a.created_at),
        goc: g ? { id: g.id, fileName: g.file_name } : null,
      };
    });
    const soChuaGui = anh.filter((a) => a.chuaGui).length;

    return ok({
      trangThai: gallery.status,
      guiLuc,
      anh,
      soChuaGui,
      coTheGui:
        anh.length > 0 &&
        (TRANG_THAI_GUI_DUOC as readonly string[]).includes(gallery.status) &&
        (gallery.status !== "awaiting_approval" || soChuaGui > 0),
      vongSua: (vong ?? []).map((v) => ({
        round: v.round as number,
        note: v.note as string,
        createdAt: v.created_at as string,
        resolved: v.resolved_at !== null,
        items: chiTiet
          .filter((c) => c.revision_request_id === v.id)
          .map((c) => ({
            photoId: c.photo_id,
            fileName: tenTheoId.get(c.photo_id) ?? "",
            gocId: c.original_photo_id,
            note: c.note,
            marks: chuanHoaVung(c.marks),
            anhMau: (c.reference_paths ?? []).map((p) => urlKy.get(p)).filter((u): u is string => !!u),
          })),
      })),
      tinhNang: { chiTiet: coBang },
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
