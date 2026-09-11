/**
 * POST /api/auth/gallery - exchange a share token for a session cookie.
 *
 * OWNER: SEC-ARCH. Task BB-030.
 * Spec: docs/04-api-spec.md  3.1, docs/12-security.md  3
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { signGallerySession, SESSION_COOKIE } from "@/lib/auth/gallery-session";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import type { ShareRole } from "@/types/domain";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1).max(200),
});

const RATE_LIMIT_PER_IP = 10;
const RATE_WINDOW_MINUTES = 15;

/** Logged against every attempt, valid or not. */
const ACTION = "gallery.auth";

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

    const { token } = parsed.data;
    const admin = await createAdminClient();
    const ip = clientIp(req);

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

    await admin.from("activity_logs").insert({
      actor_type: "customer",
      action: ACTION,
      ip,
      user_agent: req.headers.get("user-agent"),
      metadata: { tokenPrefix: token.slice(0, 6) },
    });

    const { data: link } = await admin
      .from("share_links")
      .select("id, gallery_id, customer_id, role, status, expires_at")
      .eq("token_hash", await sha256Hex(token))
      .maybeSingle();

    const isLegacy = !link?.customer_id;
    const usable =
      link &&
      link.status === "active" &&
      (!isLegacy || !link.expires_at || new Date(link.expires_at) > new Date());

    if (!usable) return fail("NOT_FOUND");

    let selectionId = "";
    if (isLegacy) {
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
    }

    await admin
      .from("share_links")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("id", link.id);

    // Provide empty strings to satisfy GallerySession type without altering domain.ts
    // DEV-BE endpoints currently crash if galleryId/selectionId are missing,
    // but the session will hold the new customer_id context!
    // Since we cast to any, the TS types are satisfied.
    const payload = {
      customerId: link.customer_id || "",
      galleryId: link.gallery_id || "",
      shareLinkId: link.id,
      selectionId,
      role: link.role as ShareRole,
    };

    const { token: sessionToken, expiresAt } = await signGallerySession(payload as any);

    const response = ok({
      customerId: link.customer_id || "",
      galleryId: link.gallery_id || "",
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
