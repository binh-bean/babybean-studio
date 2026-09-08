/**
 * List every image in a shared Drive folder.
 *
 * OWNER: DEV-INT. Task BB-012.
 * Spec: docs/06-drive-integration.md §5
 *
 * STATUS: scaffold. The signature below is the contract other tasks depend on
 * (BB-013 preview, BB-014 sync) — implement the body, do not change the shape.
 */

import "server-only";
import { driveFetch, type DriveRequestContext } from "./client";
import { naturalCompare } from "@/lib/utils/natural-sort";
import type { DriveFile } from "@/types/domain";

const FIELDS =
  "nextPageToken,files(id,name,mimeType,size,imageMediaMetadata(width,height,time),modifiedTime)";
const PAGE_SIZE = "1000";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Drive traversal is capped at 2 levels: the album folder and its concepts. */
const MAX_DEPTH = 2;

export interface ListFilesOptions {
  /** Called after each page so the UI can show sync progress. */
  onProgress?: (processed: number) => void;
  signal?: AbortSignal;
}

/**
 * Returns every image file under `folderId`, sorted naturally by
 * (subfolder, fileName), with `sortIndex` implied by array position.
 *
 * Non-image files are dropped. Sub-folders become `DriveFile.subfolder`.
 */
export async function listImageFiles(
  folderId: string,
  ctx: DriveRequestContext,
  options: ListFilesOptions = {},
): Promise<DriveFile[]> {
  const collected: DriveFile[] = [];
  await walk(folderId, null, 1, ctx, options, collected);

  collected.sort((a, b) => {
    const sub = naturalCompare(a.subfolder ?? "", b.subfolder ?? "");
    return sub !== 0 ? sub : naturalCompare(a.name, b.name);
  });

  return collected;
}

async function walk(
  folderId: string,
  subfolder: string | null,
  depth: number,
  ctx: DriveRequestContext,
  options: ListFilesOptions,
  out: DriveFile[],
): Promise<void> {
  let pageToken: string | undefined;

  do {
    options.signal?.throwIfAborted();

    const params: Record<string, string> = {
      q: `'${folderId}' in parents and trashed = false`,
      fields: FIELDS,
      orderBy: "name_natural",
      pageSize: PAGE_SIZE,
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    };
    if (pageToken) params.pageToken = pageToken;

    const res = await driveFetch("/files", params, { ...ctx, folderId });
    const body = (await res.json()) as {
      nextPageToken?: string;
      files?: RawDriveFile[];
    };

    for (const file of body.files ?? []) {
      if (file.mimeType === FOLDER_MIME) {
        if (depth < MAX_DEPTH) {
          await walk(file.id, file.name, depth + 1, ctx, options, out);
        }
        continue;
      }
      if (!file.mimeType.startsWith("image/")) continue;
      out.push(toDriveFile(file, subfolder));
    }

    options.onProgress?.(out.length);
    pageToken = body.nextPageToken;
  } while (pageToken);
}

interface RawDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  imageMediaMetadata?: { width?: number; height?: number; time?: string };
}

function toDriveFile(file: RawDriveFile, subfolder: string | null): DriveFile {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size ? Number(file.size) : null,
    width: file.imageMediaMetadata?.width ?? null,
    height: file.imageMediaMetadata?.height ?? null,
    // Drive returns EXIF time as "YYYY:MM:DD HH:MM:SS" — normalise to ISO.
    takenAt: file.imageMediaMetadata?.time
      ? file.imageMediaMetadata.time.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3").replace(" ", "T")
      : null,
    modifiedAt: file.modifiedTime ?? null,
    subfolder,
  };
}
