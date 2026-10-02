/**
 * BB-359 (2b) — khách mở bộ ảnh đã thu gọn → app tự Đồng bộ lại từ Drive ở nền.
 *
 *   POST /api/g/mo-lai-anh — phiên khách mọi vai (ba mẹ + ông bà qua link mời gia đình,
 *        BB-360; trước đây chỉ `owner`). Nhận việc
 *        bằng hàm SQL `nhan_mo_lai_anh` (khoá + 10 phút/bộ + tối đa 3 bộ cùng lúc),
 *        rồi chạy CHÍNH `dongBoBoAnh` trong `after()`. Xong thì phát sự kiện tức thì
 *        cho kênh của bộ (BB-342) để màn khách nạp lại ảnh không cần F5.
 *   GET  /api/g/mo-lai-anh — một câu nhỏ "bộ còn thu gọn không" để màn khách hỏi
 *        lại khi Realtime không tới (lưới đỡ). Mọi vai của phiên đều hỏi được.
 *
 * Mã bộ ảnh luôn lấy từ phiên đã ký — không nhận id từ người gọi.
 * Xem src/lib/gallery/mo-lai-anh-thu-gon.ts cho bốn lớp chặn.
 */
import { randomUUID } from "node:crypto";
import { NextResponse, after } from "next/server";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { batDauDongBo, dongBoBoAnh, ghiLoiDongBo } from "@/lib/drive/sync-gallery";
import { VAI_MO_LAI_ANH, boDangThuGon, nhanMoLaiAnh } from "@/lib/gallery/mo-lai-anh-thu-gon";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { phatSuKienBoAnh } from "@/lib/supabase/tuc-thi";
import { LOAI_TUC_THI } from "@/lib/utils/tuc-thi-su-kien";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requireGallerySession();
    const admin = createAdminClient();
    return ok({ thuGon: await boDangThuGon(admin, session.galleryId) });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}

export async function POST(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requireGallerySession(VAI_MO_LAI_ANH);
    const galleryId = session.galleryId;
    const admin = createAdminClient();

    const kq = await nhanMoLaiAnh(admin, galleryId);
    if (kq !== "da_nhan") return ok({ trangThai: kq });

    const thongTin = await batDauDongBo(admin, galleryId);
    await ghiNhatKy({
      actorType: "customer",
      actorLabel: "khach_mo_lai",
      action: "gallery.mo_lai_anh_thu_gon",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: { jobId: requestId, vai: session.role },
    });

    after(async () => {
      try {
        await dongBoBoAnh(admin, galleryId, thongTin, requestId);
        // Trigger 0088 xoá dấu thu gọn khi last_synced_at đổi → GET trả thuGon: false.
        await phatSuKienBoAnh({ galleryId, loai: LOAI_TUC_THI.studioMoLaiAnh }, admin);
      } catch (err) {
        await ghiLoiDongBo(admin, galleryId, thongTin.giaiDoanDau, err).catch(() => {});
      }
    });

    return NextResponse.json({ data: { trangThai: "da_nhan" } }, { status: 202 });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
