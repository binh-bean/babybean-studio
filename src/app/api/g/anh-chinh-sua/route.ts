/**
 * GET /api/g/anh-chinh-sua — ảnh đã chỉnh của bộ ảnh trong phiên, xem ngay trong app (BB-371).
 *
 * Trả về CHỈ những tấm khách đã được thấy (`khachThayAnhChinh`): CSKH đã bấm
 * "Gửi khách duyệt" và tấm ảnh có mặt trước lúc gửi. Bộ ảnh lấy từ PHIÊN đã ký
 * (`requirePhienBoAnh`), không bao giờ từ tham số — khách bộ A không có đường
 * nào hỏi ảnh của bộ B.
 *
 * Mỗi tấm kèm ảnh gốc ghép theo tên tệp (để so trước/sau) và các lần ba mẹ đã
 * xin sửa tấm đó (ghi chú, vùng khoanh — không kèm ảnh mẫu: ảnh mẫu chỉ nhân
 * viên mở bằng URL ký).
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghepAnhChinhVoiGoc, khachThayAnhChinh, chuanHoaVung } from "@/lib/anh-chinh-sua/nhan-dien";
import {
  docAnhChinh,
  docAnhGoc,
  docMocGui,
  docChiTietVong,
  coBangChiTiet,
  coBucketAnhMau,
} from "@/lib/anh-chinh-sua/du-lieu";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requirePhienBoAnh(request);
    const admin = createAdminClient();

    const { data: gallery } = await admin
      .from("galleries")
      .select("id, status")
      .eq("id", session.galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    const [tatCa, guiLuc] = await Promise.all([docAnhChinh(admin, gallery.id), docMocGui(admin, gallery.id)]);
    const duocXem = tatCa.filter((a) => khachThayAnhChinh(gallery.status, guiLuc, a.created_at));

    const [{ data: vong }, chiTiet, coBang, coBucket] = await Promise.all([
      admin
        .from("revision_requests")
        .select("id, round, note, created_at, resolved_at")
        .eq("gallery_id", gallery.id)
        .order("round", { ascending: true }),
      docChiTietVong(admin, gallery.id),
      coBangChiTiet(admin),
      coBucketAnhMau(admin),
    ]);

    let anh: unknown[] = [];
    if (duocXem.length > 0) {
      const goc = await docAnhGoc(admin, gallery.id);
      const ghep = ghepAnhChinhVoiGoc(
        duocXem.map((a) => ({ id: a.id, fileName: a.file_name })),
        goc.map((g) => ({ id: g.id, fileName: g.file_name })),
      );
      const gocTheoId = new Map(goc.map((g) => [g.id, g]));
      anh = duocXem.map((a) => {
        const g = gocTheoId.get(ghep.get(a.id) ?? "");
        return {
          id: a.id,
          fileName: a.file_name,
          width: a.width,
          height: a.height,
          maTepDrive: a.drive_file_id,
          goc: g
            ? { id: g.id, fileName: g.file_name, width: g.width, height: g.height, maTepDrive: g.drive_file_id }
            : null,
        };
      });
    }

    const idDuocXem = new Set(duocXem.map((a) => a.id));
    const vongSua = (vong ?? []).map((v) => ({
      round: v.round as number,
      note: v.note as string,
      createdAt: v.created_at as string,
      resolved: v.resolved_at !== null,
      items: chiTiet
        .filter((c) => c.revision_request_id === v.id && idDuocXem.has(c.photo_id))
        .map((c) => ({
          photoId: c.photo_id,
          note: c.note,
          marks: chuanHoaVung(c.marks),
          soAnhMau: c.reference_paths?.length ?? 0,
        })),
    }));

    return ok({
      trangThai: gallery.status,
      // Chỉ người nhận link CHÍNH quyết duyệt/xin sửa (cùng luật /api/g/review).
      duocQuyet: gallery.status === "awaiting_approval" && session.role === "owner" && duocXem.length > 0,
      anh,
      vongSua,
      tinhNang: { vungKhoanh: coBang, anhMau: coBang && coBucket },
    });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
