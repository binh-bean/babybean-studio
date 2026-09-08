/**
 * Signed session cookie for customers (who have no account).
 *
 * OWNER: SEC-ARCH. Task BB-030.
 * Spec: docs/02-architecture.md §2.2, docs/12-security.md §3
 *
 * STATUS: scaffold. Signing/verification below is the contract; the revocation
 * check in requireGallerySession() must be implemented before Phase 1 ships —
 * without it, revoking a share link would not end sessions already open.
 */

import "server-only";
import { cookies } from "next/headers";
import type { GallerySession, ShareRole } from "@/types/domain";

export const SESSION_COOKIE = "bb_gs";

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** WebCrypto requires a real ArrayBuffer; TextEncoder returns ArrayBufferLike. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function secret(): ArrayBuffer {
  const raw = process.env.APP_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("APP_SECRET is missing or too short (need >= 32 chars)");
  }
  return toArrayBuffer(new TextEncoder().encode(raw));
}

function ttlSeconds(): number {
  const raw = Number(process.env.CUSTOMER_SESSION_TTL);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_SECONDS;
}

// --- signing -----------------------------------------------------------------

const b64url = {
  encode(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64url");
  },
  decode(text: string): Uint8Array {
    return new Uint8Array(Buffer.from(text, "base64url"));
  },
};

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, toArrayBuffer(new TextEncoder().encode(data)));
  return new Uint8Array(sig);
}

/** Constant-time comparison — a fast-exit compare leaks the signature. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function signGallerySession(
  payload: Omit<GallerySession, "exp">,
): Promise<{ token: string; expiresAt: Date }> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds();
  const body = b64url.encode(new TextEncoder().encode(JSON.stringify({ ...payload, exp })));
  const sig = b64url.encode(await hmac(body));
  return { token: `${body}.${sig}`, expiresAt: new Date(exp * 1000) };
}

export async function verifyGallerySession(token: string): Promise<GallerySession | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = await hmac(body);
  if (!timingSafeEqual(b64url.decode(sig), expected)) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(b64url.decode(body))) as GallerySession;
    if (parsed.exp * 1000 < Date.now()) return null;
    if (!parsed.galleryId || !parsed.shareLinkId || !parsed.selectionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

// --- request helpers ---------------------------------------------------------

export async function setGallerySessionCookie(
  payload: Omit<GallerySession, "exp">,
): Promise<Date> {
  const { token, expiresAt } = await signGallerySession(payload);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return expiresAt;
}

export async function clearGallerySessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getGallerySession(): Promise<GallerySession | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  return raw ? verifyGallerySession(raw) : null;
}

export class GallerySessionError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "LINK_EXPIRED") {
    super(code);
    this.name = "GallerySessionError";
  }
}

/**
 * Session for the current request, or throw.
 *
 * TODO(BB-030): before returning, re-read share_links.status for
 * session.shareLinkId and throw LINK_EXPIRED when it is no longer 'active'.
 * A valid signature is not enough — revoking a link must kill live sessions.
 */
export async function requireGallerySession(
  allowedRoles?: readonly ShareRole[],
): Promise<GallerySession> {
  const session = await getGallerySession();
  if (!session) throw new GallerySessionError("UNAUTHENTICATED");
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw new GallerySessionError("FORBIDDEN");
  }
  return session;
}

/** Roles allowed to change the primary selection. */
export const EDITING_ROLES: readonly ShareRole[] = ["owner", "co_editor", "suggester"];
/** Only the primary customer may submit. */
export const SUBMIT_ROLES: readonly ShareRole[] = ["owner"];
