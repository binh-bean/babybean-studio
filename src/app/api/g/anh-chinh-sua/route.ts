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
import { chuanHoaVung } from "@/lib/anh-chinh-sua/nhan-dien";
import { docSoNgaySuaDuKien } from "@/lib/anh-chinh-sua/han-sua";
import {
  docBoiCanhAnhChinh,
  docChiTietVong,
  docVongSua,
  coBangChiTiet,
  coBucketAnhMau,
  khachThayTrongBoiCanh,
} from "@/lib/anh-chinh-sua/du-lieu";
import {
  KHOA_TRONG_GOI,
  duocQuyetAnhChinh,
  gomTheoDot,
  laKhoaMuaThem,
  nhanCuaKhoa,
  trangThaiDuyetDot,
  trangThaiDuyetTrongGoi,
} from "@/lib/anh-chinh-sua/theo-dot";

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

    const [bc, vong, chiTiet, coBang, coBucket, soNgaySua] = await Promise.all([
      docBoiCanhAnhChinh(admin, gallery.id),
      docVongSua(admin, gallery.id, true),
      docChiTietVong(admin, gallery.id),
      coBangChiTiet(admin),
      coBucketAnhMau(admin),
      // BB-387 — "trong khoảng {n} ngày" cho lời Bean khi ba mẹ xin sửa (chưa có dòng → 3).
      // KHÔNG trả tên thợ chỉnh ra màn khách.
      docSoNgaySuaDuKien(admin),
    ]);
    // BB-377 — mỗi tấm theo mốc gửi của ĐÚNG đợt nó (trong gói / mua thêm đợt N).
    const duocXem = bc.anhChinh.filter((a) => khachThayTrongBoiCanh(bc, gallery.status, a));
    const theoDot = bc.mocDot !== null;
    const laChu = duocQuyetAnhChinh(session.role);

    const gocTheoId = new Map(bc.goc.map((g) => [g.id, g]));
    const anh = duocXem.map((a) => {
      const g = gocTheoId.get(bc.gocCua.get(a.id) ?? "");
      return {
        id: a.id,
        fileName: a.file_name,
        width: a.width,
        height: a.height,
        maTepDrive: a.drive_file_id,
        khoa: bc.khoaCua.get(a.id) ?? KHOA_TRONG_GOI,
        goc: g
          ? { id: g.id, fileName: g.file_name, width: g.width, height: g.height, maTepDrive: g.drive_file_id }
          : null,
      };
    });

    // Đợt của một vòng sửa: cột `dot_khoa` (0095); chưa áp thì suy từ tấm đầu tiên.
    const khoaCuaVong = (v: { id: string; dot_khoa: string | null }) => {
      if (v.dot_khoa) return v.dot_khoa;
      const muc = chiTiet.find((c) => c.revision_request_id === v.id);
      return (muc && bc.khoaCua.get(muc.photo_id)) || KHOA_TRONG_GOI;
    };

    const nhom = gomTheoDot(anh, bc.nhom).map((g) => {
      const vongMo = vong.some((v) => v.resolved_at === null && khoaCuaVong(v) === g.khoa);
      const trangThai =
        theoDot && laKhoaMuaThem(g.khoa)
          ? trangThaiDuyetDot(bc.mocDot!.get(g.khoa), vongMo)
          : trangThaiDuyetTrongGoi(gallery.status, vongMo);
      return {
        khoa: g.khoa,
        nhan: g.nhan,
        soAnh: g.anh.length,
        trangThai,
        // Chỉ người nhận link CHÍNH quyết duyệt/xin sửa (cùng luật /api/g/review).
        duocQuyet: laChu && trangThai === "cho_duyet",
      };
    });

    const idDuocXem = new Set(duocXem.map((a) => a.id));
    const vongSua = vong.map((v) => {
      const khoa = khoaCuaVong(v);
      return {
        round: v.round,
        note: v.note,
        createdAt: v.created_at,
        resolved: v.resolved_at !== null,
        khoa,
        nhan: nhanCuaKhoa(khoa, bc.nhom),
        items: chiTiet
          .filter((c) => c.revision_request_id === v.id && idDuocXem.has(c.photo_id))
          .map((c) => ({
            photoId: c.photo_id,
            note: c.note,
            marks: chuanHoaVung(c.marks),
            soAnhMau: c.reference_paths?.length ?? 0,
          })),
      };
    });

    return ok({
      trangThai: gallery.status,
      // Vòng duyệt cũ (một quyết định cho cả bộ): ảnh trong gói, hoặc mọi tấm khi chưa áp 0095.
      duocQuyet: gallery.status === "awaiting_approval" && laChu && duocXem.length > 0,
      theoDot,
      anh,
      nhom,
      vongSua,
      tinhNang: { vungKhoanh: coBang, anhMau: coBang && coBucket },
      laChu,
      soNgaySua,
    });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
