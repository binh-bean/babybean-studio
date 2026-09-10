import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireRole, AuthError } from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
import { listImageFiles } from "@/lib/drive/list-files";
import { DriveAccessDeniedError, DriveUnavailableError } from "@/lib/drive/client";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const galleryId = params.id;
    const staff = await requireStaff();
    requireRole(staff, ["owner", "admin", "branch_manager", "cs"]);

    const supabase = await createServerClient();
    
    // Fetch gallery to check if it exists and get drive_folder_id
    const { data: gallery, error: galErr } = await supabase
      .from("galleries")
      .select("drive_folder_id, cover_photo_id")
      .eq("id", galleryId)
      .single();

    if (galErr || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy album");
    }

    // Mark gallery as syncing
    const { error: updErr } = await supabase
      .from("galleries")
      .update({ status: "syncing", sync_error: null })
      .eq("id", galleryId);

    if (updErr) {
      return failUnexpected(updErr, requestId);
    }

    // Fire and forget the sync job
    after(async () => {
      try {
        const ctx = { requestId, folderId: gallery.drive_folder_id };
        const images = await listImageFiles(gallery.drive_folder_id, ctx);
        
        // Fetch existing photos to diff
        const { data: existing } = await supabase
          .from("photos")
          .select("id, drive_file_id, status")
          .eq("gallery_id", galleryId);
          
        const existingMap = new Map((existing || []).map(p => [p.drive_file_id, p]));
        
        const toInsert: any[] = [];
        const toUpdate: any[] = [];
        const activeDriveIds = new Set<string>();

        let i = 0;
        for (const img of images) {
          activeDriveIds.add(img.id);
          const exist = existingMap.get(img.id);
          
          const record = {
            gallery_id: galleryId,
            drive_file_id: img.id,
            file_name: img.name,
            mime_type: img.mimeType,
            size_bytes: img.size,
            width: img.width,
            height: img.height,
            taken_at: img.takenAt,
            subfolder: img.subfolder,
            sort_index: i + 1,
            status: "active",
            drive_modified_at: img.modifiedAt
          };

          if (exist) {
            toUpdate.push({ id: exist.id, ...record });
          } else {
            toInsert.push(record);
          }
          i++;
        }

        const toMissing: string[] = [];
        for (const [driveId, p] of existingMap.entries()) {
          if (!activeDriveIds.has(driveId) && p.status !== "missing") {
            toMissing.push(p.id);
          }
        }

        // 1. Insert new photos
        for (let i = 0; i < toInsert.length; i += 500) {
          const chunk = toInsert.slice(i, i + 500);
          const { error: insErr } = await supabase.from("photos").insert(chunk);
          if (insErr) throw insErr;
        }

        // 2. Update existing photos
        for (let i = 0; i < toUpdate.length; i += 500) {
          const chunk = toUpdate.slice(i, i + 500);
          const { error: updErr } = await supabase.from("photos").upsert(chunk, { onConflict: "id" });
          if (updErr) throw updErr;
        }

        // 3. Mark missing photos
        for (let i = 0; i < toMissing.length; i += 500) {
          const chunk = toMissing.slice(i, i + 500);
          const { error: missErr } = await supabase
            .from("photos")
            .update({ status: "missing" })
            .in("id", chunk);
          if (missErr) throw missErr;
        }

        // Update gallery status to ready
        await supabase.from("galleries").update({
          status: "ready",
          photo_count: activeDriveIds.size,
          last_synced_at: new Date().toISOString()
        }).eq("id", galleryId);

        // Update cover photo if not set
        const firstImage = images[0];
        if (!gallery.cover_photo_id && firstImage) {
          const { data: firstPhoto } = await supabase
            .from("photos")
            .select("id")
            .eq("gallery_id", galleryId)
            .eq("drive_file_id", firstImage.id)
            .single();
            
          if (firstPhoto) {
            await supabase.from("galleries").update({ cover_photo_id: firstPhoto.id }).eq("id", galleryId);
          }
        }

      } catch (err) {
        let errMsg = "Lỗi đồng bộ";
        if (err instanceof DriveAccessDeniedError) errMsg = "Thư mục chưa được chia sẻ công khai";
        else if (err instanceof DriveUnavailableError) errMsg = "Drive không khả dụng";
        else if (err instanceof Error) errMsg = err.message;

        await supabase.from("galleries").update({
          status: "sync_error",
          sync_error: errMsg
        }).eq("id", galleryId);
      }
    });

    return NextResponse.json({
      data: {
        jobId: requestId,
        status: "syncing"
      }
    }, { status: 202 });

  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.message);
    }
    return failUnexpected(err, requestId);
  }
}
