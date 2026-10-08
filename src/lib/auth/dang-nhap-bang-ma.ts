/**
 * Đổi MÃ LINK lấy PHIÊN khách — lõi dùng chung của:
 *   - `POST /api/auth/gallery` (đường cũ, giữ nguyên hành vi), và
 *   - `GET /api/g/gallery?token=…` khi CHƯA có phiên (BB-341).
 *
 * OWNER: SEC-ARCH. Tách nguyên văn từ `src/app/api/auth/gallery/route.ts`
 * (BB-030, BB-148, BB-183, BB-214a) — luật không đổi một dòng: giới hạn lượt
 * theo IP TRƯỚC khi tra mã, ghi nhật ký mọi lượt, link thu hồi trả NOT_FOUND,
 * link hết hạn trả LINK_EXPIRED, lượt chọn đi theo link mới khi cấp lại.
 *
 * BB-341 — vì sao tách: lần đầu ba mẹ mở link, màn khách phải đi BA vòng nối
 * đuôi (GET bộ ảnh → 401 → POST đăng nhập → GET lại). Đo bản build ở máy, giả
 * lập 4G: `/api/auth/gallery` là lượt API chậm nhất của màn khách (~1 s). Nay
 * `GET /api/g/gallery` tự đổi mã lấy phiên ngay trong lượt đầu, đặt cookie lên
 * chính phản hồi trả dữ liệu — một vòng thay vì ba.
 */
import "server-only";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signGallerySession, SESSION_COOKIE } from "@/lib/auth/gallery-session";
import { bamMaLink } from "@/lib/auth/bam-ma-link";
import { ghiMocKhachMoBoAnh } from "@/lib/selection/luot-chon-theo-link";
import type { GallerySession, ShareRole } from "@/types/domain";

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
export function clientIp(req: Pick<NextRequest, "headers">): string | null {
  const raw = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  const first = raw?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export type KetQuaDangNhap =
  | {
      ok: true;
      phien: Omit<GallerySession, "exp">;
      /** Giá trị cookie đã ký + hạn — đặt lên phản hồi bằng `datCookiePhien`. */
      cookie: { token: string; expiresAt: Date };
    }
  | { ok: false; code: "RATE_LIMITED" | "NOT_FOUND" | "LINK_EXPIRED"; message?: string };

export async function dangNhapBangMa(
  token: string,
  req: Pick<NextRequest, "headers">,
): Promise<KetQuaDangNhap> {
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

    if ((count ?? 0) >= RATE_LIMIT_PER_IP) return { ok: false, code: "RATE_LIMITED" };
  }

  const { error: logErr } = await admin.from("activity_logs").insert({
    actor_type: "customer",
    action: ACTION,
    ip,
    user_agent: req.headers.get("user-agent"),
    metadata: { tokenPrefix: token.slice(0, 6) },
  });
  if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

  const { data: link } = await admin
    .from("share_links")
    .select("id, gallery_id, customer_id, role, status, expires_at")
    .eq("token_hash", await bamMaLink(token))
    .maybeSingle();

  // Trả lời gì cho link không dùng được — xem chú thích dài ở
  // src/app/api/auth/gallery/route.ts (BB-183): ca ĐÃ THU HỒI vẫn trả
  // NOT_FOUND, chỉ ca HẾT HẠN mới được nói riêng.
  const isLegacy = !link?.customer_id;
  const usable =
    link &&
    link.status === "active" &&
    (!link.expires_at || new Date(link.expires_at) > new Date());

  if (!usable) {
    if (link && link.expires_at && new Date(link.expires_at) <= new Date()) {
      return { ok: false, code: "LINK_EXPIRED", message: "Ba mẹ liên hệ studio để được gửi lại link nhé." };
    }
    return { ok: false, code: "NOT_FOUND" };
  }

  // One selection per share link, created on first successful entry rather
  // than at gallery creation: BB-065 mints new share links later and they
  // would otherwise arrive without one. Link gắn theo khách thì lượt chọn sinh
  // ở `/api/g/buoi-chup` (BB-130).
  let selectionId = "";
  if (isLegacy && link.gallery_id) {
    const { data: existing } = await admin
      .from("selections")
      .select("id")
      .eq("share_link_id", link.id)
      .eq("gallery_id", link.gallery_id)
      .maybeSingle();

    if (existing) {
      selectionId = existing.id;
    } else {
      // BB-148 — cấp lại link thì lượt chọn ĐI THEO link mới (chỉ khi link
      // đang giữ cờ đã chết; link còn sống thì không kéo về).
      const { data: dangGiuCo } = await admin
        .from("selections")
        .select("id, share_links!inner(status)")
        .eq("gallery_id", link.gallery_id)
        .eq("is_primary", true)
        .maybeSingle();

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
            is_primary: link.role === "owner" && !dangGiuCo,
          })
          .select("id")
          .single();

        if (insErr || !created) throw insErr ?? new Error("selection insert returned nothing");
        selectionId = created.id;
        // BB-402 — lần mở đầu tiên của link này: mốc first_viewed_at (+ sent_at nếu trống).
        await ghiMocKhachMoBoAnh(admin, link.gallery_id);
      }
    }
  }

  // Đếm lượt mở NGUYÊN TỬ (migration 0064, BB-214a). Hụt không chặn khách.
  const { error: demErr } = await admin.rpc("tang_luot_mo_link", {
    p_share_link_id: link.id,
  });
  if (demErr) console.error("[share_links] Đếm lượt mở hụt:", demErr);

  const phien: Omit<GallerySession, "exp"> = {
    customerId: link.customer_id || "",
    galleryId: link.gallery_id || "",
    shareLinkId: link.id,
    selectionId,
    role: link.role as ShareRole,
  };
  const cookie = await signGallerySession(phien);
  return { ok: true, phien, cookie };
}

/** Đặt cookie phiên lên một phản hồi — cùng thuộc tính với bản cũ của POST. */
export function datCookiePhien(
  response: { cookies: { set: (name: string, value: string, opts: Record<string, unknown>) => unknown } },
  cookie: { token: string; expiresAt: Date },
): void {
  response.cookies.set(SESSION_COOKIE, cookie.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: cookie.expiresAt,
  });
}
