/**
 * BB-293 vòng 2 — ảnh chụp bắt buộc, RÚT GỌN cho mục #3 và #11 (hai mục vừa
 * LÀM LẠI theo quyết định giám đốc). #4/#10/mục cũ #5 đã có ảnh riêng từ lượt
 * chạy trước (`test-results/bb-293/4-treo-tuong-dt.png`,
 * `muc-cu-5-bia-album-dt.png`) — không lặp lại ở đây để giảm số bước, giảm
 * rủi ro treo trình chạy (đã treo 2 lần với bản đầy đủ hơn).
 *
 * OWNER: QA-BOT (tệp này) / DEV-FE (sản phẩm được chụp).
 *
 * Dữ liệu: chỉ "Fixture BB-293 …", dọn theo id ở afterAll.
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = () => `0903${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-293 gonlai ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const THU_MUC_ANH = "test-results/bb-293";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

interface BoCuc {
  galleryId: string;
  customerId: string;
  maLink: string;
}

async function dungFixture(pg: Client): Promise<BoCuc> {
  await pg.query(
    `delete from galleries where title like 'Fixture BB-293 gonlai%' and created_at < now() - interval '6 hours'`,
  );
  await pg.query(
    `delete from customers where full_name like 'Fixture BB-293 gonlai%' and created_at < now() - interval '6 hours'`,
  );
  const { rows: br } = await pg.query("select id from branches order by name limit 1");
  const branchId = br[0].id;
  const { rows: kh } = await pg.query(
    `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
    [branchId, `${NHAN} Khách`, soGia()],
  );
  const customerId = kh[0].id;
  const soAnh = 4;
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                            drive_folder_url, photo_count, included_quota)
     values ($1,$2,$3,'ready',$4,'https://example.com/x',$5,10) returning id`,
    [branchId, customerId, NHAN, `fixture-bb293-gonlai-${runId}`, soAnh],
  );
  const galleryId = g[0].id;
  for (let i = 1; i <= soAnh; i++) {
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,$3,'image/jpeg',$4,'active')`,
      [galleryId, `bb293gl-${runId}-${i}`, `BB293GL_${String(i).padStart(3, "0")}.jpg`, i],
    );
  }
  const maLink = randomBytes(32).toString("base64url");
  await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'owner',$4,'active')`,
    [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
  );
  return { galleryId, customerId, maLink };
}

async function xoaFixture(pg: Client, bc: BoCuc) {
  if (!bc.galleryId) return;
  await pg.query("delete from selection_addons where selection_id in (select id from selections where gallery_id=$1)", [bc.galleryId]);
  await pg.query("delete from selection_items where gallery_id = $1", [bc.galleryId]);
  await pg.query("delete from selections where gallery_id = $1", [bc.galleryId]);
  await pg.query("delete from share_links where gallery_id = $1", [bc.galleryId]);
  await pg.query("delete from activity_logs where entity_id = $1", [bc.galleryId]);
  await pg.query("delete from photos where gallery_id = $1", [bc.galleryId]);
  await pg.query("delete from galleries where id = $1", [bc.galleryId]);
  if (bc.customerId) await pg.query("delete from customers where id = $1", [bc.customerId]);
}

ownIpTest.describe("BB-293 vòng 2: ảnh chụp #3 + #11 (gọn)", () => {
  let pg: Client;
  let bc: BoCuc;

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    bc = await dungFixture(pg);
  });

  ownIpTest.afterAll(async () => {
    await xoaFixture(pg, bc);
    await pg.end();
  });

  ownIpTest("mục #3 — xem lớn máy tính, cột phải kính sáng", async ({ page }) => {
    ownIpTest.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${bc.maLink}`);
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    const theAnh = page.getByTestId("the-anh");
    await ownIpExpect(theAnh.first()).toBeVisible();
    await theAnh.first().getByRole("button", { name: /Chọn ảnh này|Bỏ chọn/ }).click();
    await theAnh.first().getByRole("button", { name: /^Xem ảnh/ }).click();
    const lightbox = page.getByRole("dialog").first();
    await lightbox.waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${THU_MUC_ANH}/3-xem-lon-cot-phai-mt.png` });

    const nhanGhiChu = page.getByText("Ghi chú cho thợ chỉnh ảnh");
    await ownIpExpect(nhanGhiChu).toBeVisible();
    const mau = await nhanGhiChu.evaluate((el) => getComputedStyle(el).color);
    ownIpExpect(mau).toContain("107, 96, 87"); // #6b6057
  });

  ownIpTest("mục #11 — so sánh: nhãn phản ánh đúng trạng thái chọn (điện thoại)", async ({ page }) => {
    ownIpTest.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${bc.maLink}`);
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    const theAnh = page.getByTestId("the-anh");
    await ownIpExpect(theAnh.first()).toBeVisible();

    // BB-299 kiểm ngược — phát hiện lỗi CÓ SẴN (không do BB-299 gây ra, xác
    // nhận bằng cách hoàn nguyên toàn bộ patch BB-299 rồi chạy lại: vẫn đỏ)
    // khi chạy CẢ TỆP: mục "#3" (ở trên) đã thả tim tấm #1 trên CÙNG một bộ
    // ảnh fixture (`beforeAll` dùng chung một `bc.galleryId` cho mọi test),
    // nên tới mục "#11" tấm #1 đã SẴN "đã chọn" — vòng lặp bấm mù theo nhãn
    // `/Chọn ảnh này|Bỏ chọn/` BẤM VÀO NÚT "Bỏ chọn" và tự BỎ chọn tấm đó,
    // chỉ còn 1/2 tấm thật sự "đã chọn" khi vào màn so sánh. Sửa: kiểm
    // `aria-pressed` trước, chỉ bấm khi tấm CHƯA được chọn — vá đúng lỗi
    // (không né bằng cách đợi/thử lại), kiểm ngược: bỏ đoạn if bên dưới quay
    // về bấm mù → đỏ lại đúng lỗi này.
    for (let i = 0; i < 2; i++) {
      const timNut = theAnh.nth(i).getByRole("button", { name: /Chọn ảnh này|Bỏ chọn/ });
      const daChon = (await timNut.getAttribute("aria-pressed")) === "true";
      if (!daChon) await timNut.click();
    }
    await page.getByRole("button", { name: "So sánh", exact: true }).click();
    await theAnh.nth(0).click();
    await theAnh.nth(1).click();
    await page.getByRole("button", { name: /Đã chọn 2 tấm để so sánh/ }).click();
    const manSoSanh = page.getByRole("dialog", { name: "So sánh nhiều tấm" });
    await manSoSanh.waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${THU_MUC_ANH}/11-so-sanh-dt.png` });

    // Cả hai tấm đã chọn từ trước -> chip "✓ Đã chọn" hiện ở CẢ HAI, không
    // còn nhãn "Giữ tấm này"/"Đang giữ tấm này" mơ hồ (dải điều khiển dưới
    // ảnh). Chip ghép "✓" (span riêng) + "Đã chọn" cùng một phần tử — so
    // khớp bằng regex thay vì exact để không phụ thuộc cách chia span.
    await ownIpExpect(manSoSanh.getByText(/Đã chọn/)).toHaveCount(2);
    await ownIpExpect(manSoSanh.getByText("Đang giữ tấm này")).toHaveCount(0);
  });
});
