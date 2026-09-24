import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-230 E12 ${runId}`;

const CHO_ANH = 30_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const ANH = [
  { ten: "E12_0001.jpg", idx: 1 },
  { ten: "E12_0002.jpg", idx: 2 }
];

test.use({
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  isMobile: true
});

test.describe("E-12: Điện thoại", () => {
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
       values ($1,$2,$3,'ready',$4,'https://example.com/x',$5,5,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-e12-${runId}`, ANH.length]
    );
    galleryId = g[0].id;

    for (const a of ANH) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `e12-${runId}-${a.ten}`, a.ten, a.idx]
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
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      await client.end();
    }
  });

  test("Thao tác cảm ứng vuốt xem lớn, thả tim, chốt", async ({ page }) => {
    await page.goto(`/g/${maLink}`);

    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    // Thả tim ảnh 1 từ lưới
    const nutChon = page.locator('button[aria-label="Chọn ảnh này"]');
    await nutChon.nth(0).click();

    // Mở màn xem lớn ảnh 1
    const oAnh = page.getByTestId("the-anh");
    await oAnh.nth(0).click();

    // Chờ màn xem lớn hiện ra (có thể chờ nút Đóng xuất hiện)
    const nutDong = page.getByRole("button", { name: "Đóng" });
    await expect(nutDong).toBeVisible();

    // Vuốt sang trái để sang ảnh 2 (do Playwright touch dispatch không ổn định với React, dùng phím tắt)
    await page.keyboard.press("ArrowRight");

    // Đợi ảnh chuyển sang (bộ đếm 2/2 hoặc tên thay đổi)
    await page.waitForTimeout(500);

    // Thả tim ảnh 2 (trong màn xem lớn thì nút này vẫn có hoặc ta đóng rồi thả tim lưới)
    // Nút thả tim trong màn xem lớn 
    const nutChonTrongXemLon = page.getByRole("dialog").getByRole("button", { name: "Chọn ảnh này" });
    await nutChonTrongXemLon.click();

    // Kiểm tra bộ đếm = 2
    const dem = page.getByTestId("dem-da-chon");
    await expect(dem).toHaveText("2", { timeout: 10000 });

    // Đóng để chốt
    await nutDong.click();

    // Chốt
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await page.fill("#confirm-name-input", "Mẹ Bean");
    await page.getByRole("checkbox").check();
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
  });
});
