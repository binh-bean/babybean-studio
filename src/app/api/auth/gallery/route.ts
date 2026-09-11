/**
 * POST /api/auth/gallery — exchange a share token (+ PIN) for a session cookie.
 *
 * OWNER: SEC-ARCH. Task BB-030.
 * Spec: docs/04-api-spec.md §3.1, docs/12-security.md §3
 *
 * The cookie is set on the returned response rather than through next/headers
 * `cookies()`. Both work in production; only this one can be called directly
 * from a test, and a security route nobody can test is a security route nobody
 * checks.
 */

import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { signGallerySession, SESSION_COOKIE } from "@/lib/auth/gallery-session";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import type { ShareRole } from "@/types/domain";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1).max(200),
  pin: z.string().optional(),
});

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RATE_LIMIT_PER_IP = 10;
const RATE_WINDOW_MINUTES = 15;

/** Logged against every attempt, valid or not. Dotted, like every other action. */
const ACTION = "gallery.auth";

/**
 * x-forwarded-for is a list — "client, proxy1, proxy2" — and the client is
 * first. The whole string is not a valid inet, and neither is a placeholder
 * like "unknown": either would make the activity_logs insert throw and take
 * the whole login down with it. Absent header means null.
 */
function clientIp(req: NextRequest): string | null {
  const raw = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  const first = raw?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Buffer.from(buf).toString("hex");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const reqId = crypto.randomUUID();

  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return fail("INVALID_INPUT");

    const { token, pin } = parsed.data;
    const admin = await createAdminClient();
    const ip = clientIp(req);

    // Rate limit BEFORE the token is looked up. Checking it afterwards would
    // let someone probe tokens forever, because an unknown token returns
    // early and never reaches the counter — docs/05-rbac.md §5 asks for the
    // opposite.
    if (ip) {
      const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
      const { count } = await admin
        .from("activity_logs")
        .select("*", { count: "exact", head: true })
        .eq("action", ACTION)
        .eq("ip", ip)
        .gte("created_at", since);

      if ((count ?? 0) >= RATE_LIMIT_PER_IP) return fail("RATE_LIMITED");
    }

    // Logged before we know whether the token is real, so probing counts too.
    // Only the 6-character prefix is ever written down.
    await admin.from("activity_logs").insert({
      actor_type: "customer",
      action: ACTION,
      ip,
      user_agent: req.headers.get("user-agent"),
      metadata: { tokenPrefix: token.slice(0, 6) },
    });

    const { data: link } = await admin
      .from("share_links")
      .select("id, gallery_id, role, status, expires_at, requires_pin, pin_hash, failed_attempts, locked_until")
      .eq("token_hash", await sha256Hex(token))
      .maybeSingle();

    // Unknown, revoked and expired all answer identically. Telling them apart
    // would confirm which albums exist to someone who is guessing.
    const usable =
      link &&
      link.status === "active" &&
      (!link.expires_at || new Date(link.expires_at) > new Date());

    if (!usable) return fail("NOT_FOUND");

    if (link.requires_pin) {
      if (!link.pin_hash) {
        // Never treat this as "no PIN needed" — that turns a misconfigured
        // link into an open one.
        console.error(JSON.stringify({ evt: "pin_hash_missing", shareLinkId: link.id, reqId }));
        return fail("INTERNAL");
      }

      const lockedUntil = link.locked_until ? new Date(link.locked_until) : null;
      const stillLocked = lockedUntil !== null && lockedUntil > new Date();

      if (stillLocked) {
        return fail("PIN_LOCKED", undefined, {
          retryAfter: Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
        });
      }

      // A lock that has run out clears the counter. Without this the counter
      // stays at 5 forever, so the next single typo re-locks the album — and
      // it is a parent on a phone typing the last four digits of their own
      // number.
      const priorAttempts = lockedUntil !== null ? 0 : (link.failed_attempts ?? 0);

      if (!pin) return fail("PIN_REQUIRED");

      if (!(await bcrypt.compare(pin, link.pin_hash))) {
        const attempts = priorAttempts + 1;
        const lockNow = attempts >= MAX_ATTEMPTS;

        await admin
          .from("share_links")
          .update({
            failed_attempts: attempts,
            locked_until: lockNow
              ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
              : null,
          })
          .eq("id", link.id);

        return lockNow
          ? fail("PIN_LOCKED", undefined, { retryAfter: LOCK_MINUTES * 60 })
          : fail("PIN_INVALID", undefined, { remainingAttempts: MAX_ATTEMPTS - attempts });
      }

      if (priorAttempts > 0 || lockedUntil !== null) {
        await admin
          .from("share_links")
          .update({ failed_attempts: 0, locked_until: null })
          .eq("id", link.id);
      }
    }

    // One selection per share link, created on first successful entry rather
    // than at gallery creation: BB-065 mints new share links later and they
    // would otherwise arrive without one.
    let selectionId: string;
    const { data: existing } = await admin
      .from("selections")
      .select("id")
      .eq("share_link_id", link.id)
      .maybeSingle();

    if (existing) {
      selectionId = existing.id;
    } else {
      const { data: created, error: insErr } = await admin
        .from("selections")
        .insert({
          gallery_id: link.gallery_id,
          share_link_id: link.id,
          is_primary: link.role === "owner",
        })
        .select("id")
        .single();

      if (insErr || !created) throw insErr ?? new Error("selection insert returned nothing");
      selectionId = created.id;
    }

    await admin
      .from("share_links")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("id", link.id);

    const { token: sessionToken, expiresAt } = await signGallerySession({
      galleryId: link.gallery_id,
      shareLinkId: link.id,
      selectionId,
      role: link.role as ShareRole,
    });

    const response = ok({
      galleryId: link.gallery_id,
      role: link.role,
      expiresAt: expiresAt.toISOString(),
    });

    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    return response;
  } catch (err) {
    return failUnexpected(err, reqId);
  }
}
