import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const email = `test_admin_${runId}@demo.babybean.vn`;
const password = "Password123!";
let userId: string;

test.describe("BB-141: Màn quản lý admin", () => {
  let pgClient: Client;

  test.beforeAll(async () => {
    // 1. Dùng Service Role Key tạo user auth
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminAuthClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await adminAuthClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;

    // 2. Chèn vào staff_profiles (quyền owner)
    pgClient = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pgClient.connect();
    await pgClient.query(
      `INSERT INTO staff_profiles (id, full_name, email, role) VALUES ($1, $2, $3, 'owner')`,
      [userId, `Test Admin ${runId}`, email]
    );
  });

  test.afterAll(async () => {
    if (userId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const adminAuthClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await adminAuthClient.auth.admin.deleteUser(userId);
    }
    if (pgClient) {
      await pgClient.query(`DELETE FROM staff_profiles WHERE id = $1`, [userId]);
      await pgClient.end();
    }
  });

  test("Màn danh sách album phải tải được, không xoay mãi", async ({ page }) => {
    await dangNhapNhanVien(page, email, password);

    // Vào /admin/galleries
    await page.goto("/admin/galleries");

    // 3. Chờ bảng danh sách album xuất hiện
    // Bảng danh sách hoặc empty state. "Không xoay mãi" tức là spinner phải biến mất và content hiện ra.
    // Lỗi BB-141 là bị xoay mãi.
    
    // Thay vì dựa vào selector cố định, chờ không còn text Loading... hoặc tìm một table/empty state.
    const tableLoc = page.locator('table');
    const emptyLoc1 = page.locator('text="Không có bộ ảnh nào"');
    const emptyLoc2 = page.locator('text="Không tìm thấy"');
    const targetLoc = tableLoc.or(emptyLoc1).or(emptyLoc2).first();
    await expect(targetLoc).toBeVisible({ timeout: 15_000 });
  });
});
