import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-230 E2 ${runId}`;

const CHO_ANH = 30_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const ANH = Array.from({ length: 7 }, (_, i) => ({
  ten: `E2_${String(i + 1).padStart(4, "0")}.jpg`,
  idx: i + 1,
}));

test.describe("E-2: Vượt hạn mức", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    // Dọn rác nếu có
    await client.query(`delete from galleries where title like 'Fixture BB-230%' and created_at < now() - interval '1 hour'`);
    await client.query(`delete from customers where full_name like 'Fixture BB-230%' and created_at < now() - interval '1 hour'`);

    // Tạo chi nhánh
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    // Khách
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`]
    );
    customerId = kh[0].id;

    // Bộ ảnh hạn mức 5
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',$5,5,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-e2-${runId}`, ANH.length]
    );
    galleryId = g[0].id;

    // Chèn 7 ảnh
    for (const a of ANH) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `e2-${runId}-${a.ten}`, a.ten, a.idx]
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
      await client.end();
    }
  });

  test("ba mẹ chọn 7 tấm, thanh đáy báo phụ phí và lưu đúng vào db", async ({ page }) => {
    await page.goto(`/g/${maLink}`);

    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    // Chọn cả 7 tấm
    const nutChon = page.locator('button[aria-label="Chọn ảnh này"]');
    for (let i = 0; i < 7; i++) {
      await nutChon.first().click();
      // Đợi số lượng Bỏ chọn tăng lên để chắc chắn
      await expect(page.locator('button[aria-label="Bỏ chọn"]')).toHaveCount(i + 1, { timeout: 5000 });
    }

    const dem = page.getByTestId("dem-da-chon");
    await expect(dem).toHaveText("7", { timeout: 10_000 });
    
    // Check quota and payment info
    await expect(page.locator("text=7 / 5").first()).toBeVisible();
    await expect(page.locator("text=Thêm").first()).toBeVisible();

    // Chốt
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();

    await page.fill("#confirm-name-input", "Mẹ Bean");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Xác nhận" }).click();

    // Kiểm tra DB lưu 2 ảnh phụ
    await expect
      .poll(
        async () => {
          const { rows } = await client.query("select snapshot_extra_count from selections where gallery_id=$1", [
            galleryId,
          ]);
          return rows[0]?.snapshot_extra_count;
        },
        { timeout: 20_000, message: "Không lưu đúng số ảnh thêm" }
      )
      .toBe(2);
  });
});
