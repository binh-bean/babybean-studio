import { NextRequest } from "next/server";
import { z } from "zod";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import type { GallerySession } from "@/types/domain";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail, readJsonBody } from "@/lib/api-response";
import { isGalleryLocked, maLarkConHieuLuc } from "@/lib/gallery-status";
import { laLoiChuaApMigration } from "@/lib/gallery/dot-chon-server";
import { CAU_LY_DO_KHACH, kiemChonAlbumKhongChinh } from "@/lib/gallery/anh-album-khong-chinh";
import {
  BANG_ANH_ALBUM_KHONG_CHINH,
  docAnhAlbumKhongChinh,
  docSoSuatAlbumKhongChinh,
} from "@/lib/gallery/anh-album-khong-chinh-server";

/**
 * POST   /api/g/album-khong-chinh  { photoId } — chọn một tấm cho suất "Ảnh album không chỉnh sửa"
 * DELETE /api/g/album-khong-chinh  { photoId } — bỏ tấm đó ra
 *
 * BB-374 (anh chốt 06/10/2026). Luật:
 *   1. Số tấm tối đa = số suất CSKH đã thêm vào hợp đồng (`gallery_items` loại `album_unedited`).
 *      Khách KHÔNG tự thêm suất: sản phẩm này không bán ở cửa hàng (`sanPhamBanChoKhach`), và
 *      route này không có tham số số lượng nào — chỉ đọc số suất từ hợp đồng.
 *   2. Tấm đang thả tim (ảnh chỉnh sửa, trong hạn mức) không vào được — một tấm không thể là cả hai.
 *   3. KHÔNG ghi `selection_items`: tấm "không chỉnh" nằm ở bảng riêng nên không bao giờ vào
 *      hạn mức hay tiền vượt (`v_over_quota_unbilled`, `snapshot_extra_*` đều đếm `selection_items`).
 *   4. Bộ đã khoá (cùng luật `patch_selection_batch`) thì không đổi được.
 *
 * Chỉ ba mẹ (owner) và người cùng chọn (co_editor): người thân gợi ý (suggester) không quyết
 * ảnh in vào album.
 */
const VAI_DUOC_CHON = ["owner", "co_editor"] as const;

const Schema = z.object({ photoId: z.string().uuid("photoId không hợp lệ") });

async function kiemBoAnh(admin: ReturnType<typeof createAdminClient>, session: GallerySession) {
  const { data: gallery } = await admin
    .from("galleries")
    .select("id, status, lark_trang_thai, lark_trang_thai_tu, reopened_at")
    .eq("id", session.galleryId)
    .maybeSingle();
  if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
  if (isGalleryLocked(gallery.status, maLarkConHieuLuc(gallery))) {
    return fail("GALLERY_LOCKED", "Bộ ảnh đã chốt, ba mẹ nhắn Bean nếu muốn đổi ảnh album ạ.");
  }
  return null;
}

async function docInput(request: NextRequest) {
  const body = await readJsonBody(request);
  const raw = body.ok && body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};
  if (!raw.photoId) {
    const q = new URL(request.url).searchParams.get("photoId");
    if (q) raw.photoId = q;
  }
  return Schema.safeParse(raw);
}

async function trangThai(admin: ReturnType<typeof createAdminClient>, session: GallerySession) {
  const [soSuat, daChon] = await Promise.all([
    docSoSuatAlbumKhongChinh(admin, session.galleryId),
    docAnhAlbumKhongChinh(admin, session.selectionId),
  ]);
  return { soSuat, photoIds: daChon.photoIds, coBang: daChon.coBang };
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePhienBoAnh(request, VAI_DUOC_CHON);
    const parsed = await docInput(request);
    if (!parsed.success) return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    const { photoId } = parsed.data;

    const admin = createAdminClient();
    const chan = await kiemBoAnh(admin, session);
    if (chan) return chan;

    // Ảnh phải thuộc ĐÚNG bộ đang mở — id ảnh đến từ thân yêu cầu, không tin cậy.
    const { data: anh } = await admin
      .from("photos")
      .select("id")
      .eq("id", photoId)
      .eq("gallery_id", session.galleryId)
      .maybeSingle();
    if (!anh) return fail("NOT_FOUND", "Ảnh không thuộc bộ ảnh này");

    const truoc = await trangThai(admin, session);
    const { data: tim } = await admin
      .from("selection_items")
      .select("id")
      .eq("selection_id", session.selectionId)
      .eq("photo_id", photoId)
      .eq("mark", "selected")
      .maybeSingle();

    const lyDo = kiemChonAlbumKhongChinh({
      soSuat: truoc.soSuat,
      soDaChon: truoc.photoIds.length,
      daCoTamNay: truoc.photoIds.includes(photoId),
      laAnhChinhSua: !!tim,
    });
    if (lyDo) return fail("CONFLICT", CAU_LY_DO_KHACH[lyDo], { lyDo });
    if (!truoc.coBang) return fail("CONFLICT", CAU_LY_DO_KHACH.KHONG_CO_SUAT, { lyDo: "KHONG_CO_SUAT" });

    if (!truoc.photoIds.includes(photoId)) {
      const { error } = await admin
        .from(BANG_ANH_ALBUM_KHONG_CHINH)
        .upsert(
          { gallery_id: session.galleryId, selection_id: session.selectionId, photo_id: photoId },
          { onConflict: "selection_id,photo_id", ignoreDuplicates: true },
        );
      if (error) {
        if (laLoiChuaApMigration(error)) return fail("CONFLICT", CAU_LY_DO_KHACH.KHONG_CO_SUAT, { lyDo: "KHONG_CO_SUAT" });
        throw error;
      }
      // Hai lượt bấm cùng lúc có thể cùng qua bước đếm: đếm lại SAU khi ghi, vượt thì trả lại.
      const sau = await docAnhAlbumKhongChinh(admin, session.selectionId);
      if (sau.photoIds.length > truoc.soSuat) {
        await admin
          .from(BANG_ANH_ALBUM_KHONG_CHINH)
          .delete()
          .eq("selection_id", session.selectionId)
          .eq("photo_id", photoId);
        return fail("CONFLICT", CAU_LY_DO_KHACH.HET_SUAT, { lyDo: "HET_SUAT" });
      }
    }

    const moi = await trangThai(admin, session);
    return ok({ soSuat: moi.soSuat, photoIds: moi.photoIds });
  } catch (error) {
    if (error instanceof GallerySessionError) return fail(error.code);
    console.error("[POST /api/g/album-khong-chinh]", error);
    return fail("INTERNAL");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requirePhienBoAnh(request, VAI_DUOC_CHON);
    const parsed = await docInput(request);
    if (!parsed.success) return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    const { photoId } = parsed.data;

    const admin = createAdminClient();
    const chan = await kiemBoAnh(admin, session);
    if (chan) return chan;

    // Xoá theo CẢ lượt chọn của phiên: id ảnh của bộ khác không khớp dòng nào.
    const { error } = await admin
      .from(BANG_ANH_ALBUM_KHONG_CHINH)
      .delete()
      .eq("selection_id", session.selectionId)
      .eq("photo_id", photoId);
    if (error && !laLoiChuaApMigration(error)) throw error;

    const moi = await trangThai(admin, session);
    return ok({ soSuat: moi.soSuat, photoIds: moi.photoIds });
  } catch (error) {
    if (error instanceof GallerySessionError) return fail(error.code);
    console.error("[DELETE /api/g/album-khong-chinh]", error);
    return fail("INTERNAL");
  }
}
