/**
 * POST /api/g/anh-chinh-sua/duyet-tam — ba mẹ bấm "Duyệt tấm này" / bỏ duyệt MỘT tấm ảnh
 * chỉnh (BB-401 vòng 2). Lưu ngay khi bấm để mở máy khác vẫn thấy, và thợ/CSKH biết
 * khách đã ưng những tấm nào.
 *
 *   { photoId, duyet: true }  → ghi dấu duyệt (bảng 0108 `anh_chinh_duyet_tam`)
 *   { photoId, duyet: false } → xoá dấu (ba mẹ đổi sang "Cần sửa tấm này")
 *
 * Luật (cùng /api/g/review): bộ ảnh lấy từ PHIÊN đã ký, không từ thân yêu cầu; chỉ người
 * nhận link CHÍNH; tấm phải là ảnh chỉnh ba mẹ ĐANG được thấy, và vòng của tấm đang chờ
 * duyệt. Chưa áp 0108 → `{ luuMayChu: false }` (200, không lỗi — màn khách giữ dấu trên máy).
 * Không đổi trạng thái bộ ảnh, không gửi Lark: đây chỉ là bản nháp có lưu của ba mẹ.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { docBoiCanhAnhChinh, docVongSua, khachThayTrongBoiCanh } from "@/lib/anh-chinh-sua/du-lieu";
import {
  KHOA_TRONG_GOI,
  duocQuyetAnhChinh,
  laKhoaMuaThem,
  trangThaiDuyetDot,
  type TrangThaiDuyetDot,
} from "@/lib/anh-chinh-sua/theo-dot";
import { duyetLeDuoc } from "@/lib/anh-chinh-sua/duyet-tung-tam";
import { ghiDuyetTam } from "@/lib/anh-chinh-sua/duyet-tam-du-lieu";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requirePhienBoAnh(request);
    if (!duocQuyetAnhChinh(session.role)) {
      return fail("FORBIDDEN", "Chỉ người nhận link chính mới duyệt được ảnh");
    }
    const jsonBody = await readJsonBody(request);
    const body = (jsonBody.ok ? jsonBody.data : null) as { photoId?: unknown; duyet?: unknown } | null;
    if (typeof body?.photoId !== "string" || typeof body?.duyet !== "boolean") {
      return fail("INVALID_INPUT", "Thiếu tấm ảnh hoặc quyết định duyệt");
    }

    const admin = createAdminClient();
    const { data: gallery } = await admin.from("galleries").select("id, status").eq("id", session.galleryId).maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    const bc = await docBoiCanhAnhChinh(admin, gallery.id);
    const anh = bc.anhChinh.find((a) => a.id === body.photoId);
    if (!anh || !khachThayTrongBoiCanh(bc, gallery.status, anh)) return fail("NOT_FOUND", "Không tìm thấy ảnh ạ.");

    const khoa = bc.khoaCua.get(anh.id) ?? KHOA_TRONG_GOI;
    const laDotMuaThemRieng = bc.mocDot !== null && laKhoaMuaThem(khoa);
    let trangThaiDot: TrangThaiDuyetDot | null = null;
    if (laDotMuaThemRieng) {
      const vong = await docVongSua(admin, gallery.id, false);
      trangThaiDot = trangThaiDuyetDot(
        bc.mocDot!.get(khoa),
        vong.some((v) => v.resolved_at === null && v.dot_khoa === khoa),
      );
    }
    if (!duyetLeDuoc({ trangThaiBo: gallery.status, laDotMuaThemRieng, trangThaiDot })) {
      return fail("INVALID_INPUT", "Ảnh này không còn ở bước duyệt ạ.");
    }

    const kq = await ghiDuyetTam(admin, {
      galleryId: gallery.id,
      photoId: anh.id,
      // Vòng của tấm: trong gói ("goc") khi chưa tách đợt; đợt mua thêm khi đã áp 0095.
      khoa: laDotMuaThemRieng ? khoa : KHOA_TRONG_GOI,
      duyet: body.duyet,
      luc: new Date().toISOString(),
    });
    return ok({ luuMayChu: kq === "ok", photoId: anh.id, duyet: body.duyet });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
