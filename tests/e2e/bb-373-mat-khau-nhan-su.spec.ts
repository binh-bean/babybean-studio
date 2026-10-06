/**
 * BB-373 — màn Nhân sự & vai trò: Admin bấm Sửa một nhân viên thì thấy TÊN ĐĂNG NHẬP
 * (chép được) và ô "Mật khẩu mới" (hiện/ẩn, tối thiểu 8 ký tự) + nút "Đặt mật khẩu".
 *
 * Dữ liệu: nền Fixture (chi nhánh) + hai tài khoản auth Fixture (Admin đăng nhập, nhân
 * viên bị đặt mật khẩu) + một tài khoản CSKH Fixture để thử vai không có quyền.
 * Nhân sự Fixture bị ẩn khỏi màn Nhân sự thật (BB-354), nên phản hồi GET danh sách được
 * thay trong trình duyệt bằng đúng các hàng Fixture — vừa để thấy hàng, vừa để ảnh chụp
 * KHÔNG chứa tên nhân sự thật. Phép ĐẶT MẬT KHẨU thì đi route thật vào tài khoản Fixture.
 *
 * Chạy: PW_PORT=3373 npx playwright test tests/e2e/bb-373-mat-khau-nhan-su.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const ANH = process.env.BB373_ANH ?? "test-results/bb-373";
fs.mkdirSync(ANH, { recursive: true });

test.setTimeout(150_000);

const run = randomBytes(4).toString("hex");
const MAT_KHAU_ADMIN = `Adm-${run}-Pass9`;
const MAT_KHAU_CU = `Cu-${run}-Pass9`;
const MAT_KHAU_MOI = `Moi-${run}-Pass9`;
const email = (k: string) => `fixture.bb373e2e.${k}.${run}@demo.babybean.vn`;

let pg: Client;
let nen: NenFixture;
const ids = { admin: "", dich: "", cs: "" };
const supa = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

async function taoTaiKhoan(k: keyof typeof ids, role: string, matKhau: string, ten: string) {
  const r = await supa().auth.admin.createUser({ email: email(k), password: matKhau, email_confirm: true });
  if (r.error) throw r.error;
  ids[k] = r.data.user.id;
  await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,$4)`, [
    ids[k],
    `Fixture BB-373 ${ten} ${run}`,
    email(k),
    role,
  ]);
  await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [ids[k], nen.branchId]);
}

async function dangNhapDuoc(k: keyof typeof ids, matKhau: string): Promise<boolean> {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email: email(k), password: matKhau });
  return !error && !!data.session;
}

test.beforeAll(async () => {
  pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  nen = await dungNenFixture(pg, "BB373E2E");
  await taoTaiKhoan("admin", "owner", MAT_KHAU_ADMIN, "Admin");
  await taoTaiKhoan("dich", "cs", MAT_KHAU_CU, "Nhân viên thử");
  await taoTaiKhoan("cs", "cs", MAT_KHAU_ADMIN, "CSKH");
});

test.afterAll(async () => {
  try {
    await donNenFixture(pg, { branchIds: [nen?.branchId], staffIds: Object.values(ids) });
  } finally {
    await pg.end();
  }
});

/** Thay danh sách nhân sự bằng đúng hàng Fixture (ẩn tên thật khỏi màn và ảnh chụp). */
async function chanDanhSach(page: Page) {
  await page.route("**/api/admin/staff", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    const body = await res.json();
    const hang = (k: "admin" | "dich", ten: string, role: string) => ({
      id: ids[k],
      fullName: ten,
      identifier: email(k).split("@")[0] + "@demo.babybean.vn",
      usesInternalName: false,
      phone: null,
      role,
      roleId: null,
      roleName: role,
      vaiTuTao: false,
      isActive: true,
      lastLoginAt: null,
      neverLoggedIn: true,
      stale: false,
      branchIds: role === "cs" ? [nen.branchId] : [],
      deleteReason: null,
      canResetPassword: true,
    });
    body.data.staff = [hang("admin", "Fixture Admin Mẫu", "owner"), hang("dich", "Fixture Nhân viên Mẫu", "cs")];
    body.data.branches = [{ id: nen.branchId, name: "Fixture Chi nhánh" }];
    await route.fulfill({ response: res, json: body });
  });
}

test("1. Admin bấm Sửa: thấy tên đăng nhập, gõ mật khẩu mới (hiện/ẩn), Đặt mật khẩu; nhân viên đăng nhập được bằng mật khẩu mới", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await dangNhapNhanVien(page, email("admin"), MAT_KHAU_ADMIN);
  await chanDanhSach(page);
  await page.goto("/admin/staff", { waitUntil: "domcontentloaded" });

  const the = page.getByTestId("the-nhan-su").filter({ hasText: "Fixture Nhân viên Mẫu" });
  await expect(the).toBeVisible({ timeout: 40_000 });
  // Chưa bấm Sửa thì chưa có ô mật khẩu (không còn hộp prompt() của trình duyệt).
  await expect(the.getByTestId("o-mat-khau-moi")).toHaveCount(0);
  await the.getByRole("button", { name: "Sửa", exact: true }).click();

  const khoi = the.getByTestId("o-mat-khau-moi");
  await expect(khoi).toBeVisible();
  await expect(khoi.getByTestId("ten-dang-nhap")).toHaveText(`${email("dich").split("@")[0]}@demo.babybean.vn`);
  await expect(khoi.getByRole("button", { name: "Chép" })).toBeVisible();
  await expect(khoi).toContainText("Mật khẩu cũ không xem lại được");
  await expect(khoi).toContainText("Ít nhất 8 ký tự");

  const o = khoi.getByLabel("Mật khẩu mới");
  await expect(o).toHaveAttribute("type", "password");
  const nutDat = khoi.getByRole("button", { name: "Đặt mật khẩu" });
  await expect(nutDat).toBeDisabled(); // ô trống

  // Ngắn hơn 8 ký tự: báo lỗi, KHÔNG gọi máy chủ.
  await o.fill("Ab1-xyz");
  await nutDat.click();
  await expect(khoi.getByRole("alert")).toContainText("từ 8 ký tự trở lên");
  expect(await dangNhapDuoc("dich", MAT_KHAU_CU)).toBe(true);

  await o.fill(MAT_KHAU_MOI);
  await expect(khoi.getByRole("alert")).toHaveCount(0); // gõ lại thì báo lỗi cũ biến mất
  await khoi.getByRole("button", { name: "Hiện" }).click();
  await expect(o).toHaveAttribute("type", "text");
  await expect(o).toHaveValue(MAT_KHAU_MOI);
  await khoi.screenshot({ path: path.join(ANH, "nhan-su-o-mat-khau-moi.png") });
  await the.scrollIntoViewIfNeeded();
  await the.screenshot({ path: path.join(ANH, "nhan-su-the-dang-sua.png") });

  const [phanHoi] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/admin/staff/${ids.dich}/mat-khau`) && r.request().method() === "POST"),
    nutDat.click(),
  ]);
  expect(phanHoi.status()).toBe(200);
  await expect(page.getByRole("status").filter({ hasText: "Đã đặt mật khẩu mới" })).toBeVisible();
  // Ô được xoá sạch sau khi đặt — mật khẩu không nằm lại trên màn hình.
  await expect(o).toHaveValue("");

  expect(await dangNhapDuoc("dich", MAT_KHAU_MOI)).toBe(true);
  expect(await dangNhapDuoc("dich", MAT_KHAU_CU)).toBe(false);

  const { rows } = await pg.query(
    `select actor_id, metadata, to_jsonb(activity_logs)::text as ca from activity_logs
      where action = 'staff.update' and entity_id = $1`,
    [ids.dich],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].actor_id).toBe(ids.admin);
  expect(rows[0].metadata.passwordReset).toBe(true);
  expect(rows[0].ca).not.toContain(MAT_KHAU_MOI);
});

test("2. Vai CSKH không thấy màn Nhân sự, và gọi thẳng API đặt mật khẩu thì 403 (mật khẩu không đổi)", async ({ page }) => {
  await dangNhapNhanVien(page, email("cs"), MAT_KHAU_ADMIN);
  await page.goto("/admin/staff", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Chỉ Admin mới xem được mục này.")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("o-mat-khau-moi")).toHaveCount(0);

  const r = await page.request.post(`/api/admin/staff/${ids.dich}/mat-khau`, { data: { password: "KhongDuocDoi-12345" } });
  expect(r.status()).toBe(403);
  expect(await dangNhapDuoc("dich", "KhongDuocDoi-12345")).toBe(false);
});
