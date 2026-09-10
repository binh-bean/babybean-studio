import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setGallerySessionCookie } from "@/lib/auth/gallery-session";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(1),
  pin: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const reqId = crypto.randomUUID();
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return fail("INVALID_INPUT", "Invalid body");
    }

    const { token, pin } = parsed.data;

    // 1. Tra share_links theo sha256(token)
    const tokenHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token)
    ).then(buf => Buffer.from(buf).toString("hex"));

    const admin = await createAdminClient();
    const { data: link, error: linkErr } = await admin
      .from("share_links")
      .select(`
        id, gallery_id, role, status, expires_at,
        requires_pin, pin_hash, failed_attempts, locked_until
      `)
      .eq("token_hash", tokenHash)
      .single();

    if (linkErr || !link) {
      // 8. Token sai -> NOT_FOUND (same error for revoked/expired)
      return fail("NOT_FOUND");
    }

    // 2. Điều kiện link còn dùng được
    if (link.status !== "active") {
      return fail("NOT_FOUND"); // same error
    }
    
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return fail("NOT_FOUND"); // same error
    }

    // 7. Giới hạn tần suất 10 lần/15 phút/IP
    // Đếm từ activity_logs
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const { count, error: countErr } = await admin
      .from("activity_logs")
      .select("*", { count: "exact", head: true })
      .eq("action", "gallery_auth")
      .eq("ip", ip)
      .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
      
    if (countErr) {
      console.error("CountErr:", countErr);
      throw countErr;
    }
    if ((count ?? 0) >= 10) {
      return fail("RATE_LIMITED");
    }

    // Log the attempt (auth started)
    const { error: insErrAct } = await admin.from("activity_logs").insert({
      actor_type: "customer",
      actor_id: link.id,
      entity_type: "gallery",
      entity_id: link.gallery_id,
      action: "gallery_auth",
      ip: ip,
      metadata: { token_prefix: token.substring(0, 6) }
    });
    if (insErrAct) throw insErrAct;

    // 4 & 5 & 6. PIN logic
    if (link.requires_pin) {
      if (!link.pin_hash) {
        // 5. Lỗi cấu hình -> INTERNAL
        console.error(`Link ${link.id} requires_pin but pin_hash is null`);
        return fail("INTERNAL", "Lỗi cấu hình hệ thống");
      }

      if (link.locked_until && new Date(link.locked_until) > new Date()) {
        const retryAfter = Math.ceil((new Date(link.locked_until).getTime() - Date.now()) / 1000);
        return fail("PIN_LOCKED", "PIN bị khoá", { retryAfter });
      }

      if (!pin) {
        return fail("PIN_REQUIRED");
      }

      const isValid = await bcrypt.compare(pin, link.pin_hash);
      if (!isValid) {
        const newAttempts = (link.failed_attempts ?? 0) + 1;
        const lockedUntil = newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
        
        await admin.from("share_links").update({
          failed_attempts: newAttempts,
          locked_until: lockedUntil?.toISOString() ?? null
        }).eq("id", link.id);

        if (lockedUntil) {
          return fail("PIN_LOCKED", "PIN bị khoá", { retryAfter: 15 * 60 });
        }
        return fail("PIN_INVALID", "PIN sai", { remainingAttempts: 5 - newAttempts });
      } else {
        // Success -> reset attempts
        if ((link.failed_attempts ?? 0) > 0 || link.locked_until) {
          await admin.from("share_links").update({
            failed_attempts: 0,
            locked_until: null
          }).eq("id", link.id);
        }
      }
    }

    // 3. TẠO selections NẾU CHƯA CÓ
    let selectionId = "";
    const { data: existingSel } = await admin
      .from("selections")
      .select("id")
      .eq("share_link_id", link.id)
      .maybeSingle();

    if (existingSel) {
      selectionId = existingSel.id;
    } else {
      const { data: newSel, error: insErr } = await admin
        .from("selections")
        .insert({
          gallery_id: link.gallery_id,
          share_link_id: link.id,
          is_primary: link.role === "owner"
        })
        .select("id")
        .single();
        
      if (insErr) {
        console.error("InsErr:", insErr);
        throw insErr;
      }
      selectionId = newSel.id;
    }

    // Update last_viewed_at
    await admin.from("share_links").update({ last_viewed_at: new Date().toISOString() }).eq("id", link.id);

    // 9. Đặt cookie
    await setGallerySessionCookie({
      galleryId: link.gallery_id,
      shareLinkId: link.id,
      selectionId: selectionId,
      role: link.role as "owner" | "viewer" | "co_editor" | "suggester"
    });

    return ok({ success: true });
  } catch (err) {
    console.error("Caught error:", err);
    return failUnexpected(err, reqId);
  }
}
