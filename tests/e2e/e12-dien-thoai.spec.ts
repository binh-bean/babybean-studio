import { test, expect } from "./helpers/ip-rieng-moi-ca";
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
      // selections phải đi trước galleries — thiếu dòng này là bộ ảnh thử ở lại
      // trong cơ sở dữ liệu thật mỗi lần phép thử đã chốt được.
      if (galleryId) await client.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      await client.end();
    }
  });

  test("Thao tác cảm ứng vuốt xem lớn, thả tim, chốt", async ({ page }) => {
    await page.goto(`/g/${maLink}`);

    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    // Thả tim ảnh 1 từ lưới — CHẠM, không bấm chuột.
    const nutChon = page.locator('button[aria-label="Chọn ảnh này"]');
    await nutChon.nth(0).tap();

    // Mở màn xem lớn ảnh 1
    const oAnh = page.getByTestId("the-anh");
    await oAnh.nth(0).tap();

    const xemLon = page.getByRole("dialog").first();
    await expect(xemLon.getByText(/1 \/ 2/)).toBeVisible();

    // Vuốt ngón tay từ phải sang trái: phát TouchEvent thật (touchstart →
    // nhiều touchmove → touchend) lên vùng ảnh, đúng những gì React của màn
    // xem lớn nghe. Đề bài E-12 là "vuốt sang tấm sau" — phím mũi tên thì
    // chẳng canh gì cho điện thoại. (Không dùng CDP Input.dispatchTouchEvent:
    // sau đó Chrome giả lập nuốt mọi lượt chạm kế tiếp, kể cả nút tim.)
    await xemLon.locator("main").evaluate((vung) => {
      const y = 400;
      const cham = (x: number) =>
        new Touch({ identifier: 1, target: vung, clientX: x, clientY: y, pageX: x, pageY: y });
      const phat = (loai: string, x: number, dangCham: boolean) =>
        vung.dispatchEvent(
          new TouchEvent(loai, {
            bubbles: true,
            cancelable: true,
            touches: dangCham ? [cham(x)] : [],
            targetTouches: dangCham ? [cham(x)] : [],
            changedTouches: [cham(x)],
          }),
        );
      phat("touchstart", 320, true);
      for (let x = 290; x >= 50; x -= 30) phat("touchmove", x, true);
      phat("touchend", 50, false);
    });
    await expect(xemLon.getByText(/2 \/ 2/)).toBeVisible();

    // Thả tim ảnh 2 ngay trong màn xem lớn
    await xemLon.getByRole("button", { name: "Chọn ảnh này" }).tap();

    const dem = page.getByTestId("dem-da-chon");
    await expect(dem).toHaveText("2", { timeout: 10000 });

    // Đóng để chốt
    await xemLon.getByRole("button", { name: "Đóng" }).first().tap();

    // Chốt
    await page.getByRole("button", { name: "Chốt danh sách" }).first().tap();
    await page.fill("#confirm-name-input", "Mẹ Bean");
    await page.getByRole("checkbox").tap();
    await page.getByRole("button", { name: "Xác nhận" }).tap();

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
