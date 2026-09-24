import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-230 E10 ${runId}`;
const email = `test_e10_${runId}@demo.babybean.vn`;
const password = "Password123!";

test.describe("E-10: Đa chi nhánh", () => {
  let client: Client;
  let userId = "";
  let branchA = "";
  let branchB = "";
  let customerIdA = "";
  let customerIdB = "";
  let galleryA = "";
  let galleryB = "";

  const suKienAdmin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    await client.query(`delete from galleries where title like 'Fixture BB-230%' and created_at < now() - interval '1 hour'`);

    // Lấy 2 chi nhánh
    const { rows: br } = await client.query("select id from branches order by name limit 2");
    if (br.length < 2) throw new Error("Không đủ 2 chi nhánh");
    branchA = br[0].id;
    branchB = br[1].id;

    // Nhân viên thuộc chi nhánh A
    const { data, error } = await suKienAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;

    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cskh')`,
      [userId, `${NHAN} NV`, email]
    );
    await client.query(
      `insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`,
      [userId, branchA]
    );

    // Khách A
    const { rows: khA } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchA, `${NHAN} Khách A`]
    );
    customerIdA = khA[0].id;

    // Khách B
    const { rows: khB } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchB, `${NHAN} Khách B`]
    );
    customerIdB = khB[0].id;

    // Bộ ảnh A
    const { rows: gA } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/xA',1,5,50000,false) returning id`,
      [branchA, customerIdA, `${NHAN} Bộ A`, `fixture-e10a-${runId}`]
    );
    galleryA = gA[0].id;

    // Bộ ảnh B
    const { rows: gB } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/xB',1,5,50000,false) returning id`,
      [branchB, customerIdB, `${NHAN} Bộ B`, `fixture-e10b-${runId}`]
    );
    galleryB = gB[0].id;
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryA) await client.query("delete from galleries where id = $1", [galleryA]);
      if (galleryB) await client.query("delete from galleries where id = $1", [galleryB]);
      if (customerIdA) await client.query("delete from customers where id = $1", [customerIdA]);
      if (customerIdB) await client.query("delete from customers where id = $1", [customerIdB]);
      if (userId) await client.query("delete from staff_profiles where id = $1", [userId]);
      await client.end();
    }
    if (userId) await suKienAdmin().auth.admin.deleteUser(userId);
  });

  test("Nhân viên chi nhánh A không thấy bộ ảnh chi nhánh B", async ({ page }) => {
    await page.goto("/login");
    await page.waitForURL("**/login**");
    await page.getByLabel("Tên tài khoản hoặc email").fill(email);
    await page.getByLabel("Mật khẩu").fill(password);
    await page.getByRole("button", { name: /Đăng nhập/i }).click();
    await page.waitForURL("**/admin**");

    // Đến danh sách bộ ảnh
    await page.goto("/admin/galleries");
    
    // Thấy bộ A
    await expect(page.locator(`text=${NHAN} Bộ A`)).toBeVisible({ timeout: 15000 });
    // Không thấy bộ B
    await expect(page.locator(`text=${NHAN} Bộ B`)).toHaveCount(0);

    // Mở thẳng trang chi tiết bộ B
    const res = await page.goto(`/admin/galleries/${galleryB}`);
    // Sẽ bị chặn (chuyển hướng hoặc báo lỗi Not Found)
    if (res?.status() === 200) {
      await expect(page.locator("text=Không tìm thấy").or(page.locator("text=Bạn không có quyền"))).toBeVisible();
    } else {
      expect(res?.status()).toBeGreaterThanOrEqual(400); // 404 hoặc 403
    }
  });
});
