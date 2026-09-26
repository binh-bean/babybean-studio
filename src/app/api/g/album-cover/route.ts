import { NextRequest } from "next/server";
import { requireGallerySession, GallerySessionError, EDITING_ROLES } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail, readJsonBody } from "@/lib/api-response";
import { isGalleryLocked } from "@/lib/gallery-status";
import { nhomSanPham } from "@/lib/products/nhom-san-pham";
import { SetAlbumCoverSchema } from "./schema";

/**
 * POST /api/g/album-cover — Ba mẹ chọn (hoặc đổi) ảnh bìa cho một ALBUM TRONG
 * GÓI.
 *
 * OWNER: DEV-BE. Task BB-202.
 * Spec: docs/19-ban-yeu-cau-dot-1.md mục 1.
 *
 * BA LUẬT, chốt của chủ studio 26/09/2026:
 * 1. Chỉ đặt bìa cho dòng hợp đồng THẬT SỰ là album (`nhomSanPham === 'album'`)
 *    của đúng bộ ảnh này — không đoán một mã dòng hàng bất kỳ.
 * 2. Ảnh làm bìa phải là ảnh ĐÃ THẢ TIM (`mark === 'selected'`) của ĐÚNG lượt
 *    chọn đang mở — không mượn ảnh của lượt chọn khác (bà, dì).
 * 3. Mỗi album chỉ có MỘT bìa — đặt lại là THAY, không cộng dồn.
 *
 * Vai `viewer` (link người thân chỉ xem) không gọi được — `EDITING_ROLES`
 * cùng danh sách với `/api/g/placements`.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireGallerySession(EDITING_ROLES);

    const jsonBody = await readJsonBody(request);
    if (!jsonBody.ok) {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = SetAlbumCoverSchema.safeParse(jsonBody.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    const admin = createAdminClient();

    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, status")
      .eq("id", session.galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    if (isGalleryLocked(gallery.status)) {
      return fail("GALLERY_LOCKED", "Bộ ảnh đã được chốt, không thể đổi ảnh bìa album");
    }

    // Luật 1: dòng hàng phải THẬT SỰ là album của đúng bộ ảnh này.
    const { data: galleryItem, error: itemError } = await admin
      .from("gallery_items")
      .select("id, gallery_id, product:products(kind, material)")
      .eq("id", input.galleryItemId)
      .eq("gallery_id", session.galleryId)
      .single();

    if (itemError || !galleryItem) {
      return fail("NOT_FOUND", "Không tìm thấy album này trong hợp đồng của bộ ảnh");
    }

    const prod = Array.isArray(galleryItem.product) ? galleryItem.product[0] : galleryItem.product;
    if (!prod || nhomSanPham(prod.kind, prod.material ?? null) !== "album") {
      return fail("INVALID_INPUT", "Dòng hàng này không phải là album, không đặt bìa được");
    }

    // Luật 2: ảnh phải ĐÃ THẢ TIM của ĐÚNG lượt chọn đang mở.
    const { data: selectionItem, error: siError } = await admin
      .from("selection_items")
      .select("id, mark")
      .eq("selection_id", session.selectionId)
      .eq("gallery_id", session.galleryId)
      .eq("photo_id", input.photoId)
      .maybeSingle();

    if (siError || !selectionItem) {
      return fail("NOT_FOUND", "Ảnh không thuộc lượt chọn này");
    }
    if (selectionItem.mark !== "selected") {
      return fail("CONFLICT", "Ba mẹ thả tim chọn tấm này trước, rồi mới đặt làm bìa được");
    }

    // Luật 3: một album một bìa — upsert theo gallery_item_id (khoá duy nhất
    // của bảng album_covers, migration 0075).
    const { error: upsertError } = await admin.from("album_covers").upsert(
      {
        gallery_id: session.galleryId,
        selection_id: session.selectionId,
        gallery_item_id: input.galleryItemId,
        selection_item_id: selectionItem.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gallery_item_id" },
    );

    if (upsertError) {
      console.error("[POST /api/g/album-cover]", upsertError);
      return fail("INTERNAL", "Không lưu được ảnh bìa, ba mẹ thử lại giúp");
    }

    return ok({ galleryItemId: input.galleryItemId, photoId: input.photoId });
  } catch (error) {
    if (error instanceof GallerySessionError) {
      return fail(error.code);
    }
    console.error("[POST /api/g/album-cover]", error);
    return fail("INTERNAL");
  }
}
