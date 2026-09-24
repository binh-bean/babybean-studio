import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-230 E7 ${runId}`;

const CHO_ANH = 30_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const ANH = [{ ten: "E7_0001.jpg", idx: 1 }, { ten: "E7_0002.jpg", idx: 2 }];

test.describe("E-7: Bộ đã khoá", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

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
       values ($1,$2,$3,'in_retouch',$4,'https://example.com/x',$5,5,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-e7-${runId}`, ANH.length]
    );
    galleryId = g[0].id;

    for (const a of ANH) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `e7-${runId}-${a.ten}`, a.ten, a.idx]
      );
    }

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
      // selections phải đi trước galleries — thiếu dòng này là bộ ảnh thử ở lại
      // trong cơ sở dữ liệu thật mỗi lần phép thử đã chốt được.
      if (galleryId) await client.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      await client.end();
    }
  });

  test("không cho thả tim, hiển thị trạng thái đang sửa lại", async ({ page }) => {
    await page.goto(`/g/${maLink}`);

    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    // Không có nút thả tim bấm được (hoặc bị disable, hoặc không tồn tại)
    const nutChon = page.locator('button[aria-label="Chọn ảnh này"]');
    const demNut = await nutChon.count();
    
    // Nếu có nút chọn ảnh thì phải bị disable
    if (demNut > 0) {
      for (let i = 0; i < demNut; i++) {
        await expect(nutChon.nth(i)).toBeDisabled();
      }
    }

    // Thanh đáy là "Yêu cầu sửa lại"
    await expect(page.locator("text=Yêu cầu sửa lại")).toBeVisible({ timeout: 5000 });
  });
});
