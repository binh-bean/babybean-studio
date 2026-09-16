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
  assertCustomerOwnsGallery,
  GallerySessionError,
  SESSION_COOKIE,
} from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { setupAuthFixtures, cleanupAuthFixtures, type AuthFixtures } from "../fixtures/gallery-auth";

describe("BB-030 - POST /api/auth/gallery", () => {
  let gid: string;
  let revId: string;
  let customerAId: string;
  let galleryBId: string;
  let customerToken: string;
  let fixtures: AuthFixtures;

  beforeAll(async () => {
    fixtures = await setupAuthFixtures();
    gid = fixtures.gid;
    revId = fixtures.revId;
    customerAId = fixtures.customerAId;
    galleryBId = fixtures.galleryBId;
    customerToken = fixtures.customerToken;
  });

  afterAll(async () => {
    if (fixtures) await cleanupAuthFixtures(fixtures);
  });

  /**
   * Mỗi phép thử một IP riêng, VÀ mỗi LẦN CHẠY một dải IP riêng.
   *
   * Bộ giới hạn tần suất đếm activity_logs theo IP trong 15 PHÚT. Bản cũ dùng
   * 10.0.0.1, 10.0.0.2... cố định, nên chạy lại bộ test trong vòng 15 phút là
   * những IP đó đã mang sẵn lịch sử của lần trước: phép thử chờ 401 thì nhận
   * 429, chờ 429 thì nhận 401, tuỳ lần.
   *
   * Xảy ra thật ngày 12.09.2026: chạy riêng tệp này thì 14/14 đạt, chạy trong
   * cả bộ thì hai ca đỏ. Bộ test chập chờn tệ hơn bộ test đỏ — người ta học
   * thói quen chạy lại cho tới khi xanh, và một lỗi thật sẽ trôi qua giữa
   * những lần chạy lại đó.
   *
   * Dải ngẫu nhiên mỗi lần chạy thì không lần nào giẫm lên lần nào.
   */
  const ipRun = `10.${((process.pid ?? 1) % 200) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  let ipCounter = 0;
  async function postAuth(token: string, pin?: string) {
    ipCounter += 1;
    const req = new NextRequest("http://localhost/api/auth/gallery", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `${ipRun}.${ipCounter}, 172.16.0.1`,
      },
      body: JSON.stringify(pin === undefined ? { token } : { token, pin }),
    });
    const res = await POST(req);
    return { res, body: await res.clone().json() };
  }

  it("Ca 1: token đúng, không cần PIN -> ký được phiên", async () => {
    const { res } = await postAuth(fixtures.tokenNoPin);
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
  });

  it("Ca 2: link ngày xưa từng cài PIN -> giờ vào thẳng không cần PIN", async () => {
    const { res, body } = await postAuth(fixtures.tokenWithPin);
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
    expect(body.data.galleryId).toBe(gid);
  });

  it("Ca 6: link đã thu hồi -> NOT_FOUND", async () => {
    const { res, body } = await postAuth(fixtures.tokenRevoked);
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("Ca 7: expires_at ở quá khứ nhưng status vẫn 'active' -> NOT_FOUND", async () => {
    const { res, body } = await postAuth(fixtures.tokenExpired);
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("Ca 8: token không tồn tại -> NOT_FOUND", async () => {
    const { res, body } = await postAuth("khong-he-ton-tai");
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("Ca 9: share_link chưa có selection -> tạo mới rồi ký phiên", async () => {
    const { res } = await postAuth(fixtures.tokenNoSelections);
    expect(res.status).toBe(200);

    const admin = await createAdminClient();
    const { data } = await admin
      .from("selections")
      .select("id")
      .eq("gallery_id", gid);
    expect(data?.length).toBeGreaterThan(0);
  });

  it("Ca 10: thu hồi link khi phiên đang mở -> request kế tiếp bị LINK_EXPIRED", async () => {
    const admin = await createAdminClient();

    // Still good while active - the positive control
    await expect(assertShareLinkUsable(revId)).resolves.toBeUndefined();

    await admin.from("share_links").update({ status: "revoked" }).eq("id", revId);

    await expect(assertShareLinkUsable(revId)).rejects.toThrow(GallerySessionError);
    await expect(assertShareLinkUsable(revId)).rejects.toMatchObject({
      code: "LINK_EXPIRED",
    });
  });

  it("Ca 11: token của khách portal -> ký được phiên và trả về customerId", async () => {
    const { res, body } = await postAuth(customerToken);
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
    expect(body.data.customerId).toBe(customerAId);
  });

  it("Ca 12: token của khách A không xem được buổi của khách B", async () => {
    await expect(assertCustomerOwnsGallery(customerAId, galleryBId)).rejects.toThrow(GallerySessionError);
    await expect(assertCustomerOwnsGallery(customerAId, galleryBId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await expect(assertCustomerOwnsGallery(customerAId, gid)).resolves.toBeUndefined();
  });

  it("Ca 13: rate limit theo IP vẫn hoạt động (10 lần / 15 phút)", async () => {
    const ip = `${ipRun}.254`;
    
    for (let i = 0; i < 10; i++) {
      const req = new NextRequest("http://localhost/api/auth/gallery", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ token: "wrong" }),
      });
      await POST(req);
    }

    // Removed query

    const req = new NextRequest("http://localhost/api/auth/gallery", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ token: "wrong" }),
    });
    const res = await POST(req);
    const body = await res.clone().json();
    
    expect(res.status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
  }, 15000);
});
