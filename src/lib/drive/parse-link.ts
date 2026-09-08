/**
 * Parse a Google Drive share link into a folder id.
 *
 * OWNER: DEV-INT. Task BB-010.
 * Spec: docs/06-drive-integration.md §4
 */

/** Drive ids are base64url-ish and at least 10 chars in practice. */
const ID_PATTERN = /^[a-zA-Z0-9_-]{10,}$/;

export class InvalidDriveLinkError extends Error {
  constructor(public readonly input: string) {
    super("Link không hợp lệ. Hãy dán link thư mục Google Drive.");
    this.name = "InvalidDriveLinkError";
  }
}

/**
 * Accepts every shape the studio actually pastes:
 *   https://drive.google.com/drive/folders/<id>?usp=sharing
 *   https://drive.google.com/drive/u/0/folders/<id>
 *   https://drive.google.com/open?id=<id>
 *   <id>
 *
 * Rejects file links (/file/d/<id>/view) — those point at a single file,
 * not a folder, and would silently produce an empty gallery.
 */
export function parseDriveFolderId(input: string): string {
  const raw = input.trim();
  if (!raw) throw new InvalidDriveLinkError(input);

  // A bare id.
  if (ID_PATTERN.test(raw) && !raw.includes("/")) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidDriveLinkError(input);
  }

  if (!/(^|\.)google\.com$/.test(url.hostname)) {
    throw new InvalidDriveLinkError(input);
  }

  // A single-file link is a common mistake — reject it with a clear signal
  // rather than treating the file id as a folder id.
  if (/\/file\/d\//.test(url.pathname)) {
    throw new InvalidDriveLinkError(input);
  }

  const fromPath = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (fromPath?.[1]) return fromPath[1];

  const fromQuery = url.searchParams.get("id");
  if (fromQuery && ID_PATTERN.test(fromQuery)) return fromQuery;

  throw new InvalidDriveLinkError(input);
}

/** True when the input parses; useful for form-level validation. */
export function isDriveFolderLink(input: string): boolean {
  try {
    parseDriveFolderId(input);
    return true;
  } catch {
    return false;
  }
}

export function buildDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
