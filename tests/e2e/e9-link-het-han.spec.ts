import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-230 E9 ${runId}`;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("E-9: Link hết hạn", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let linkRevoked = "";
  let linkExpired = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    await client.query(`delete from galleries where title like 'Fixture BB-230%' and created_at < now() - interval '1 hour'`);

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`]
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',1,5,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-e9-${runId}`]
    );
    galleryId = g[0].id;

    // Ảnh
    await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'E9.jpg','image/jpeg',1,'active')`,
      [galleryId, `e9-${runId}-1`]
    );

    // Link revoked
    linkRevoked = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','revoked')`,
      [galleryId, sha256(linkRevoked), linkRevoked.slice(0, 6)]
    );

    // Link expired
    linkExpired = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status, expires_at)
       values ($1,$2,$3,'owner','active', now() - interval '1 day')`,
      [galleryId, sha256(linkExpired), linkExpired.slice(0, 6)]
    );
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      await client.end();
    }
  });

  test("Link revoked báo thân thiện, không có ảnh", async ({ page }) => {
    await page.goto(`/g/${linkRevoked}`);

    // Chờ màn hình lỗi
    await expect(page.locator("text=hết hạn").or(page.locator("text=Không tìm thấy").first())).toBeVisible({ timeout: 10000 });
    
    // Không hiện ảnh
    const anh = page.locator('img[src*="/api/img/"]');
    await expect(anh).toHaveCount(0);
  });

  test("Link expired báo thân thiện, không có ảnh", async ({ page }) => {
    await page.goto(`/g/${linkExpired}`);

    // Chờ màn hình lỗi
    await expect(page.locator("text=hết hạn").or(page.locator("text=Không tìm thấy").first())).toBeVisible({ timeout: 10000 });
    
    // Không hiện ảnh
    const anh = page.locator('img[src*="/api/img/"]');
    await expect(anh).toHaveCount(0);
  });
});
