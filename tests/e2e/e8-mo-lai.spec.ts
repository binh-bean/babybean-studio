import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-231 E8 ${runId}`;
const CHO_ANH = 30_000;
const email = `test_bb231_e8_${runId}@demo.babybean.vn`;
const password = "Password123!";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("E-8: Mở lại cho khách chọn tiếp", () => {
  let client: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryA = "";
  let maLinkA = "";
  let galleryB = "";
  let maLinkB = "";

  const suKienAdmin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    // Dọn rác
    await client.query(`delete from galleries where title like 'Fixture BB-231%' and created_at < now() - interval '1 hour'`);
    await client.query(`delete from customers where full_name like 'Fixture BB-231%' and created_at < now() - interval '1 hour'`);

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    // Nhân viên thử vai cs
    const { data, error } = await suKienAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;

    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`,
      [userId, `${NHAN} NV`, email]
    );
    await client.query(
      `insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`,
      [userId, branchId]
    );

    // Khách
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`]
    );
    customerId = kh[0].id;

    // Bộ A: ready, 3 ảnh
    const { rows: gA } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/xA',3,5,50000,false) returning id`,
      [branchId, customerId, `${NHAN} Bộ A`, `fixture-e8a-${runId}`]
    );
    galleryA = gA[0].id;

    for (let i = 1; i <= 3; i++) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryA, `e8a-${runId}-${i}`, `E8A_000${i}.jpg`, i]
      );
    }
    maLinkA = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryA, sha256(maLinkA), maLinkA.slice(0, 6)]
    );

    // Bộ B: expired, due_at quá hạn
    const { rows: gB } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled, due_at)
       values ($1,$2,$3,'expired',$4,'https://example.com/xB',3,5,50000,false, now() - interval '2 days') returning id`,
      [branchId, customerId, `${NHAN} Bộ B`, `fixture-e8b-${runId}`]
    );
    galleryB = gB[0].id;

    for (let i = 1; i <= 3; i++) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryB, `e8b-${runId}-${i}`, `E8B_000${i}.jpg`, i]
      );
    }
    maLinkB = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryB, sha256(maLinkB), maLinkB.slice(0, 6)]
    );
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryA) await client.query("delete from activity_logs where entity_id = $1", [galleryA]);
      if (galleryB) await client.query("delete from activity_logs where entity_id = $1", [galleryB]);
      
      // selections trước galleries
      if (galleryA) await client.query("delete from selections where gallery_id = $1", [galleryA]);
      if (galleryB) await client.query("delete from selections where gallery_id = $1", [galleryB]);

      if (galleryA) await client.query("delete from galleries where id = $1", [galleryA]);
      if (galleryB) await client.query("delete from galleries where id = $1", [galleryB]);

      if (customerId) await client.query("delete from customers where id = $1", [customerId]);

      // staff_branches trước staff_profiles
      if (userId) await client.query("delete from staff_branches where staff_id = $1", [userId]);
      if (userId) await client.query("delete from staff_profiles where id = $1", [userId]);
      
      await client.end();
    }
    if (userId) await suKienAdmin().auth.admin.deleteUser(userId);
  });

  test("CSKH mở lại bộ ảnh đã chốt và quá hạn", async ({ page, context }) => {
    // 1. Khách mở link A, chọn 2 ảnh và chốt
    await page.goto(`/g/${maLinkA}`);
    const anhDauA = page.locator('img[src*="/api/img/"]').first();
    await anhDauA.waitFor({ state: "visible", timeout: CHO_ANH });

    // Chọn 2 tấm đầu
    const nutChonA = page.locator('button[aria-label="Chọn ảnh này"]');
    await nutChonA.nth(0).click();
    await nutChonA.nth(1).click();
    const dem = page.getByTestId("dem-da-chon");
    await expect(dem).toHaveText("2", { timeout: 10_000 });

    // Chốt
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await page.fill("#confirm-name-input", "Mẹ Bean A");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Xác nhận" }).click();

    await expect
      .poll(async () => {
        const { rows } = await client.query("select status::text s from galleries where id=$1", [galleryA]);
        return rows[0]?.s;
      }, { timeout: 20_000 })
      .toBe("submitted");

    // 2. NV CSKH đăng nhập
    const nvPage = await context.newPage();
    await nvPage.goto("/login");
    await nvPage.waitForURL("**/login**");
    await nvPage.getByLabel("Tên tài khoản hoặc email").fill(email);
    await nvPage.getByLabel("Mật khẩu").fill(password);
    await nvPage.getByRole("button", { name: /Đăng nhập/i }).click();
    await nvPage.waitForURL("**/admin**");

    // Mở bộ ảnh A
    await nvPage.goto(`/admin/galleries/${galleryA}`);
    
    // Nút mở lại cho khách chọn bị khoá khi chưa có lý do
    const xacNhanMoLai = nvPage.getByRole('button', { name: /^Mở lại cho khách chọn$/i, exact: true });
    await expect(xacNhanMoLai).toBeDisabled();

    // Gõ lý do
    await nvPage.getByLabel(/Lý do/i).fill("Fixture BB-231 khách xin đổi 1 tấm");
    await expect(xacNhanMoLai).toBeEnabled();
    await xacNhanMoLai.click();

    // Kiểm tra trạng thái DB
    await expect.poll(async () => {
      const { rows } = await client.query("select status::text, reopen_reason, reopened_at from galleries where id=$1", [galleryA]);
      return rows[0];
    }, { timeout: 10_000 }).toMatchObject({
      status: "in_review",
      reopen_reason: "Fixture BB-231 khách xin đổi 1 tấm",
    });

    // Nhật ký
    const { rows: logs } = await client.query("select * from activity_logs where entity_id=$1 and action='gallery.reopen'", [galleryA]);
    expect(logs.length).toBeGreaterThan(0);

    // 3. Khách mở link A lại
    await page.goto(`/g/${maLinkA}`);
    await anhDauA.waitFor({ state: "visible", timeout: CHO_ANH });
    
    // Tấm 2 bỏ chọn (nó đang được chọn nên aria-label là "Bỏ chọn")
    // Dùng getByTestId the-anh cho chắc.
    const cacTheAnh = page.getByTestId("the-anh");
    await cacTheAnh.nth(1).getByRole("button").click(); // Tấm 2
    
    // Tấm 3 chọn
    await cacTheAnh.nth(2).getByRole("button").click(); // Tấm 3
    
    await expect(dem).toHaveText("2", { timeout: 10_000 });
    
    // Chốt lại
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    
    const tenInput = page.locator("#confirm-name-input");
    if (await tenInput.isVisible()) {
      await tenInput.fill("Mẹ Bean A sửa");
      await page.getByRole("checkbox").check();
    }
    await page.getByRole("button", { name: "Xác nhận" }).click();
    
    await expect
      .poll(async () => {
        const { rows } = await client.query("select status::text s from galleries where id=$1", [galleryA]);
        return rows[0]?.s;
      }, { timeout: 20_000 })
      .toBe("submitted");

    // 4. Lặp lại cho bộ B (expired)
    await nvPage.goto(`/admin/galleries/${galleryB}`);
    
    await nvPage.getByLabel(/Lý do/i).fill("Fixture BB-231 gia hạn");
    const xacNhanMoLaiB = nvPage.getByRole('button', { name: /^Mở lại cho khách chọn$/i, exact: true });
    await expect(xacNhanMoLaiB).toBeEnabled();
    await xacNhanMoLaiB.click();

    // Check due_at DỜI ra sau hiện tại
    await expect.poll(async () => {
      const { rows } = await client.query("select status::text, due_at from galleries where id=$1", [galleryB]);
      const dueAt = new Date(rows[0].due_at);
      return dueAt.getTime() > Date.now() ? "future" : "past";
    }, { timeout: 10_000 }).toBe("future");
  });
});
