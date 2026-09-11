import { NextRequest } from "next/server";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { PhotosQuerySchema } from "./schema";
import { ok, fail } from "@/lib/api-response";
import type { PhotoPublic } from "@/types/domain";

export async function GET(req: NextRequest) {
  try {
    const session = await requireGallerySession();
    
    const url = new URL(req.url);
    const queryResult = PhotosQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") || undefined,
      limit: url.searchParams.get("limit") || undefined,
      subfolder: url.searchParams.get("subfolder") || undefined,
      filter: url.searchParams.get("filter") || undefined,
    });

    if (!queryResult.success) {
      return fail("INVALID_INPUT", "Invalid query parameters");
    }

    const { cursor, limit, subfolder, filter } = queryResult.data;
    const supabase = await createAdminClient();

    let cursorIndex = 0;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (typeof decoded.s === 'number') {
          cursorIndex = decoded.s;
        }
      } catch {
        return fail("INVALID_INPUT", "Invalid cursor");
      }
    }

    const { data: rawPhotos, error } = await supabase.rpc('get_gallery_photos', {
      p_gallery_id: session.galleryId,
      p_selection_id: session.selectionId,
      p_cursor_sort_index: cursorIndex,
      p_limit: limit + 1,
      p_subfolder: subfolder || null,
      p_filter: filter
    });

    if (error) throw error;

    const hasMore = rawPhotos && rawPhotos.length > limit;
    const photosToReturn = hasMore ? rawPhotos.slice(0, limit) : (rawPhotos || []);

    const nextCursor = photosToReturn.length > 0 
      ? Buffer.from(JSON.stringify({ s: photosToReturn[photosToReturn.length - 1].sort_index })).toString('base64url')
      : null;

    type RpcPhoto = { id: string; file_name: string; width: number | null; height: number | null; subfolder: string | null; sort_index: number; status: "active" | "missing" | "hidden"; mark: "selected" | "suggested" | "favorite" | "rejected" | null; is_favorite: boolean; order_index: number | null; retouch_note: string | null; note_tags: string[]; suggested_by: string[] };

    const photos: PhotoPublic[] = (photosToReturn as RpcPhoto[]).map(p => ({
      id: p.id,
      fileName: p.file_name,
      width: p.width,
      height: p.height,
      subfolder: p.subfolder,
      sortIndex: p.sort_index,
      status: p.status,
      mark: p.mark,
      isFavorite: p.is_favorite ?? false,
      orderIndex: p.order_index,
      retouchNote: p.retouch_note,
      noteTags: p.note_tags || [],
      suggestedBy: p.suggested_by || []
    }));

    const meta = { cursor: nextCursor || undefined, hasMore };

    return ok(photos, meta);

  } catch (error) {
    if (error instanceof GallerySessionError) {
      return fail(error.code);
    }
    console.error("[GET /api/g/photos]", error);
    return fail("INTERNAL");
  }
}
