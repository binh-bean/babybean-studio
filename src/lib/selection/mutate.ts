import { createAdminClient } from "@/lib/supabase/admin";
import { isGalleryLocked } from "@/lib/gallery-status";
import { canSelectMore, type QuotaRules } from "@/lib/selection/quota";
import type { GallerySession, SelectionPatchRequest, SelectionPatchResponse, ErrorCode } from "@/types/domain";

export async function patchSelection(
  session: GallerySession,
  request: SelectionPatchRequest,
  ip: string | null,
  userAgent: string | null
): Promise<{ data?: SelectionPatchResponse; error?: { code: ErrorCode; message?: string } }> {
  const supabase = createAdminClient();

  // Load gallery, share_link and quota
  const [galleryResult, linkResult, quotaResult] = await Promise.all([
    supabase
      .from("galleries")
      .select("status, included_quota, extra_photo_price, max_selection, allow_extra")
      .eq("id", session.galleryId)
      .single(),
    supabase
      .from("share_links")
      .select("label")
      .eq("id", session.shareLinkId)
      .single(),
    supabase.rpc("gallery_quota", { p_gallery_id: session.galleryId }),
  ]);

  const galleryError = galleryResult.error;
  const gallery = galleryResult.data;
  const actorLabel = linkResult.data?.label || "Customer";

  if (galleryError || !gallery) {
    return { error: { code: "NOT_FOUND", message: "Gallery not found" } };
  }

  /*
    Danh sách trạng thái khoá dùng CHUNG, không chép tay.

    Dòng cũ ở đây tự liệt kê bốn trạng thái và thiếu ba cái:
    'awaiting_approval', 'approved', 'expired'. Đúng cái bệnh mà
    `src/lib/gallery-status.ts` sinh ra để dẹp — ghi chú đầu tệp đó kể danh
    sách này từng nằm ở BỐN chỗ và mỗi bản thiếu một kiểu khác nhau.

    Đây là bản thứ tư, sót lại. Nó cũng là chỗ làm hỏng quyết định 22/09/2026
    ("chốt xong vẫn sửa được cho tới khi CSKH xác nhận", migration 0060): hàm
    SQL và bản TypeScript đều đã bỏ 'submitted', còn dòng này thì không.
  */
  if (isGalleryLocked(gallery.status)) {
    return { error: { code: "GALLERY_LOCKED", message: "Gallery is locked" } };
  }

  const quotaKnown = quotaResult.data !== null && quotaResult.data !== undefined;
  const actualIncludedQuota = quotaKnown ? Number(quotaResult.data) : null;

  // To use canSelectMore properly, we need to know the current selected count and the net change
  // We can fetch current selected count
  const { count: selectedCount } = await supabase
    .from("selection_items")
    .select("*", { count: "exact", head: true })
    .eq("selection_id", session.selectionId)
    .eq("mark", "selected");

  // We could calculate net change in TS by fetching current items, but RPC is safer for race conditions.
  // We'll let RPC handle the actual update and transaction, but we'll use canSelectMore here as an optimistic check.
  const photoIds = request.ops.map(o => o.photoId);
  const { data: currentItems } = await supabase
    .from("selection_items")
    .select("photo_id, mark")
    .eq("selection_id", session.selectionId)
    .in("photo_id", photoIds);

  const currentMarkMap = new Map(currentItems?.map(i => [i.photo_id, i.mark]));

  let netChange = 0;
  for (const op of request.ops) {
    // Suggester forces selected to suggested
    const intendedMark = (session.role === "suggester" && op.mark === "selected") ? "suggested" : op.mark;
    const currentMark = currentMarkMap.get(op.photoId);

    const wasSelected = currentMark === "selected";
    
    let willBeSelected = false;
    if (op.mark !== undefined) {
      willBeSelected = intendedMark === "selected";
    } else {
      willBeSelected = wasSelected;
    }

    if (!wasSelected && willBeSelected) netChange++;
    if (wasSelected && !willBeSelected) netChange--;
  }

  // Hạn mức chưa biết thì KHÔNG GHI GÌ HẾT.
  //
  // Bản gốc của BB-102 chỉ chặn khi khách đang chọn thêm, rồi để lọt xuống
  //
  //     const effectiveQuota = actualIncludedQuota ?? gallery.included_quota;
  //
  // Dòng đó lấy lại đúng con số mặc định 20 mà cả 0016, 0017, 0018 đang gỡ bỏ,
  // và gửi nó xuống RPC. Hậu quả: p_included_quota không bao giờ là null, nên
  // cổng chặn QUOTA_UNKNOWN ở tầng database KHÔNG BAO GIỜ nổ được. Hai tầng
  // bảo vệ trở thành không tầng nào.
  //
  // Nới cho khách bỏ chọn nghe có vẻ tử tế, nhưng nó vẫn tính lại số ảnh vượt
  // và tiền phụ trội dựa trên con số 20 bịa, rồi trả về cho khách xem. Sai số
  // im lặng còn tệ hơn một dòng báo lỗi.
  //
  // Một luật duy nhất: chưa biết hạn mức thì album chưa dùng được, CSKH điền
  // xong mới mở. API và database nói cùng một câu.
  if (!quotaKnown || actualIncludedQuota === null) {
    return {
      error: {
        code: "QUOTA_UNKNOWN",
        message: "Studio sẽ báo lại số ảnh trong gói",
      },
    };
  }

  const effectiveQuota = actualIncludedQuota;

  const quotaRules: QuotaRules = {
    includedQuota: effectiveQuota,
    extraPhotoPrice: gallery.extra_photo_price,
    maxSelection: gallery.max_selection,
    allowExtra: gallery.allow_extra,
  };

  const decision = canSelectMore(selectedCount || 0, netChange, quotaRules);
  if (!decision.allowed) {
    return { error: { code: "QUOTA_EXCEEDED" } };
  }

  // Tách các trường selection gửi xuống RPC để RPC quản lý lock, quota, mark, is_favorite và logs.
  // Không truyền retouchNote/noteTags xuống RPC để logic ghi chú và chuẩn hoá nhãn thẻ được quản lý
  // tập trung, an toàn và có kiểm chứng ngược rõ ràng tại tầng này.
  const rpcOps = request.ops.map(op => ({
    photoId: op.photoId,
    mark: op.mark,
    isFavorite: (op as { isFavorite?: boolean }).isFavorite,
  }));

  // Call the RPC to do the actual atomic update and activity_logs
  const { data: result, error: rpcError } = await supabase.rpc("patch_selection_batch", {
    p_client_op_id: request.clientOpId,
    p_selection_id: session.selectionId,
    p_gallery_id: session.galleryId,
    p_role: session.role,
    p_ops: rpcOps,
    p_max_selection: gallery.max_selection,
    p_allow_extra: gallery.allow_extra,
    p_included_quota: effectiveQuota,
    p_extra_price: gallery.extra_photo_price,
    p_actor_label: actorLabel,
    p_ip: ip,
    p_user_agent: userAgent,
  });

  if (rpcError) {
    if (rpcError.message === "GALLERY_LOCKED") return { error: { code: "GALLERY_LOCKED" } };
    if (rpcError.message === "FORBIDDEN") return { error: { code: "FORBIDDEN" } };
    if (rpcError.message === "FORBIDDEN_PHOTO") return { error: { code: "FORBIDDEN", message: "Photo does not belong to this gallery" } };
    if (rpcError.message === "QUOTA_EXCEEDED") return { error: { code: "QUOTA_EXCEEDED" } };
    throw rpcError;
  }

  // BB-144: Cập nhật ghi chú chỉnh sửa (retouch_note) và danh sách nhãn (note_tags).
  //
  // QUY TẮC BẮT BUỘC (docs/briefs/BB-144-luu-ghi-chu-tung-anh.md):
  // 1. Gửi null: XOÁ ghi chú (retouch_note = null).
  // 2. Không gửi trường đó (undefined): GIỮ NGUYÊN ghi chú hiện tại, không ghi đè.
  // 3. Gửi chuỗi: CẬP NHẬT nội dung ghi chú mới.
  //
  // Với nhãn thẻ (note_tags):
  // 1. Gửi mảng [] hoặc null: XOÁ danh sách thẻ (note_tags = []).
  // 2. Không gửi trường đó (undefined): GIỮ NGUYÊN danh sách thẻ hiện tại.
  // 3. Gửi mảng string: CẬP NHẬT danh sách thẻ.
  //
  // Xử lý ảnh CHƯA ĐƯỢC CHỌN (Mục 3 brief BB-144):
  // Nếu ảnh chưa từng được chọn và op này không gửi kèm lệnh chọn ảnh (mark='selected'),
  // RPC phía trên đã từ chối ảnh đó vào result.rejected với mã INVALID_INPUT
  // ("Không ghi chú được cho ảnh chưa chọn"). Ta bỏ qua các op trong rejected.
  // Lý do: Ghi chú chỉnh sửa chỉ có ý nghĩa với ảnh mà phụ huynh chọn để studio retouch;
  // không lưu ghi chú trôi nổi cho ảnh chưa chọn để giữ dữ liệu sạch và nhất quán với quy trình.
  for (const op of request.ops) {
    if (result?.rejected?.some((r: { photoId: string }) => r.photoId === op.photoId)) {
      continue;
    }

    const hasRetouchNote = op.retouchNote !== undefined;
    const hasNoteTags = op.noteTags !== undefined;

    // Không gửi cả hai trường thì giữ nguyên, không cần cập nhật
    if (!hasRetouchNote && !hasNoteTags) {
      continue;
    }

    const updatePayload: { retouch_note?: string | null; note_tags?: string[] } = {};

    if (hasRetouchNote) {
      // Gửi null là XOÁ ghi chú, gửi chuỗi là CẬP NHẬT
      updatePayload.retouch_note = op.retouchNote;
    }

    if (hasNoteTags) {
      // Gửi [] hoặc null là XOÁ thẻ, gửi mảng là CẬP NHẬT
      updatePayload.note_tags = op.noteTags ?? [];
    }

    const { error: updateError } = await supabase
      .from("selection_items")
      .update(updatePayload)
      .eq("selection_id", session.selectionId)
      .eq("photo_id", op.photoId);

    if (updateError) {
      return {
        error: {
          code: "INTERNAL",
          message: updateError.message || "Không thể lưu ghi chú chỉnh sửa ảnh",
        },
      };
    }
  }

  return { data: result as SelectionPatchResponse };
}
