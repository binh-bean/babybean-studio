import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-225 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("BB-225 Hanh Trinh", () => {
  let pg: Client;
  let customerId = "";
  let galleryRetouch = "";
  let galleryReady = "";
  let maLinkRetouch = "";
  let maLinkReady = "";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    
    await pg.query(`delete from galleries where title like 'Fixture BB-225%' and created_at < now() - interval '1 hour'`);
    await pg.query(`delete from customers where full_name like 'Fixture BB-225%' and created_at < now() - interval '1 hour'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [br[0].id, `${NHAN} Khách`, soGia],
    );
    customerId = kh[0].id;

    // Gallery 1: in_retouch
    const { rows: g1 } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled, lark_trang_thai)
       values ($1,$2,$3,'in_retouch',$4,'https://example.com/x',3,10,50000,false,'optmhzW4sL') returning id`,
      [br[0].id, customerId, `${NHAN} Retouch`, `fixture-bb225-r-${runId}`],
    );
    galleryRetouch = g1[0].id;
    
    maLinkRetouch = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner','Fixture BB-225 Retouch','active')`,
      [galleryRetouch, sha256(maLinkRetouch), maLinkRetouch.slice(0, 6)],
    );

    // Gallery 2: ready
    const { rows: g2 } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',3,10,50000,false) returning id`,
      [br[0].id, customerId, `${NHAN} Ready`, `fixture-bb225-rd-${runId}`],
    );
    galleryReady = g2[0].id;

    maLinkReady = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner','Fixture BB-225 Ready','active')`,
      [galleryReady, sha256(maLinkReady), maLinkReady.slice(0, 6)],
    );
  });

  test.afterAll(async () => {
    if (galleryRetouch) {
      await pg.query("delete from share_links where gallery_id = $1", [galleryRetouch]);
      await pg.query("delete from galleries where id = $1", [galleryRetouch]);
    }
    if (galleryReady) {
      await pg.query("delete from share_links where gallery_id = $1", [galleryReady]);
      await pg.query("delete from galleries where id = $1", [galleryReady]);
    }
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    await pg.end();
  });

  test("the hien o trang thai in_retouch va optmhzW4sL, sau do doi optxMAdtNX", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${maLinkRetouch}`);

    // Kiem tra the dang chinh sua
    const the = page.getByRole("heading", { name: "Đang chỉnh sửa" });
    await expect(the).toBeVisible();

    const img = page.locator("img[src*='tien-do-chinh-sua']");
    await expect(img).toBeVisible();

    const stepChinhSua = page.locator("div[aria-current='step']:has-text('Chỉnh sửa')");
    await expect(stepChinhSua).toBeVisible();

    // Opus soát: 5 nhãn bước căn giữa dưới chấm — nhãn ở hai mép không được
    // tràn khỏi màn điện thoại (tràn là trang cuộn ngang).
    await page.screenshot({ path: "test-results/bb-225-390.png", fullPage: false });
    for (const nhan of ["Chọn ảnh", "Nhận ảnh"]) {
      const hop = await page.getByText(nhan, { exact: true }).boundingBox();
      expect(hop, nhan).not.toBeNull();
      expect(hop!.x, `${nhan} tràn trái`).toBeGreaterThanOrEqual(0);
      expect(hop!.x + hop!.width, `${nhan} tràn phải`).toBeLessThanOrEqual(390);
    }
    const cuonNgang = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(cuonNgang, "trang cuộn ngang").toBe(false);

    // Doi trang thai
    await pg.query(`update galleries set lark_trang_thai = 'optxMAdtNX' where id = $1`, [galleryRetouch]);
    
    // Test tablet/desktop view on reload
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    const theIn = page.getByRole("heading", { name: "Đang in" });
    await expect(theIn).toBeVisible();

    const imgIn = page.locator("img[src*='tien-do-in']");
    await expect(imgIn).toBeVisible();

    const stepIn = page.locator("div[aria-current='step']:has-text('In')");
    await expect(stepIn).toBeVisible();
  });

  test("Khong co the o trang thai ready", async ({ page }) => {
    await page.goto(`/g/${maLinkReady}`);

    // Chờ màn khách tải xong rồi mới kiểm VẮNG — không thì kiểm lúc trang còn
    // trắng là xanh giả (Opus soát: bản đầu kiểm một tiêu đề vốn không bao giờ
    // có ở trạng thái ready).
    await expect(page.getByRole("region", { name: "Ảnh bìa" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("img[src*='/hanh-trinh/']")).toHaveCount(0);
  });
});
