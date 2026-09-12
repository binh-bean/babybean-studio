import { createAdminClient } from "@/lib/supabase/admin";
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

  if (gallery.status === "submitted" || gallery.status === "delivered" || gallery.status === "archived" || gallery.status === "in_retouch") {
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

  // Call the RPC to do the actual atomic update and activity_logs
  const { data: result, error: rpcError } = await supabase.rpc("patch_selection_batch", {
    p_client_op_id: request.clientOpId,
    p_selection_id: session.selectionId,
    p_gallery_id: session.galleryId,
    p_role: session.role,
    p_ops: request.ops,
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

  return { data: result as SelectionPatchResponse };
}
