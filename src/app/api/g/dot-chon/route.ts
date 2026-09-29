/**
 * GET /api/g/dot-chon — trạng thái "Chọn thêm ảnh" của bộ ảnh đang mở.
 *
 * OWNER: DEV-BE. Task BB-321. Màn khách gọi để biết: đã vào chế độ chọn thêm
 * chưa, ảnh nào thuộc đợt nào (huy hiệu "Đã chốt đợt N"), mỗi đợt đang chờ /
 * đã xác nhận / bị từ chối kèm lý do, giá mỗi ảnh thêm.
 *
 * Mọi vai đều đọc được (kể cả người xem) nhưng KHÔNG có tiền của ba mẹ cho
 * viewer — chủ studio chốt ông bà không thấy tiền phát sinh (BB-254).
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { dangCheDoChonThem } from "@/lib/gallery/dot-chon";
import { layTrangThaiDotChoKhach } from "@/lib/gallery/dot-chon-server";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requireGallerySession();
    const admin = createAdminClient();

    const { data: gallery } = await admin
      .from("galleries")
      .select("id, status, extra_photo_price, lark_trang_thai")
      .eq("id", session.galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    const tt = await layTrangThaiDotChoKhach(admin, {
      galleryId: session.galleryId,
      selectionId: session.selectionId,
      // Trạng thái app HOẶC Lark đã chốt (BB-285): cùng hàm quyết định với luật khoá.
      cheDoChonThem: dangCheDoChonThem(gallery.status, gallery.lark_trang_thai),
      giaMoiAnh: Number(gallery.extra_photo_price ?? 0),
    });

    if (session.role === "viewer") {
      // Ông bà: chỉ cần biết ảnh nào đã chốt, không thấy tiền/giá.
      return ok({
        ...tt,
        giaMoiAnh: 0,
        hanMuc: null,
        cacDot: tt.cacDot.map((d) => ({ ...d, tienAnh: 0, tienSanPham: 0, tong: 0 })),
        banNhap: null,
        soAnhThieu: null,
        dot1: { nhoStudioChonThem: 0, dongYAnhStudioChon: false, soSanPhamInChuaAnh: 0, bietAnhInChamHon: false },
        coTheChot: false,
      });
    }

    return ok({ ...tt, coTheChot: session.role === "owner" });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
