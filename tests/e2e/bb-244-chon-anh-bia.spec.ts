import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-244 ${runId}`;
const email = `test_bb244_${runId}@demo.babybean.vn`;
const password = "Password123!";

test.describe("BB-244: Chọn ảnh bìa popup full màn hình", () => {
  let client: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  const photos: string[] = [];

  const suKienAdmin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    await client.query(`delete from galleries where title like 'Fixture BB-244%' and created_at < now() - interval '1 hour'`);
    await client.query(`delete from customers where full_name like 'Fixture BB-244%' and created_at < now() - interval '1 hour'`);

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
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`,
      [userId, `${NHAN} NV`, email]
    );
    await client.query(
      `insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`,
      [userId, branchId]
    );

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`]
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',6,5,50000) returning id`,
      [branchId, customerId, `${NHAN} Bìa`, `fixture-244-${runId}`]
    );
    galleryId = g[0].id;

    for (let i = 1; i <= 6; i++) {
      const { rows: p } = await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
        [galleryId, `244-${runId}-${i}`, `244_${i}.jpg`, i]
      );
      photos.push(p[0].id);
    }
  });

  test.afterAll(async () => {
    if (userId) await suKienAdmin().auth.admin.deleteUser(userId);
    await client.query(`delete from galleries where id = $1`, [galleryId]);
    await client.query(`delete from customers where id = $1`, [customerId]);
    await client.end();
  });

  test("CSKH bấm chọn ảnh bìa và xem trước nhảy liền", async ({ page }) => {
    await page.goto("/login");
    await page.waitForURL("**/login**");
    await page.getByLabel("Tên tài khoản hoặc email").fill(email);
    await page.getByLabel("Mật khẩu").fill(password);
    await page.getByRole("button", { name: /Đăng nhập/i }).click();
    await page.waitForURL("**/admin**");

    await page.goto(`/admin/galleries/${galleryId}`);
    await page.waitForURL(`**/admin/galleries/${galleryId}`);
    
    // Khối Bìa bộ ảnh
    const nutDoiBia = page.locator("button:has-text('Đổi ảnh bìa'), button:has-text('Mở trình thiết kế bìa')").first();
    await expect(nutDoiBia).toBeVisible();
    await nutDoiBia.click();

    // Dialog mở ra toàn màn
    const dialog = page.locator("div[role='dialog']");
    await expect(dialog).toBeVisible();
    // Chủ studio: "muốn chọn thì phải kéo xuống dưới, tôi muốn nó hiện nổi lên
    // ngay" — lớp chọn ảnh phải nằm TRONG khung nhìn ngay khi bấm, không cuộn.
    const hop = (await dialog.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(hop.y).toBeGreaterThanOrEqual(0);
    expect(hop.y).toBeLessThan(vp.height / 2);

    // Lưới hiển thị ảnh
    // Bấm ảnh 2
    const anh2 = dialog.locator('button img').nth(1);
    await anh2.click();

    // Khung xem trước cập nhật liền
    const xemTruoc = dialog.locator("div.relative.flex-1").first();
    await expect(xemTruoc).toBeVisible();
    await expect(xemTruoc.locator(`img[src*='${photos[1]}']`)).toBeVisible();

    // Đổi qua ảnh 3
    const anh3 = dialog.locator('button img').nth(2);
    await anh3.click();
    await expect(xemTruoc.locator(`img[src*='${photos[2]}']`)).toBeVisible();

    // Hủy bằng cách bấm X hoặc Esc
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // Huỷ (Esc) thì KHÔNG lưu gì: ảnh bìa trong cơ sở dữ liệu giữ nguyên.
    const { rows: sauHuy } = await client.query("select cover_photo_id from galleries where id = $1", [galleryId]);
    expect(sauHuy[0].cover_photo_id).not.toBe(photos[2]);

    // Mở lại, ảnh nháp không lưu
    await nutDoiBia.click();
    await expect(dialog).toBeVisible();
    // Chọn kiểu chữ "Tạp chí" — phải được lưu cùng ảnh.
    await dialog.getByRole("button", { name: "Tạp chí" }).click();
    await expect(dialog.getByRole("button", { name: "Tạp chí" })).toHaveAttribute("aria-pressed", "true");
    
    // Bấm ảnh 3
    const anh3_lai = dialog.locator('button img').nth(2);
    await anh3_lai.click();

    // Bấm "Lưu bìa"
    const nutLuu = dialog.locator("button", { hasText: "Lưu bìa" });
    await nutLuu.click();
    await expect(dialog).toBeHidden();

    // Chờ lưu
    await expect(page.locator("p", { hasText: /Đã lưu bìa/i })).toBeVisible({ timeout: 5000 });

    // Kiểm db
    const { rows: kq } = await client.query("select cover_photo_id, cover_layout from galleries where id = $1", [galleryId]);
    expect(kq[0].cover_photo_id).toBe(photos[2]);
    expect(kq[0].cover_layout).toBe("tap-chi");
  });
});
