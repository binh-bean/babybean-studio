/**
 * BB-185 — nút Đăng xuất, kiểm từ đầu tới cuối trong trình duyệt thật.
 *
 * Phép thử đơn vị đã khoá phần máy chủ (xem `tests/unit/bb-185-dang-xuat.test.ts`).
 * Ca này khoá phần người dùng thật sự chạm vào: nút có ở đó không, bấm xong có
 * ra khỏi khu quản trị không, và **quay lại có bị chặn không**.
 *
 * Chặng cuối mới là chặng quan trọng. Xoá cookie mà vẫn vào lại được
 * /admin/galleries thì nút này chỉ là trang trí — mà đó đúng là cảnh máy quầy:
 * người sau ngồi vào và bấm Lùi.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const email = `test_logout_${runId}@demo.babybean.vn`;
const password = "Password123!";
const hoTen = `Test Logout ${runId}`;
let userId = "";

function adminAuth() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe("BB-185: Đăng xuất khỏi máy chung", () => {
  let pgClient: Client;

  test.beforeAll(async () => {
    const { data, error } = await adminAuth().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;

    pgClient = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pgClient.connect();
    await pgClient.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`,
      [userId, hoTen, email],
    );
  });

  test.afterAll(async () => {
    if (userId) await adminAuth().auth.admin.deleteUser(userId);
    if (pgClient) {
      await pgClient.query(`delete from staff_profiles where id = $1`, [userId]);
      await pgClient.end();
    }
  });

  test("hiện tên người đang đăng nhập, thoát được, và quay lại thì bị chặn", async ({ page }) => {
    await dangNhapNhanVien(page, email, password);

    await page.goto("/admin/galleries");

    // 1. Máy quầy phải nói rõ ĐANG LÀ AI. Đây là nửa quan trọng mà một cái nút
    //    trơn không giải quyết được.
    await expect(page.getByText(hoTen)).toBeVisible();

    // 2. Nút có thật và bấm được.
    const nut = page.getByRole("button", { name: /Đăng xuất/i });
    await expect(nut).toBeVisible();
    await nut.click();

    // 3. Ra khỏi khu quản trị.
    await page.waitForURL("**/login**");

    // 4. Chốt cuối: quay lại thì bị đá về /login, không vào được bằng phiên cũ.
    await page.goto("/admin/galleries");
    await page.waitForURL("**/login**");
    expect(page.url()).toContain("/login");
  });
});
