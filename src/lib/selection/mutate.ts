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

  // Load gallery for rules
  const { data: gallery, error: galleryError } = await supabase
    .from("galleries")
    .select("status, included_quota, extra_photo_price, max_selection, allow_extra")
    .eq("id", session.galleryId)
    .single();

  if (galleryError || !gallery) {
    return { error: { code: "NOT_FOUND", message: "Gallery not found" } };
  }

  if (gallery.status === "submitted" || gallery.status === "delivered" || gallery.status === "archived") {
    return { error: { code: "GALLERY_LOCKED", message: "Gallery is locked" } };
  }

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
    const willBeSelected = intendedMark === "selected";

    if (!wasSelected && willBeSelected) netChange++;
    if (wasSelected && !willBeSelected) netChange--;
  }

  const quotaRules: QuotaRules = {
    includedQuota: gallery.included_quota,
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
    p_included_quota: gallery.included_quota,
    p_extra_price: gallery.extra_photo_price,
    p_actor_label: "Customer", // TODO: could be share_link label
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
