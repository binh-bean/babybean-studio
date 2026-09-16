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

    const { token } = parsed.data;
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

    // Unknown, revoked and expired all answer identically. Telling them apart
    // would confirm which albums exist to someone who is guessing.
    const isLegacy = !link?.customer_id;
    const usable =
      link &&
      link.status === "active" &&
      (!isLegacy || !link.expires_at || new Date(link.expires_at) > new Date());

    if (!usable) return fail("NOT_FOUND");

    // One selection per share link, created on first successful entry rather
    // than at gallery creation: BB-065 mints new share links later and they
    // would otherwise arrive without one.
    //
    // Link gắn theo khách thì chưa biết buổi chụp nào, nên chưa tạo được lượt
    // chọn ở đây. Ba mẹ chọn buổi ở `/api/g/buoi-chup`, và lượt chọn sinh ra ở
    // đó (BB-130) — mỗi buổi chụp một lượt riêng.
    let selectionId = "";
    if (isLegacy && link.gallery_id) {
      const { data: existing } = await admin
        .from("selections")
        .select("id")
        // Khoá thêm theo bộ ảnh: từ 0040 một link có thể mang nhiều lượt chọn,
        // nên tìm theo mỗi link là có ngày bốc trúng lượt chọn của buổi khác.
        .eq("share_link_id", link.id)
        .eq("gallery_id", link.gallery_id)
        .maybeSingle();

      if (existing) {
        selectionId = existing.id;
      } else {
        // BB-148 — cấp lại link thì lượt chọn ĐI THEO link mới.
        //
        // Chủ studio chốt 15.09.2026: link cũ chết hẳn, nhưng ảnh ba mẹ đã thả
        // tim phải còn nguyên. Studio cấp lại link vì lý do của studio, không
        // phải lỗi của khách.
        //
        // uq_selections_primary chỉ cho MỘT lượt chọn mang cờ trên mỗi bộ ảnh.
        // Bản cũ cứ thế insert thêm một cái nữa, nên link thứ hai mở lên là
        // đụng khoá trùng, ném lỗi, 500 — và màn khách hiện "Link đã hết hạn".
        const { data: dangGiuCo } = await admin
          .from("selections")
          .select("id, share_links!inner(status)")
          .eq("gallery_id", link.gallery_id)
          .eq("is_primary", true)
          .maybeSingle();

        // Link giữ cờ đã chết thì lượt chọn đó là của khách này, chuyển sang.
        // Link giữ cờ CÒN SỐNG thì không đụng vào: hai người mở hai link hợp lệ
        // mà người sau kéo lượt chọn về mình là người trước mất sạch lựa chọn
        // vừa làm, không có gì báo. Cấp lại link luôn thu hồi link cũ trước,
        // nên nhánh này không cản đường đi thường ngày.
        const giuBoiLinkDaChet =
          dangGiuCo &&
          (dangGiuCo as { share_links?: { status?: string } }).share_links?.status !== "active";

        if (link.role === "owner" && dangGiuCo && giuBoiLinkDaChet) {
          const { error: updErr } = await admin
            .from("selections")
            .update({ share_link_id: link.id })
            .eq("id", dangGiuCo.id);

          if (updErr) throw updErr;
          selectionId = dangGiuCo.id;
        }

        if (!selectionId) {
          const { data: created, error: insErr } = await admin
            .from("selections")
            .insert({
              gallery_id: link.gallery_id,
              share_link_id: link.id,
              // Chỉ nhận cờ khi chưa ai giữ. Bộ ảnh đang có lượt chọn chính của
              // một link còn sống thì link này là link phụ, không phải link hỏng.
              is_primary: link.role === "owner" && !dangGiuCo,
            })
            .select("id")
            .single();

          if (insErr || !created) throw insErr ?? new Error("selection insert returned nothing");
          selectionId = created.id;
        }
      }
    }

    await admin
      .from("share_links")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("id", link.id);

    const { token: sessionToken, expiresAt } = await signGallerySession({
      customerId: link.customer_id || "",
      galleryId: link.gallery_id || "",
      shareLinkId: link.id,
      selectionId,
      role: link.role as ShareRole,
    });

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
