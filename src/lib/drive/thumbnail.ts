/**
 * Build upstream thumbnail URLs.
 *
 * OWNER: DEV-INT.
 * Spec: docs/06-drive-integration.md §6
 *
 * These URLs are used SERVER-SIDE ONLY, by /api/img/[photoId]. They must never
 * reach the browser: they expose the raw Drive file id, which would let anyone
 * with the URL bypass our access checks and share the photo freely.
 */

import "server-only";
import type { ThumbnailWidth } from "@/types/domain";

/**
 * Primary source. Fast, CDN-backed, accepts a width parameter.
 * Undocumented by Google — hence the fallback below.
 */
export function lh3ThumbnailUrl(driveFileId: string, width: ThumbnailWidth): string {
  return `https://lh3.googleusercontent.com/d/${driveFileId}=w${width}`;
}

/** Fallback. Slower and redirects more, but is the documented endpoint. */
export function driveThumbnailUrl(driveFileId: string, width: ThumbnailWidth): string {
  return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w${width}`;
}

/**
 * Ordered candidates for one photo. The proxy tries them in order and caches
 * which one worked, so a Google-side change to lh3 degrades rather than breaks.
 */
export function thumbnailCandidates(
  driveFileId: string,
  width: ThumbnailWidth,
): readonly string[] {
  return [lh3ThumbnailUrl(driveFileId, width), driveThumbnailUrl(driveFileId, width)];
}
