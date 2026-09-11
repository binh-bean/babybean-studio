/**
 * BB-030 — customer gallery authentication.
 *
 * OWNER: SEC-ARCH.
 *
 * These call the route handler directly instead of over HTTP. The earlier
 * version posted to NEXT_PUBLIC_APP_URL, which is localhost:3000 on a dev
 * machine and nothing at all during `npm run verify` — every case was skipped
 * and the suite reported no failures, which is worse than failing.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/gallery/route";
import {
  assertShareLinkUsable,
  GallerySessionError,
  SESSION_COOKIE,
} from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { setupAuthFixtures, cleanupAuthFixtures } from "../fixtures/gallery-auth";

describe("BB-030 — POST /api/auth/gallery", () => {
  let gid: string;
  let revId: string;
  let pinLinkId: string;

  beforeAll(async () => {
    const res = await setupAuthFixtures();
    gid = res.gid;
    revId = res.revId;
    pinLinkId = res.pinLinkId;
  });

  afterAll(async () => {
    if (gid) await cleanupAuthFixtures(gid);
  });

  /** Each call gets its own IP so the rate limiter does not bleed across cases. */
  let ipCounter = 0;
  async function postAuth(token: string, pin?: string) {
    ipCounter += 1;
    const req = new NextRequest("http://localhost/api/auth/gallery", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.0.0.${ipCounter}, 172.16.0.1`,
      },
      body: JSON.stringify(pin === undefined ? { token } : { token, pin }),
    });
    const res = await POST(req);
    return { res, body: await res.clone().json() };
  }

  it("Ca 1: token đúng, không cần PIN → ký được phiên", async () => {
    const { res } = await postAuth("token-no-pin");
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
  });

  it("Ca 2: token đúng + PIN đúng → ký được phiên", async () => {
    const { res, body } = await postAuth("token-with-pin", "1234");
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
    expect(body.data.galleryId).toBe(gid);
  });

  it("Ca 3: PIN sai → PIN_INVALID và failed_attempts tăng", async () => {
    const { res, body } = await postAuth("token-with-pin", "9999");
    expect(res.status).toBe(401);
    expect(body.error.code).toBe("PIN_INVALID");
    expect(body.error.details.remainingAttempts).toBe(4);
  });

  it("Ca 4: sai lần thứ 5 → PIN_LOCKED", async () => {
    for (let i = 0; i < 3; i++) await postAuth("token-with-pin", "9999");
    const { res, body } = await postAuth("token-with-pin", "9999");
    expect(res.status).toBe(429);
    expect(body.error.code).toBe("PIN_LOCKED");
  });

  it("Ca 5: đang bị khoá → PIN_LOCKED kể cả khi PIN đúng", async () => {
    const { res, body } = await postAuth("token-with-pin", "1234");
    expect(res.status).toBe(429);
    expect(body.error.code).toBe("PIN_LOCKED");
  });

  it("Ca 5b: hết hạn khoá thì bộ đếm về 0, một lần gõ nhầm KHÔNG khoá lại", async () => {
    const admin = await createAdminClient();
    // Wind the lock back into the past, leaving failed_attempts at 5 exactly
    // as a real expiring lock does.
    await admin
      .from("share_links")
      .update({ locked_until: new Date(Date.now() - 1000).toISOString(), failed_attempts: 5 })
      .eq("id", pinLinkId);

    const { res, body } = await postAuth("token-with-pin", "9999");
    expect(res.status).toBe(401);
    expect(body.error.code).toBe("PIN_INVALID");
    expect(body.error.details.remainingAttempts).toBe(4);
  });

  it("Ca 6: link đã thu hồi → NOT_FOUND", async () => {
    const { res, body } = await postAuth("token-revoked");
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("Ca 7: expires_at ở quá khứ nhưng status vẫn 'active' → NOT_FOUND", async () => {
    const { res, body } = await postAuth("token-expired");
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("Ca 8: token không tồn tại → NOT_FOUND, giống hệt ca 6 và 7", async () => {
    const { res, body } = await postAuth("khong-he-ton-tai");
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("Ca 9: share_link chưa có selection → tạo mới rồi ký phiên", async () => {
    const { res } = await postAuth("token-no-selections");
    expect(res.status).toBe(200);

    const admin = await createAdminClient();
    const { data } = await admin
      .from("selections")
      .select("id")
      .eq("gallery_id", gid);
    expect(data?.length).toBeGreaterThan(0);
  });

  it("Ca 10: thu hồi link khi phiên đang mở → request kế tiếp bị LINK_EXPIRED", async () => {
    const admin = await createAdminClient();

    // Still good while active — the positive control. Without it a broken
    // assertShareLinkUsable that always throws would pass the negative case.
    await expect(assertShareLinkUsable(revId)).resolves.toBeUndefined();

    await admin.from("share_links").update({ status: "revoked" }).eq("id", revId);

    await expect(assertShareLinkUsable(revId)).rejects.toThrow(GallerySessionError);
    await expect(assertShareLinkUsable(revId)).rejects.toMatchObject({
      code: "LINK_EXPIRED",
    });
  });
});
