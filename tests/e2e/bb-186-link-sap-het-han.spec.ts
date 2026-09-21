/**
 * BB-186 — bảng "Link sắp hết hạn", kiểm trong trình duyệt thật.
 *
 * Phép thử đơn vị đã khoá đường API (lọc chi nhánh, không rò mã link, tính
 * đúng số ngày còn lại). Ca này khoá phần CSKH thật sự nhìn: mở menu bên trái
 * có mục đó không, bấm vào có ra bảng không, và nhà sắp mất link có hiện lên
 * không.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const email = `test_bb186_${runId}@demo.babybean.vn`;
const password = "Password123!";
const tenKhach = `Fixture BB186 ${runId}`;
let userId = "";
let customerId = "";
let galleryId = "";

const bam = (s: string) => createHash("sha256").update(s).digest("hex");

function adminAuth() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe("BB-186: bảng link sắp hết hạn", () => {
  let pg: Client;

  test.beforeAll(async () => {
    const { data, error } = await adminAuth().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;

    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`,
      [userId, `Test BB186 ${runId}`, email],
    );

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    const { rows: cu } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,'0900000186') returning id`,
      [br[0].id, tenKhach],
    );
    customerId = cu[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',3) returning id`,
      [br[0].id, customerId, `Fixture BB186 bo anh ${runId}`, `fx-bb186-e2e-${Date.now()}`],
    );
    galleryId = g[0].id;

    // Link chết trong 3 ngày — đúng nhà CSKH phải gọi tuần này.
    const ma = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status, expires_at)
       values ($1,$2,$3,'owner','Fixture BB-186','active', now() + interval '3 days')`,
      [galleryId, bam(ma), ma.slice(0, 6)],
    );
  });

  test.afterAll(async () => {
    if (galleryId) {
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    if (userId) {
      await adminAuth().auth.admin.deleteUser(userId);
      await pg.query("delete from staff_profiles where id = $1", [userId]);
    }
    await pg.end();
  });

  test("có mục trong menu, mở ra thấy nhà sắp mất link", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="text"], input:not([type="password"])', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/admin**");

    await page.goto("/admin/galleries");

    // 1. CSKH phải TÌM ĐƯỢC bảng này mà không cần ai chỉ đường.
    const mucMenu = page.getByRole("link", { name: "Link sắp hết hạn" }).first();
    await expect(mucMenu).toBeVisible();
    await mucMenu.click();
    await page.waitForURL("**/admin/reports/link-sap-het-han");

    // 2. Nhà sắp mất link phải hiện lên, kèm số ngày còn lại.
    await expect(page.getByRole("link", { name: tenKhach })).toBeVisible();
    await expect(page.getByText(/còn 3 ngày/)).toBeVisible();

    // 3. Bấm tên khách đi thẳng sang màn chi tiết — nơi có nút Mở khoá link cũ.
    await page.getByRole("link", { name: tenKhach }).click();
    await page.waitForURL(`**/admin/galleries/**`);
  });
});
