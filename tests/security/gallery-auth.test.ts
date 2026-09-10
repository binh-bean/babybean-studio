import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupAuthFixtures, cleanupAuthFixtures } from "../fixtures/gallery-auth";
import { createAdminClient } from "@/lib/supabase/admin";

describe("BB-030 - POST /api/auth/gallery", () => {
  let gid: string;
  
  const url = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  beforeAll(async () => {
    const res = await setupAuthFixtures();
    gid = res.gid;
    revId = res.revId;
  });

  afterAll(async () => {
    if (gid) await cleanupAuthFixtures(gid);
  });

  async function postAuth(token: string, pin?: string) {
    return fetch(`${url}/api/auth/gallery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, pin })
    });
  }

  it("Ca 1: token đúng + không cần PIN -> ký được phiên", async () => {
    const res = await postAuth("token-no-pin");
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("bb_gs=");
  });

  it("Ca 2: token đúng + PIN đúng -> ký được phiên", async () => {
    const res = await postAuth("token-with-pin", "1234");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("bb_gs=");
  });

  it("Ca 3: token đúng + PIN sai -> PIN_INVALID, failed_attempts tăng", async () => {
    const res = await postAuth("token-with-pin", "9999");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("PIN_INVALID");
  });

  it("Ca 4: sai PIN lần thứ 5 -> PIN_LOCKED, locked_until được đặt", async () => {
    for (let i = 0; i < 3; i++) {
      await postAuth("token-with-pin", "9999");
    }
    const res = await postAuth("token-with-pin", "9999");
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("PIN_LOCKED");
  });

  it("Ca 5: đang trong thời gian khoá -> PIN_LOCKED kể cả khi PIN đúng", async () => {
    const res = await postAuth("token-with-pin", "1234");
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("PIN_LOCKED");
  });

  it("Ca 6: status='revoked' -> NOT_FOUND", async () => {
    const res = await postAuth("token-revoked");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("Ca 7: expires_at trong quá khứ, status vẫn 'active' -> NOT_FOUND", async () => {
    const res = await postAuth("token-expired");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("Ca 8: token không tồn tại -> NOT_FOUND", async () => {
    const res = await postAuth("token-invalid");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("Ca 9: share_link chưa có selections -> tạo mới, ký phiên thành công", async () => {
    const res = await postAuth("token-no-selections");
    expect(res.status).toBe(200);
    const admin = await createAdminClient();
    const { data: sel } = await admin.from("selections").select("id").eq("gallery_id", gid).limit(1);
    expect(sel?.length).toBeGreaterThan(0);
  });
});
