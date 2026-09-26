import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-230 E3 ${runId}`;
const email = `test_e3_${runId}@demo.babybean.vn`;
const password = "Password123!";

const CHO_ANH = 30_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const ANH = Array.from({ length: 4 }, (_, i) => ({
  ten: `E3_${String(i + 1).padStart(4, "0")}.jpg`,
  idx: i + 1,
}));

test.describe("E-3: Ghi chú", () => {
  let client: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  const suKienAdmin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    // Dọn rác
    await client.query(`delete from galleries where title like 'Fixture BB-230%' and created_at < now() - interval '6 hours'`);

    // Nhân viên
    const { data, error } = await suKienAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`,
      [userId, `${NHAN} NV`, email]
    );

    // Khách
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`]
    );
    customerId = kh[0].id;

    // Bộ ảnh
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',$5,5,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-e3-${runId}`, ANH.length]
    );
    galleryId = g[0].id;

    // Ảnh
    for (const a of ANH) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `e3-${runId}-${a.ten}`, a.ten, a.idx]
      );
    }

    // Link
    maLink = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)]
    );
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (userId) await client.query("delete from staff_profiles where id = $1", [userId]);
      await client.end();
    }
    if (userId) await suKienAdmin().auth.admin.deleteUser(userId);
  });

  test("ba mẹ ghi chú 3 tấm và ghi chú chung, xuất CSV có đủ", async ({ page }) => {
    await page.goto(`/g/${maLink}`);

    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    // Chọn ảnh và thêm ghi chú trong màn xem lớn
    const oAnh = page.getByTestId("the-anh");
    for (let i = 0; i < 3; i++) {
      // Nhấp vào ảnh để mở màn xem lớn (tránh nút thả tim)
      await oAnh.nth(i).click();
      
      // Chọn ảnh nếu chưa chọn
      const nutChonLan = page.getByRole("dialog").getByRole("button", { name: "Chọn ảnh này" });
      if (await nutChonLan.isVisible()) {
          await nutChonLan.click();
      }

      // Điền vào textarea (trên màn hình máy tính, textarea nằm ở cột bên phải)
      await page.fill("#ghi-chu-anh-ben-phai", `Ghi chú ảnh ${i + 1}`);
      
      // Kích hoạt lưu bằng cách blur
      await page.keyboard.press("Tab");

      // Chờ thông báo đã lưu
      await expect(page.locator("text=Đã lưu ghi chú")).toBeVisible({ timeout: 5000 });

      // Đóng màn xem lớn để lặp ảnh tiếp theo
      await page.getByRole("button", { name: "Đóng" }).click();
    }

    const dem = page.getByTestId("dem-da-chon");
    await expect(dem).toHaveText("3", { timeout: 10_000 });

    // Chốt danh sách
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();

    await page.fill("#confirm-name-input", "Mẹ Bean");
    await page.getByRole("checkbox").check();
    await page.fill("#customer-note-input", "Làm màu vintage giúp em nhé");
    await page.getByRole("button", { name: "Xác nhận" }).click();

    await expect
      .poll(
        async () => {
          const { rows } = await client.query("select status::text s from galleries where id=$1", [
            galleryId,
          ]);
          return rows[0]?.s;
        },
        { timeout: 20_000 }
      )
      .toBe("submitted");

    // Nhân viên đăng nhập
    await page.goto("/login");
    await page.waitForURL("**/login**");
    await page.getByLabel("Tên tài khoản hoặc email").fill(email);
    await page.getByLabel("Mật khẩu").fill(password);
    await page.getByRole("button", { name: /Đăng nhập/i }).click();
    await page.waitForURL("**/admin**");

    // Lấy CSV
    const resCsv = await page.request.get(`/api/admin/galleries/${galleryId}/export?format=csv`);
    expect(resCsv.status()).toBe(200);
    const csv = await resCsv.text();

    expect(csv).toContain("Ghi chú ảnh 1");
    expect(csv).toContain("Ghi chú ảnh 2");
    expect(csv).toContain("Ghi chú ảnh 3");
    expect(csv).toContain("Làm màu vintage giúp em nhé");
  });
});
