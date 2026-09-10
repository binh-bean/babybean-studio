import { NextResponse } from "next/server";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api-response";


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

    const selected = selectedCount || 0;
    const favorite = favoriteCount || 0;
    const extraCount = Math.max(0, selected - gallery.included_quota);
    const extraAmount = extraCount * gallery.extra_photo_price;

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
      includedQuota: gallery.included_quota,
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
        selectedCount: gallery.status === 'submitted' ? selection?.snapshot_selected_count : selected,
        favoriteCount: favorite,
        extraCount: gallery.status === 'submitted' ? selection?.snapshot_extra_count : extraCount,
        extraAmount: gallery.status === 'submitted' ? selection?.snapshot_extra_amount : extraAmount,
        generalNote: selection?.general_note || null,
        submittedAt: selection?.submitted_at || null
      }
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
