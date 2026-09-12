import { NextRequest } from "next/server";
import { requireGallerySession, GallerySessionError, EDITING_ROLES } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api-response";
import { PlacePhotoSchema, RemovePhotoPlacementSchema } from "./schema";

/**
 * POST /api/g/placements — Đặt một ảnh vào một sản phẩm in
 * DELETE /api/g/placements — Gỡ ảnh ra khỏi sản phẩm in
 *
 * BA LUẬT (BB-113):
 * 1. CHỈ cho đặt vào sản phẩm mà hợp đồng THẬT SỰ có (gallery_items của bộ ảnh đó, kind = 'print').
 * 2. Đặt ảnh vào sản phẩm in KHÔNG tiêu thêm hạn mức.
 * 3. Một ảnh đặt được vào NHIỀU sản phẩm (bảng nối selection_placements).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireGallerySession(EDITING_ROLES);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = PlacePhotoSchema.safeParse(body);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    const admin = createAdminClient();

    // 1. Kiểm tra trạng thái bộ ảnh
    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, status")
      .eq("id", session.galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    if (
      gallery.status === "submitted" ||
      gallery.status === "in_retouch" ||
      gallery.status === "delivered" ||
      gallery.status === "archived"
    ) {
      return fail("GALLERY_LOCKED", "Bộ ảnh đã được chốt, không thể thay đổi ảnh in");
    }

    // 2. Luật 1: Kiểm tra sản phẩm in trong hợp đồng (gallery_items)
    const { data: galleryItem, error: itemError } = await admin
      .from("gallery_items")
      .select(`
        id,
        gallery_id,
        product:products (
          id,
          name,
          kind
        )
      `)
      .eq("id", input.galleryItemId)
      .eq("gallery_id", session.galleryId)
      .single();

    if (itemError || !galleryItem) {
      return fail("NOT_FOUND", "Sản phẩm in không có trong hợp đồng của bộ ảnh này");
    }

    const prod = Array.isArray(galleryItem.product) ? galleryItem.product[0] : galleryItem.product;
    if (!prod || prod.kind !== "print") {
      return fail("INVALID_INPUT", "Sản phẩm này không phải là sản phẩm in ấn");
    }

    // 3. Xác định selection_item_id
    let targetSelectionItemId = input.selectionItemId;

    if (targetSelectionItemId) {
      // Kiểm tra selection_item có thuộc về gallery và selection này không
      const { data: si, error: siError } = await admin
        .from("selection_items")
        .select("id, photo_id")
        .eq("id", targetSelectionItemId)
        .eq("selection_id", session.selectionId)
        .eq("gallery_id", session.galleryId)
        .single();

      if (siError || !si) {
        return fail("NOT_FOUND", "Không tìm thấy ảnh đã chọn trong bộ ảnh này");
      }
    } else if (input.photoId) {
      // Kiểm tra ảnh có thuộc về bộ ảnh này không (chặn ảnh bộ ảnh khác)
      const { data: photo, error: photoError } = await admin
        .from("photos")
        .select("id, gallery_id")
        .eq("id", input.photoId)
        .eq("gallery_id", session.galleryId)
        .single();

      if (photoError || !photo) {
        return fail("NOT_FOUND", "Ảnh không thuộc bộ ảnh này");
      }

      // Tìm selection_item hiện có
      const { data: existingSi } = await admin
        .from("selection_items")
        .select("id")
        .eq("selection_id", session.selectionId)
        .eq("photo_id", input.photoId)
        .maybeSingle();

      if (existingSi) {
        targetSelectionItemId = existingSi.id;
      } else {
        // Tạo selection_item mới nếu chưa có
        const mark = session.role === "suggester" ? "suggested" : "selected";
        const { data: newSi, error: insertSiError } = await admin
          .from("selection_items")
          .insert({
            selection_id: session.selectionId,
            photo_id: input.photoId,
            gallery_id: session.galleryId,
            mark,
          })
          .select("id")
          .single();

        if (insertSiError || !newSi) {
          console.error("[POST /api/g/placements] Create selection_item error:", insertSiError);
          return fail("INTERNAL", "Không thể tạo lựa chọn cho ảnh");
        }
        targetSelectionItemId = newSi.id;
      }
    }

    if (!targetSelectionItemId) {
      return fail("INVALID_INPUT", "Không xác định được ảnh cần đặt");
    }

    // 4. Lưu vào bảng selection_placements (Luật 3: Một ảnh đặt được vào nhiều sản phẩm)
    const { error: placementError } = await admin
      .from("selection_placements")
      .upsert(
        {
          selection_item_id: targetSelectionItemId,
          gallery_item_id: input.galleryItemId,
        },
        { onConflict: "selection_item_id,gallery_item_id" }
      );

    if (placementError) {
      console.error("[POST /api/g/placements] Placement error:", placementError);
      return fail("INTERNAL", "Không thể đặt ảnh vào sản phẩm in");
    }

    return ok({
      selectionItemId: targetSelectionItemId,
      galleryItemId: input.galleryItemId,
      photoId: input.photoId,
    });
  } catch (error) {
    if (error instanceof GallerySessionError) {
      return fail(error.code);
    }
    console.error("[POST /api/g/placements]", error);
    return fail("INTERNAL");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireGallerySession(EDITING_ROLES);

    const admin = createAdminClient();

    // 1. Kiểm tra trạng thái bộ ảnh
    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, status")
      .eq("id", session.galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    if (
      gallery.status === "submitted" ||
      gallery.status === "in_retouch" ||
      gallery.status === "delivered" ||
      gallery.status === "archived"
    ) {
      return fail("GALLERY_LOCKED", "Bộ ảnh đã được chốt, không thể thay đổi ảnh in");
    }

    // 2. Parse input từ JSON body hoặc query params
    let rawInput: Record<string, unknown> = {};
    try {
      const body = await request.json();
      if (body && typeof body === "object") {
        rawInput = body as Record<string, unknown>;
      }
    } catch {
      // Body không có hoặc không phải json -> đọc từ URL searchParams
    }

    const url = new URL(request.url);
    if (!rawInput.galleryItemId && url.searchParams.get("galleryItemId")) {
      rawInput.galleryItemId = url.searchParams.get("galleryItemId");
    }
    if (!rawInput.photoId && url.searchParams.get("photoId")) {
      rawInput.photoId = url.searchParams.get("photoId");
    }
    if (!rawInput.selectionItemId && url.searchParams.get("selectionItemId")) {
      rawInput.selectionItemId = url.searchParams.get("selectionItemId");
    }

    const parsed = RemovePhotoPlacementSchema.safeParse(rawInput);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    // 3. Xác định selection_item_id
    let targetSelectionItemId = input.selectionItemId;

    if (!targetSelectionItemId && input.photoId) {
      const { data: si } = await admin
        .from("selection_items")
        .select("id")
        .eq("selection_id", session.selectionId)
        .eq("photo_id", input.photoId)
        .maybeSingle();

      if (si) {
        targetSelectionItemId = si.id;
      }
    }

    if (targetSelectionItemId) {
      await admin
        .from("selection_placements")
        .delete()
        .eq("selection_item_id", targetSelectionItemId)
        .eq("gallery_item_id", input.galleryItemId);
    }

    return ok({ removed: true });
  } catch (error) {
    if (error instanceof GallerySessionError) {
      return fail(error.code);
    }
    console.error("[DELETE /api/g/placements]", error);
    return fail("INTERNAL");
  }
}
