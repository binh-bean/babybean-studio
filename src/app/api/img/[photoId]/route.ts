import { randomUUID } from "node:crypto";
import { fail, failUnexpected } from "@/lib/api-response";
import { THUMBNAIL_WIDTHS, type ThumbnailWidth } from "@/types/domain";
import { createServerClient } from "@/lib/supabase/server";
import { requireStaff, requireBranch, AuthError } from "@/lib/auth/staff";

export const runtime = "nodejs";

function parseWidth(value: string | null): ThumbnailWidth | null {
  const n = Number(value ?? 800);
  return (THUMBNAIL_WIDTHS as readonly number[]).includes(n) ? (n as ThumbnailWidth) : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ photoId: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const { photoId } = await context.params;
    const width = parseWidth(new URL(request.url).searchParams.get("w"));
    if (!width) return fail("INVALID_INPUT", "Kích thước ảnh không hợp lệ");

    const supabase = await createServerClient();
    const { data: photo, error: photoErr } = await supabase
      .from("photos")
      .select("drive_file_id, gallery_id, status, galleries!inner(branch_id)")
      .eq("id", photoId)
      .single();

    if (photoErr || !photo || photo.status === "missing") {
      return fail("NOT_FOUND", "Không tìm thấy ảnh");
    }

    try {
      const staff = await requireStaff();
      const branchId = Array.isArray(photo.galleries)
        ? photo.galleries[0]?.branch_id
        : (photo.galleries as any)?.branch_id;
      requireBranch(staff, branchId);
    } catch (err) {
      // TODO(BB-030): Implement customer auth using bb_gs cookie matching photo.gallery_id
      // For now, if staff auth fails, block access.
      if (err instanceof AuthError) {
        return fail("FORBIDDEN", "Không có quyền truy cập ảnh");
      }
      return failUnexpected(err, requestId);
    }

    const driveFileId = photo.drive_file_id;
    const headers = {
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    };

    // Try lh3 first
    const lh3Url = `https://lh3.googleusercontent.com/d/${driveFileId}=w${width}`;
    try {
      const lh3Res = await fetch(lh3Url, { cache: "no-store" });
      if (lh3Res.ok) {
        return new Response(lh3Res.body, {
          status: 200,
          headers: {
            ...headers,
            "Content-Type": lh3Res.headers.get("Content-Type") || "image/jpeg",
          }
        });
      }
    } catch (e) {
      // fallback
    }

    // Try drive.google.com/thumbnail
    const driveUrl = `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w${width}`;
    try {
      const driveRes = await fetch(driveUrl, { cache: "no-store" });
      if (driveRes.ok) {
        return new Response(driveRes.body, {
          status: 200,
          headers: {
            ...headers,
            "Content-Type": driveRes.headers.get("Content-Type") || "image/jpeg",
          }
        });
      }
    } catch (e) {
      // failure
    }

    return fail("DRIVE_UNAVAILABLE", "Không tải được ảnh từ Drive");
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}
