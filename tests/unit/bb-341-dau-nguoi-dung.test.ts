/**
 * BB-341 — dấu "middleware đã xác thực" (src/lib/auth/dau-nguoi-dung.ts).
 *
 * Dấu này cho `requireStaff()` BỎ QUA lượt `getUser()` thứ hai. Nếu giả được
 * nó, người ngoài đội lốt được nhân viên khác — nên phép thử ở đây toàn là ca
 * PHỦ ĐỊNH: mọi biến thể giả/sửa/lệch cookie/hết hạn đều phải trả `null`
 * (tức `requireStaff()` quay về hỏi Supabase Auth như cũ).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { kyNguoiDung, docNguoiDung } from "@/lib/auth/dau-nguoi-dung";

const UID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const UID_KHAC = "11111111-2222-4333-8444-555555555555";
const COOKIE = "sb-abc-auth-token=base64-eyJhbGciOi...; bb_gs=xyz";
let bimatCu: string | undefined;

beforeAll(() => {
  bimatCu = process.env.APP_SECRET;
  process.env.APP_SECRET = "Fixture-BB-341-bi-mat-thu-dai-hon-32-ky-tu-0123456789";
});
afterAll(() => {
  if (bimatCu === undefined) delete process.env.APP_SECRET;
  else process.env.APP_SECRET = bimatCu;
});

describe("BB-341 — dấu người dùng từ middleware", () => {
  it("dấu thật cho đúng cookie → trả đúng uid", async () => {
    const dau = await kyNguoiDung(UID, COOKIE);
    expect(dau).not.toBeNull();
    expect(await docNguoiDung(dau, COOKIE)).toBe(UID);
  });

  it("đổi uid trong dấu (đội lốt người khác) → null", async () => {
    const dau = (await kyNguoiDung(UID, COOKIE))!;
    expect(await docNguoiDung(dau.replace(UID, UID_KHAC), COOKIE)).toBeNull();
  });

  it("dấu thật nhưng đi kèm COOKIE KHÁC (dấu lọt ra ngoài) → null", async () => {
    const dau = await kyNguoiDung(UID, COOKIE);
    expect(await docNguoiDung(dau, "sb-abc-auth-token=cua-nguoi-khac")).toBeNull();
  });

  it("hết hạn (quá 30 giây) → null", async () => {
    const t = Date.now();
    const dau = await kyNguoiDung(UID, COOKIE, t);
    expect(await docNguoiDung(dau, COOKIE, t + 29_000)).toBe(UID);
    expect(await docNguoiDung(dau, COOKIE, t + 31_000)).toBeNull();
  });

  it("ký bằng bí mật KHÁC (kẻ ngoài tự ký) → null", async () => {
    const dau = await kyNguoiDung(UID, COOKIE);
    process.env.APP_SECRET = "Fixture-BB-341-mot-bi-mat-hoan-toan-khac-0000000000";
    try {
      expect(await docNguoiDung(dau, COOKIE)).toBeNull();
    } finally {
      process.env.APP_SECRET = "Fixture-BB-341-bi-mat-thu-dai-hon-32-ky-tu-0123456789";
    }
  });

  it("giá trị rác, rỗng, thiếu phần, uid không phải uuid → null", async () => {
    for (const rac of [null, "", "abc", `${UID}.9999999999.x`, `khong-phai-uuid.9999999999.a.b`]) {
      expect(await docNguoiDung(rac, COOKIE)).toBeNull();
    }
  });

  it("thiếu APP_SECRET → không ký, không đọc (requireStaff tự hỏi getUser)", async () => {
    const dau = await kyNguoiDung(UID, COOKIE);
    delete process.env.APP_SECRET;
    try {
      expect(await kyNguoiDung(UID, COOKIE)).toBeNull();
      expect(await docNguoiDung(dau, COOKIE)).toBeNull();
    } finally {
      process.env.APP_SECRET = "Fixture-BB-341-bi-mat-thu-dai-hon-32-ky-tu-0123456789";
    }
  });
});
