import { NextRequest } from "next/server";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { PhotosQuerySchema } from "./schema";
import { ok, fail } from "@/lib/api-response";
import type { PhotoPublic } from "@/types/domain";

export async function GET(req: NextRequest) {
  try {
    const session = await requirePhienBoAnh(req);
    
    const url = new URL(req.url);
    const queryResult = PhotosQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") || undefined,
      sau: url.searchParams.get("sau") || undefined,
      limit: url.searchParams.get("limit") || undefined,
      subfolder: url.searchParams.get("subfolder") || undefined,
      filter: url.searchParams.get("filter") || undefined,
    });

    if (!queryResult.success) {
      return fail("INVALID_INPUT", "Invalid query parameters");
    }

    const { cursor, sau, limit, subfolder, filter } = queryResult.data;
    const supabase = await createAdminClient();

    let cursorIndex = sau ?? 0;
    if (cursor && sau === undefined) {
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

    // BB-341 — mã tệp Drive của từng ảnh, để màn khách dựng thẳng URL lh3
    // (xem src/lib/utils/anh-lh3.ts) thay vì đi vòng 302 qua `/api/img`.
    // Hàm SQL `get_gallery_photos` chưa trả cột này (migration 0084 thêm vào,
    // CHƯA áp): chừng nào chưa có thì tra một câu theo KHOẢNG sort_index của
    // chính trang này — tập con của bộ ảnh trong phiên, không rộng hơn.
    // Câu này hỏng thì trả `null` — màn khách tự đi đường cũ.
    const maTepTheoAnh = new Map<string, string>();
    const coSan = (photosToReturn as { id: string; drive_file_id?: string | null }[]).filter(
      (p) => typeof p.drive_file_id === "string",
    );
    if (coSan.length === photosToReturn.length) {
      for (const p of coSan) maTepTheoAnh.set(p.id, p.drive_file_id as string);
    } else if (photosToReturn.length > 0) {
      const dau = photosToReturn[0].sort_index as number;
      const cuoi = photosToReturn[photosToReturn.length - 1].sort_index as number;
      const { data: maTep } = await supabase
        .from("photos")
        .select("id, drive_file_id")
        .eq("gallery_id", session.galleryId)
        .eq("status", "active")
        .gte("sort_index", dau)
        .lte("sort_index", cuoi);
      for (const r of (maTep ?? []) as { id: string; drive_file_id: string | null }[]) {
        if (r.drive_file_id) maTepTheoAnh.set(r.id, r.drive_file_id);
      }
    }

    type RpcPhoto = { id: string; file_name: string; width: number | null; height: number | null; subfolder: string | null; sort_index: number; status: "active" | "missing" | "hidden"; mark: "selected" | "suggested" | "favorite" | "rejected" | null; is_favorite: boolean; order_index: number | null; retouch_note: string | null; note_tags: string[]; suggested_by: string[] };

    const photos: (PhotoPublic & { maTepDrive: string | null })[] = (photosToReturn as RpcPhoto[]).map(p => ({
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
      suggestedBy: p.suggested_by || [],
      // BB-341 — trường phụ, chỉ ảnh `active` (ảnh `missing` để route cũ trả 404).
      maTepDrive: p.status === "active" ? maTepTheoAnh.get(p.id) ?? null : null,
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
