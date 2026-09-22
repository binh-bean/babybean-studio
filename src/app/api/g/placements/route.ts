import { NextRequest } from "next/server";
import { requireGallerySession, GallerySessionError, EDITING_ROLES } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api-response";
import { PlacePhotoSchema, RemovePhotoPlacementSchema } from "./schema";
import { isGalleryLocked } from "@/lib/gallery-status";

/**
 * POST /api/g/placements — Đặt một ảnh vào một sản phẩm in
 * DELETE /api/g/placements — Gỡ ảnh ra khỏi sản phẩm in
 *
 * BA LUẬT (BB-113):
 * 1. CHỈ cho đặt vào sản phẩm mà hợp đồng THẬT SỰ có (gallery_items của bộ ảnh đó, kind = 'print').
 * 2. Đặt ảnh vào sản phẩm in KHÔNG tiêu thêm hạn mức.
 * 3. Một ảnh đặt được vào NHIỀU sản phẩm (bảng nối selection_placements).
 */
/**
 * BB-052 — CỐ Ý không ghi nhật ký cho từng lượt đặt ảnh.
 *
 * Rà soát 22/09/2026 chốt: mọi đường ghi dữ liệu đều phải có dòng nhật ký, trừ
 * những chỗ có lý do viết ra. Đây là một trong số đó.
 *
 * Một bộ ảnh in mười khung là mười lượt đặt, và khách đổi ý giữa chừng thì
 * thành ba bốn chục dòng cho MỘT buổi chụp. Nhật ký sẽ ngập những dòng không
 * ai đọc, và dòng đáng đọc — sửa dòng hàng, mở lại bộ ảnh — chìm mất.
 *
 * Bản thân việc đặt ảnh đã là dữ liệu lưu trong `selection_placements`, xem
 * được ở màn chi tiết bộ ảnh. Còn quyết định cuối của khách thì có
 * `selection.submit` ghi lại đầy đủ.
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

    /*
      BẢN THỨ NĂM của danh sách trạng thái khoá, chép tay.

      Dòng cũ ở đây tự liệt kê bốn trạng thái và thiếu ba cái
      ('awaiting_approval', 'approved', 'expired'). Nó cũng là chỗ làm hỏng
      quyết định 22/09/2026 ("chốt xong vẫn sửa được cho tới khi CSKH xác
      nhận", migration 0060): hàm SQL và bản TypeScript đều đã bỏ 'submitted',
      riêng dòng này thì không — nên ba mẹ chốt xong là hết đặt được ảnh vào
      sản phẩm in, dù mọi chỗ khác đã mở.

      Dùng chung `isGalleryLocked` như mọi nơi.
    */
    if (isGalleryLocked(gallery.status)) {
      return fail("GALLERY_LOCKED", "Bộ ảnh đã được chốt, không thể thay đổi ảnh in");
    }

    /*
      2. Luật 1: sản phẩm in phải có trong hợp đồng (gallery_items).

      Bỏ qua khi đích là ALBUM MUA THÊM: album đó nằm ở `selection_addons`,
      không phải dòng hợp đồng, và nó được kiểm riêng ở bước 4.
    */
    const { data: galleryItem, error: itemError } = input.addonId
      ? { data: null, error: null }
      : await admin
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

    if (!input.addonId) {
      if (itemError || !galleryItem) {
        return fail("NOT_FOUND", "Sản phẩm in không có trong hợp đồng của bộ ảnh này");
      }

      const prod = Array.isArray(galleryItem.product)
        ? galleryItem.product[0]
        : galleryItem.product;
      if (!prod || prod.kind !== "print") {
        return fail("INVALID_INPUT", "Sản phẩm này không phải là sản phẩm in ấn");
      }
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

    /*
      4. Lưu chỗ đặt (Luật 3: một ảnh đặt được vào nhiều sản phẩm).

      Hai đích, hai bảng:
        · dòng hàng TRONG GÓI  -> selection_placements (đã có từ BB-101)
        · album MUA THÊM       -> selection_addon_photos (migration 0062)

      Album mua thêm phải là album THẬT của chính lượt chọn này. Thiếu vế đó
      thì đoán một mã dòng mua thêm bất kỳ là nhét ảnh vào album nhà khác.
    */
    if (input.addonId) {
      const { data: album } = await admin
        .from("selection_addons")
        .select("id")
        .eq("id", input.addonId)
        .eq("selection_id", session.selectionId)
        .maybeSingle();
      if (!album) return fail("NOT_FOUND", "Không tìm thấy album này trong đơn của ba mẹ");
    }

    // Hai nhánh viết rời, mỗi nhánh bắt lỗi ngay tại chỗ ghi. Gộp vào một biểu
    // thức ba ngôi thì đọc lướt không thấy chỗ bắt lỗi — và phép thử BB-190,
    // vốn quét đúng hình dạng đó, cũng không thấy.
    let placementError: { message: string } | null = null;

    if (input.addonId) {
      const { error } = await admin.from("selection_addon_photos").upsert(
        { addon_id: input.addonId, selection_item_id: targetSelectionItemId },
        { onConflict: "addon_id,selection_item_id" },
      );
      placementError = error;
    } else {
      const { error } = await admin.from("selection_placements").upsert(
        {
          selection_item_id: targetSelectionItemId,
          gallery_item_id: input.galleryItemId,
        },
        { onConflict: "selection_item_id,gallery_item_id" },
      );
      placementError = error;
    }

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

    /*
      BẢN THỨ SÁU của danh sách trạng thái khoá, chép tay — và là bản lệch với
      chính POST ở ngay trên.

      Dòng cũ ở đây còn giữ 'submitted'. Hậu quả rất cụ thể: sau khi ba mẹ bấm
      Chốt (mà CSKH chưa xác nhận), họ vẫn ĐẶT được ảnh vào sản phẩm in — POST
      dùng `isGalleryLocked` nên cho qua — nhưng GỠ ra thì không. Đặt nhầm một
      tấm là kẹt luôn, chỉ còn đường gọi điện.

      Quyết định 22/09/2026 ("chốt xong vẫn sửa được cho tới khi CSKH xác nhận",
      migration 0060) chỉ đúng khi cả hai đầu dùng chung một luật.
    */
    if (isGalleryLocked(gallery.status)) {
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
      if (input.addonId) {
        const { error } = await admin
          .from("selection_addon_photos")
          .delete()
          .eq("selection_item_id", targetSelectionItemId)
          .eq("addon_id", input.addonId);
        if (error) throw error;
      } else {
        const { error } = await admin
          .from("selection_placements")
          .delete()
          .eq("selection_item_id", targetSelectionItemId)
          .eq("gallery_item_id", input.galleryItemId);
        if (error) throw error;
      }
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
