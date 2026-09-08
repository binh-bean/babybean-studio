/**
 * GET /api/img/[photoId]?w=800 — access-checked thumbnail proxy.
 *
 * OWNER: DEV-INT. Task BB-015.
 * Spec: docs/06-drive-integration.md §7
 *
 * STATUS: scaffold.
 *
 * Why a proxy rather than an <img src="https://lh3..."> — see ADR-0002.
 * In short: it keeps drive_file_id out of the browser, lets us check the
 * session, and gives us one place to change the photo source later.
 */

import { randomUUID } from "node:crypto";
import { fail, failUnexpected } from "@/lib/api-response";
import { THUMBNAIL_WIDTHS, type ThumbnailWidth } from "@/types/domain";

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

    // TODO(BB-015):
    //   1. Load the photo (admin client) -> 404 when absent or status='missing'.
    //   2. Authorize: a customer session whose galleryId matches the photo's
    //      gallery, OR a staff session whose branches include the gallery's
    //      branch. Anything else -> 403. Never serve on photoId alone.
    //   3. Fetch thumbnailCandidates(driveFileId, width) in order; fall through
    //      to the next candidate on a non-2xx response.
    //   4. Stream the body back with:
    //        Cache-Control: private, max-age=86400, stale-while-revalidate=604800
    //        Content-Type: image/jpeg
    //        X-Content-Type-Options: nosniff
    //   5. Never put drive_file_id in a response header or body.

    void photoId;
    return fail("INTERNAL", "Chưa triển khai (BB-015)", { requestId });
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}
