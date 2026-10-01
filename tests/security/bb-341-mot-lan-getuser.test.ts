/**
 * BB-341 — trang quản trị chỉ hỏi Supabase Auth MỘT lần mỗi request.
 *
 * Middleware gọi `getUser()` rồi để lại dấu ký cho `requireStaff()`
 * (src/lib/auth/dau-nguoi-dung.ts). Phép thử canh cả hai phía:
 *
 *   NHANH  — /admin: middleware chuyển xuống một dấu hợp lệ; `requireStaff()`
 *            đọc được dấu thì KHÔNG gọi `getUser()` lần hai.
 *   AN TOÀN — dấu GIẢ do trình duyệt tự gửi bị middleware xoá trên MỌI đường
 *            (kể cả /api/admin/*, nơi middleware không hỏi Auth); và
 *            `requireStaff()` gặp dấu sai thì quay về `getUser()`.
 *
 * Giả lập ở biên: Supabase (mạng) và `next/headers` (ngữ cảnh request của Next).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const UID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const getUserMw = vi.fn(async () => ({ data: { user: { id: UID } }, error: null }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: getUserMw } }),
}));

// requireStaff: client Supabase giả — `getUser` là thứ cần đếm, các câu
// `from(...)` trả hồ sơ owner tối thiểu.
const getUserStaff = vi.fn(async () => ({ data: { user: { id: UID } }, error: null }));
function cauGia(ketQua: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "order", "limit"]) c[m] = () => c;
  c.single = async () => ketQua;
  c.maybeSingle = async () => ketQua;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return c;
}
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    auth: { getUser: getUserStaff },
    from: (bang: string) =>
      bang === "staff_profiles"
        ? cauGia({
            data: { role: "owner", is_active: true, role_id: "r", roles: { name: "owner", permissions: ["system:superuser"] } },
            error: null,
          })
        : cauGia({ data: null, error: null }),
  }),
}));
let headersGia = new Headers();
vi.mock("next/headers", () => ({ headers: async () => headersGia, cookies: async () => ({ getAll: () => [] }) }));

import { middleware } from "@/middleware";
import { HEADER_NGUOI_DUNG, kyNguoiDung } from "@/lib/auth/dau-nguoi-dung";
import { requireStaff } from "@/lib/auth/staff";

const COOKIE = "sb-x-auth-token=phien-that-cua-nhan-vien";
const DAU_RA = `x-middleware-request-${HEADER_NGUOI_DUNG}`;
let bimatCu: string | undefined;

beforeAll(() => {
  bimatCu = process.env.APP_SECRET;
  process.env.APP_SECRET = "Fixture-BB-341-bi-mat-thu-dai-hon-32-ky-tu-0123456789";
});
afterAll(() => {
  if (bimatCu === undefined) delete process.env.APP_SECRET;
  else process.env.APP_SECRET = bimatCu;
});
beforeEach(() => {
  getUserMw.mockClear();
  getUserStaff.mockClear();
});

describe("BB-341 — middleware chuyển dấu xuống, xoá dấu giả", () => {
  it("/admin: middleware hỏi Auth một lần và chuyển xuống một dấu requireStaff đọc được", async () => {
    const res = await middleware(new NextRequest("http://localhost/admin", { headers: { cookie: COOKIE } }));
    expect(getUserMw).toHaveBeenCalledTimes(1);
    const dau = res.headers.get(DAU_RA);
    expect(dau).toBeTruthy();

    // Phía requireStaff, cùng request: có dấu → không gọi getUser lần hai.
    headersGia = new Headers({ cookie: COOKIE, [HEADER_NGUOI_DUNG]: dau! });
    const staff = await requireStaff();
    expect(staff.staffId).toBe(UID);
    expect(getUserStaff).not.toHaveBeenCalled();
  });

  it("dấu GIẢ gửi từ trình duyệt tới /api/admin/* bị xoá, không đi tiếp xuống route", async () => {
    const res = await middleware(
      new NextRequest("http://localhost/api/admin/galleries", {
        headers: { cookie: COOKIE, [HEADER_NGUOI_DUNG]: `${UID}.9999999999.gia.gia` },
      }),
    );
    expect(res.headers.get(DAU_RA)).toBeNull();
    // Và nếu Next chuyển nguyên bộ header gốc thì cũng không còn dấu giả.
    const ghiDe = res.headers.get("x-middleware-override-headers") ?? "";
    expect(ghiDe.split(",").map((s) => s.trim())).not.toContain(HEADER_NGUOI_DUNG);
  });

  it("requireStaff gặp dấu giả/thiếu → quay về hỏi getUser như cũ", async () => {
    headersGia = new Headers({ cookie: COOKIE, [HEADER_NGUOI_DUNG]: `${UID}.9999999999.gia.gia` });
    await requireStaff();
    expect(getUserStaff).toHaveBeenCalledTimes(1);

    getUserStaff.mockClear();
    // Dấu thật nhưng của COOKIE khác.
    headersGia = new Headers({ cookie: "sb-x-auth-token=cua-nguoi-khac", [HEADER_NGUOI_DUNG]: (await kyNguoiDung(UID, COOKIE))! });
    await requireStaff();
    expect(getUserStaff).toHaveBeenCalledTimes(1);
  });
});
