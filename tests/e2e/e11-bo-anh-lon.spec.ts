import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-231 E11 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test.use({
  viewport: { width: 1280, height: 720 },
});

test.describe("E-11: Kịch bản ảnh lớn 1.000 ảnh", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    await client.query(`delete from galleries where title like 'Fixture BB-231%' and created_at < now() - interval '6 hours'`);
    await client.query(`delete from customers where full_name like 'Fixture BB-231%' and created_at < now() - interval '6 hours'`);

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
       values ($1,$2,$3,'ready',$4,'https://example.com/x',1000,5,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-e11-${runId}`]
    );
    galleryId = g[0].id;

    // Chèn 1000 ảnh
    await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       select $1, 'e11-' || $2 || '-' || x, 'BB231_' || lpad(x::text, 4, '0') || '.jpg', 'image/jpeg', x, 'active'
       from generate_series(1, 1000) as x`,
      [galleryId, runId]
    );

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

  test("Kiểm tra cuộn, bộ nhớ và lưới ảo", async ({ page }) => {
    let err = "";
    page.on("pageerror", (e) => {
      err += e.message + "\n";
    });

    await page.goto(`/g/${maLink}`);
    const theAnh = page.getByTestId("the-anh");
    await theAnh.first().waitFor({ state: "visible", timeout: 30000 });

    // Đo DOM đầu trang
    let count = await theAnh.count();
    expect(count).toBeLessThan(200);

    // Đo bộ nhớ ban đầu
    const memBanDau = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);

    // Cuộn tới cuối
    let timThayCuoi = false;
    for (let i = 0; i < 200; i++) {
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(50);
      
      // Đo DOM giữa chừng
      if (i % 20 === 0) {
        count = await theAnh.count();
        expect(count).toBeLessThan(200);
      }

      // Check for last photo
      const cuoi = theAnh.filter({ hasText: "BB231_1000.jpg" });
      if (await cuoi.count() > 0 && await cuoi.isVisible()) {
        timThayCuoi = true;
        break;
      }
    }
    
    expect(timThayCuoi).toBeTruthy();
    
    // Đo DOM cuối trang
    count = await theAnh.count();
    expect(count).toBeLessThan(200);

    // Cuộn lên cuộn xuống 3 lượt
    for (let l = 0; l < 3; l++) {
      // cuộn lên
      for (let i = 0; i < 10; i++) {
        await page.mouse.wheel(0, -4000);
        await page.waitForTimeout(20);
      }
      // cuộn xuống
      for (let i = 0; i < 10; i++) {
        await page.mouse.wheel(0, 4000);
        await page.waitForTimeout(20);
      }
    }

    // Đo bộ nhớ lúc sau
    const memLucSau = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
    
    if (memBanDau > 0) {
      // Không tăng quá 2 lần so với lúc tải xong
      expect(memLucSau).toBeLessThan(memBanDau * 2);
    }

    // Mở màn xem lớn ở tấm cuối
    const cuoi = theAnh.filter({ hasText: "BB231_1000.jpg" });
    await cuoi.click();
    
    const xemLon = page.getByRole("dialog").first();
    await expect(xemLon.getByText(/1000 \/ 1000/)).toBeVisible();

    // Phím sang trái 5 tấm
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(200);
    }
    
    await expect(xemLon.getByText(/995 \/ 1000/)).toBeVisible();

    // Không có lỗi trang
    expect(err).toBe("");
  });
});
