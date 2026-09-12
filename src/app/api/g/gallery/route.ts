import { NextResponse } from "next/server";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api-response";
import { getGalleryContractSummary } from "@/lib/selection/contract";


export async function GET() {
  try {
    const session = await requireGallerySession();
    const supabase = await createAdminClient();

    const { data: gallery, error: galleryError } = await supabase
      .from("galleries")
      .select(`
        id, title, welcome_message, status, baby_id, shoot_date:shoots(shoot_date),
        branch:branches(name, hotline, zalo_oa),
        photo_count, included_quota, extra_photo_price, max_selection, allow_extra, due_at,
        cover_photo_id, watermark_enabled, download_enabled, notes_enabled, invite_enabled
      `)
      .eq("id", session.galleryId)
      .single();

    if (galleryError || !gallery) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gallery not found" } }, { status: 404 });
    }

    const { data: baby } = gallery.baby_id ? await supabase
      .from("babies")
      .select("full_name, nickname")
      .eq("id", gallery.baby_id)
      .single() : { data: null };

    // Get subfolders for the gallery
    const { data: subfoldersData } = await supabase
      .from("photos")
      .select("subfolder")
      .eq("gallery_id", session.galleryId)
      .neq("status", "hidden")
      .not("subfolder", "is", null);

    const subfolders = Array.from(new Set(subfoldersData?.map(s => s.subfolder as string) || []));

    // Get selection summary
    const { data: selection } = await supabase
      .from("selections")
      .select("id, snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount, general_note, submitted_at")
      .eq("id", session.selectionId)
      .single();

    // Since we don't have counts in 'selections' directly unless submitted,
    // wait, we need current counts. Let's get current counts from selection_items.
    const { count: selectedCount } = await supabase
      .from("selection_items")
      .select("*", { count: "exact", head: true })
      .eq("selection_id", session.selectionId)
      .eq("mark", "selected");

    const { count: favoriteCount } = await supabase
      .from("selection_items")
      .select("*", { count: "exact", head: true })
      .eq("selection_id", session.selectionId)
      .eq("mark", "favorite");

    // Lấy thành phần hợp đồng và hạn mức từ app.gallery_quota
    const contractSummary = await getGalleryContractSummary(session.galleryId, supabase);
    const { quotaKnown, includedQuota } = contractSummary;

    const selected = selectedCount || 0;
    const favorite = favoriteCount || 0;
    const extraCount = quotaKnown && includedQuota !== null
      ? Math.max(0, selected - includedQuota)
      : 0;
    const extraAmount = extraCount * gallery.extra_photo_price;

    // Lấy danh sách sản phẩm mua thêm (addons) của phiên chọn ảnh
    const { data: rawAddons } = await supabase
      .from("selection_addons")
      .select(`
        id,
        selection_id,
        product_id,
        quantity,
        unit_price,
        created_at,
        product:products (
          name,
          kind,
          material,
          size
        )
      `)
      .eq("selection_id", session.selectionId)
      .order("created_at", { ascending: true });

    const addonsList = (rawAddons || []).map((row) => {
      const prod = Array.isArray(row.product) ? row.product[0] : row.product;
      const unitPrice = Number(row.unit_price);
      return {
        id: row.id,
        productId: row.product_id,
        name: prod?.name || "Sản phẩm mua thêm",
        kind: prod?.kind || "addon",
        material: prod?.material || null,
        size: prod?.size || null,
        quantity: row.quantity,
        unitPrice,
        totalPrice: unitPrice * row.quantity,
        createdAt: row.created_at,
      };
    });

    const totalAddonsAmount = addonsList.reduce((sum, a) => sum + a.totalPrice, 0);

    const isSubmittedOrLater = ["submitted", "in_retouch", "delivered", "archived"].includes(gallery.status);
    const hasSnapshot = isSubmittedOrLater && selection?.snapshot_selected_count !== null && selection?.snapshot_selected_count !== undefined;

    const finalIncludedQuota = hasSnapshot ? gallery.included_quota : includedQuota;
    const finalQuotaKnown = hasSnapshot ? true : quotaKnown;
    const finalSelectedCount = hasSnapshot ? (selection?.snapshot_selected_count ?? 0) : selected;
    const finalExtraCount = hasSnapshot ? (selection?.snapshot_extra_count ?? 0) : extraCount;
    const finalExtraAmount = hasSnapshot ? (selection?.snapshot_extra_amount ?? 0) : extraAmount;

    const responseData = {
      id: gallery.id,
      title: gallery.title,
      welcomeMessage: gallery.welcome_message,
      status: gallery.status,
      babyName: baby?.nickname || baby?.full_name || null,
      shootDate: (gallery.shoot_date as unknown as { shoot_date: string }[])?.[0]?.shoot_date || (gallery.shoot_date as unknown as { shoot_date: string })?.shoot_date || null,
      branch: {
        name: (gallery.branch as unknown as { name: string }[])?.[0]?.name || (gallery.branch as unknown as { name: string })?.name,
        hotline: (gallery.branch as unknown as { hotline: string }[])?.[0]?.hotline || (gallery.branch as unknown as { hotline: string })?.hotline,
        zaloOa: (gallery.branch as unknown as { zalo_oa: string }[])?.[0]?.zalo_oa || (gallery.branch as unknown as { zalo_oa: string })?.zalo_oa
      },
      photoCount: gallery.photo_count,
      quotaKnown: finalQuotaKnown,
      includedQuota: finalIncludedQuota,
      extraPhotoPrice: gallery.extra_photo_price,
      maxSelection: gallery.max_selection,
      allowExtra: gallery.allow_extra,
      dueAt: gallery.due_at,
      options: {
        watermark: gallery.watermark_enabled,
        download: gallery.download_enabled,
        notes: gallery.notes_enabled,
        invite: gallery.invite_enabled
      },
      subfolders,
      coverPhotoId: gallery.cover_photo_id,
      myRole: session.role,
      selection: {
        id: session.selectionId,
        selectedCount: finalSelectedCount,
        favoriteCount: favorite,
        extraCount: finalExtraCount,
        extraAmount: finalExtraAmount,
        addonsAmount: totalAddonsAmount,
        generalNote: selection?.general_note || null,
        submittedAt: selection?.submitted_at || null
      },
      contract: {
        totalValue: contractSummary.totalValue,
        items: contractSummary.items,
      },
      addons: {
        totalAmount: totalAddonsAmount,
        items: addonsList,
      },
    };

    return ok(responseData);
  } catch (error) {
    if (error instanceof GallerySessionError) {
      return fail(error.code);
    }
    console.error("[GET /api/g/gallery]", error);
    return fail("INTERNAL");
  }
}
