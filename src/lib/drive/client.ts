/**
 * Low-level Google Drive HTTP client.
 *
 * OWNER: DEV-INT. Task BB-011.
 * Spec: docs/06-drive-integration.md §9
 *
 * Every Drive call in this codebase goes through driveFetch(). Nothing else
 * may call fetch() against googleapis.com directly — retry/backoff/timeout and
 * quota logging live here and nowhere else.
 *
 * SERVER ONLY. Importing this from a client component leaks the API key.
 */

import "server-only";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const TIMEOUT_MS = 10_000;
export const MAX_ATTEMPTS = 5;
export const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class DriveAccessDeniedError extends Error {
  readonly code = "DRIVE_ACCESS_DENIED" as const;
  constructor(public readonly folderId?: string) {
    super("Thư mục Drive chưa được chia sẻ công khai");
    this.name = "DriveAccessDeniedError";
  }
}

export class DriveUnavailableError extends Error {
  readonly code = "DRIVE_UNAVAILABLE" as const;
  constructor(message = "Không kết nối được Google Drive") {
    super(message);
    this.name = "DriveUnavailableError";
  }
}

function apiKey(): string {
  const key = process.env.GOOGLE_DRIVE_API_KEY;
  if (!key) throw new Error("GOOGLE_DRIVE_API_KEY is not configured");
  return key;
}

/** Exponential backoff with ±30% jitter so parallel syncs do not resonate. */
export function backoffMs(attempt: number): number {
  const base = 250 * 2 ** attempt;
  const jitter = base * 0.3 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DriveRequestContext {
  /** Correlates every Drive call of one sync job in the logs. */
  requestId: string;
  folderId?: string;
}

/**
 * Issues one Drive API request with the API key attached, retrying transient
 * failures. Throws DriveAccessDeniedError (do not retry) or
 * DriveUnavailableError (retries exhausted).
 */
export async function driveFetch(
  path: string,
  params: Record<string, string>,
  ctx: DriveRequestContext,
): Promise<Response> {
  const isAbsolute = path.startsWith("http");
  const url = new URL(isAbsolute ? path : `${DRIVE_API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  if (!isAbsolute) {
    url.searchParams.set("key", apiKey());
  }

  let lastStatus = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      lastStatus = res.status;

      logDriveCall(ctx, path, res.status, Date.now() - started, attempt, params.pageToken);

      if (res.ok) return res;

      // Folder is not shared publicly, or the key lost access. Retrying will
      // never help and just burns quota.
      if (res.status === 403 || res.status === 404) {
        throw new DriveAccessDeniedError(ctx.folderId);
      }

      if (!RETRYABLE_STATUS.has(res.status)) {
        throw new DriveUnavailableError(`Drive trả về ${res.status}`);
      }
    } catch (err) {
      if (err instanceof DriveAccessDeniedError) throw err;
      if (err instanceof DriveUnavailableError) throw err;
      // AbortError and network failures fall through to the retry below.
      logDriveCall(ctx, path, 0, Date.now() - started, attempt, params.pageToken);
    } finally {
      clearTimeout(timer);
    }

    if (attempt < MAX_ATTEMPTS - 1) await sleep(backoffMs(attempt));
  }

  throw new DriveUnavailableError(
    `Drive không phản hồi sau ${MAX_ATTEMPTS} lần thử (mã cuối: ${lastStatus})`,
  );
}

/** Never log the API key or full URLs containing it. */
function logDriveCall(
  ctx: DriveRequestContext,
  path: string,
  status: number,
  durationMs: number,
  attempt: number,
  pageToken?: string,
): void {
  console.info(
    JSON.stringify({
      evt: "drive_call",
      requestId: ctx.requestId,
      folderId: ctx.folderId,
      path,
      status,
      durationMs,
      attempt,
      ...(pageToken ? { pageToken } : {}),
    }),
  );
}
