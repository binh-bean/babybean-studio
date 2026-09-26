/**
 * BB-260 — Trung tâm báo cáo điều hành.
 *
 * Nhân viên vai `branch_manager` tạo thẳng qua SQL (Fixture BB-260, xoá sạch ở
 * `afterAll`) — không đăng nhập tài khoản thật (AGENTS.md §6 và brief BB-260).
 *
 * Chạy: `PW_PORT=3167 npx playwright test tests/e2e/bb-260-bao-cao.spec.ts`.
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-260 ${runId}`;
const email = `test_bb260_${runId}@demo.babybean.vn`;
const password = "Password123!";

test.describe("BB-260: Trung tâm báo cáo điều hành", () => {
  let client: Client;
  let userId = "";
  let branchId = "";

  const suKienAdmin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { data, error } = await suKienAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;

    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'branch_manager')`,
      [userId, `${NHAN} NV`, email],
    );
    await client.query(
      `insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`,
      [userId, branchId],
    );
  });

  test.afterAll(async () => {
    if (client) {
      if (userId) await client.query("delete from staff_branches where staff_id = $1", [userId]);
      if (userId) await client.query("delete from staff_profiles where id = $1", [userId]);
      await client.end();
    }
    if (userId) await suKienAdmin().auth.admin.deleteUser(userId);
  });

  test("mở /admin/bao-cao, chọn báo cáo, đổi kỳ đổi URL, xuất CSV tải được", async ({ page }) => {
    await dangNhapNhanVien(page, email, password);

    await page.goto("/admin/bao-cao");

    // 1. Danh sách báo cáo hiện ra, có "Tiến độ chọn ảnh".
    const mucTienDo = page.getByRole("button", { name: "Tiến độ chọn ảnh" });
    await expect(mucTienDo).toBeVisible({ timeout: 15_000 });

    await mucTienDo.click();
    await page.waitForURL(/ma=tien-do-chon-anh/);

    // 2. Chọn xong thấy tiêu đề, ít nhất một thẻ số, và một bảng.
    await expect(page.getByRole("heading", { name: "Tiến độ chọn ảnh" })).toBeVisible();
    await expect(page.getByText("Đã gửi link").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("table")).toBeVisible();

    // 3. Đổi kỳ sang "30 ngày qua" -> URL đổi theo (tu/den đổi giá trị).
    const urlTruoc = page.url();
    await page.getByLabel("Kỳ", { exact: true }).selectOption("30-ngay");
    await expect(async () => {
      expect(page.url()).not.toBe(urlTruoc);
    }).toPass({ timeout: 5_000 });
    expect(page.url()).toContain("kyPreset=30-ngay");

    // 4. Xuất CSV: bấm nút, chờ tệp tải xuống thật (không phải link chết).
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: /Xuất CSV/i }).click(),
    ]);
    expect(download.suggestedFilename()).toContain("tien-do-chon-anh");
  });

  test("nhân viên không có quyền reports:operations không thấy mục Báo cáo trong menu", async ({
    page,
  }) => {
    const emailCtv = `test_bb260_ctv_${runId}@demo.babybean.vn`;
    const { data, error } = await suKienAdmin().auth.admin.createUser({
      email: emailCtv,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    const ctvId = data.user!.id;

    try {
      await client.query(
        `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'photoshop_ctv')`,
        [ctvId, `${NHAN} CTV`, emailCtv],
      );
      await client.query(
        `insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`,
        [ctvId, branchId],
      );

      await dangNhapNhanVien(page, emailCtv, password);

      await expect(page.getByRole("link", { name: "Báo cáo" })).toHaveCount(0);
    } finally {
      await client.query("delete from staff_branches where staff_id = $1", [ctvId]);
      await client.query("delete from staff_profiles where id = $1", [ctvId]);
      await suKienAdmin().auth.admin.deleteUser(ctvId);
    }
  });
});
