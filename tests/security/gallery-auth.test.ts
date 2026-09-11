/**
 * BB-030 - customer gallery authentication.
 *
 * OWNER: SEC-ARCH.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/gallery/route";
import {
  assertShareLinkUsable,
  assertCustomerOwnsGallery,
  GallerySessionError,
  SESSION_COOKIE,
} from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { setupAuthFixtures, cleanupAuthFixtures } from "../fixtures/gallery-auth";

describe("BB-030 - POST /api/auth/gallery", () => {
  let gid: string;
  let revId: string;
  let customerAId: string;
  let customerBId: string;
  let galleryBId: string;

  beforeAll(async () => {
    const res = await setupAuthFixtures();
    gid = res.gid;
    revId = res.revId;
    customerAId = res.customerAId;
    customerBId = res.customerBId;
    galleryBId = res.galleryBId;
  });

  afterAll(async () => {
    if (gid) await cleanupAuthFixtures(gid);
  });

  let ipCounter = 0;
  async function postAuth(token: string) {
    ipCounter += 1;
    const req = new NextRequest("http://localhost/api/auth/gallery", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.0.0.${ipCounter}, 172.16.0.1`,
      },
      body: JSON.stringify({ token }),
    });
    const res = await POST(req);
    return { res, body: await res.clone().json() };
  }

  it("Ca 1: token đúng -> ký được phiên", async () => {
    const { res, body } = await postAuth("token-active");
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
    // API should return customerId
    expect(body.data.customerId).toBe(customerAId);
  });

  it("Ca 2: link đã thu hồi -> NOT_FOUND", async () => {
    const { res, body } = await postAuth("token-revoked");
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("Ca 3: token không tồn tại -> NOT_FOUND", async () => {
    const { res, body } = await postAuth("khong-he-ton-tai");
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("Ca 4: token của khách A không xem được buổi của khách B", async () => {
    // Tests the authorization function
    await expect(assertCustomerOwnsGallery(customerAId, galleryBId)).rejects.toThrow(GallerySessionError);
    await expect(assertCustomerOwnsGallery(customerAId, galleryBId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // Positive control: Khách A xem được buổi của khách A
    await expect(assertCustomerOwnsGallery(customerAId, gid)).resolves.toBeUndefined();
  });

  it("Ca 5: thu hồi token khi phiên đang mở -> request kế tiếp bị LINK_EXPIRED", async () => {
    const admin = await createAdminClient();

    // Still good while active
    await expect(assertShareLinkUsable(revId)).resolves.toBeUndefined();

    // Revoke it
    await admin.from("share_links").update({ status: "revoked" }).eq("id", revId);

    // Next request fails
    await expect(assertShareLinkUsable(revId)).rejects.toThrow(GallerySessionError);
    await expect(assertShareLinkUsable(revId)).rejects.toMatchObject({
      code: "LINK_EXPIRED",
    });
  });

  it("Ca 6: rate limit theo IP vẫn hoạt động (10 lần / 15 phút)", async () => {
    const ip = `10.0.0.999`;
    
    // Probe 10 times with wrong tokens
    const probes = Array.from({ length: 10 }).map(() => {
      const req = new NextRequest("http://localhost/api/auth/gallery", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ token: "wrong" }),
      });
      return POST(req);
    });
    await Promise.all(probes);

    // 11th time should be rate limited
    const req = new NextRequest("http://localhost/api/auth/gallery", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ token: "wrong" }),
    });
    const res = await POST(req);
    const body = await res.clone().json();
    
    expect(res.status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
  });
});
