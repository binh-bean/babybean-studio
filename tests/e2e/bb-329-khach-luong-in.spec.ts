/**
 * BB-329 — màn khách: tiến độ sau khi chốt, khoá cuộn sau tấm "Đặt in",
 * chọn chất liệu + kích thước ở cửa hàng, khung trên tường trên điện thoại.
 *
 * Dữ liệu: chỉ "Fixture BB-329 …" (bộ ảnh + khách giả, ảnh giả qua
 * mock-drive-network). Trạng thái bộ ảnh đổi THẲNG trong DB (không đi qua nút
 * chốt — không có lượt gửi Lark nào). Dọn theo id ở afterAll.
 * Danh mục sản phẩm: dữ liệu THẬT đang bán trên bb-dev (không bịa giá) —
 * thiếu thì ca đó tự skip, không giả vờ xanh.
 *
 * Chạy: PW_PORT=3194 npx playwright test tests/e2e/bb-329-khach-luong-in.spec.ts --workers=1
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-329 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const soGia = () => `0906${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const THU_MUC_ANH = "test-results/bb-329";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

const DIEN_THOAI = { width: 390, height: 844 };

interface BoCuc {
  galleryId: string;
  customerId: string;
  maLink: string;
}

async function dungFixture(pg: Client): Promise<BoCuc> {
  await pg.query(`delete from share_links where gallery_id in (select id from galleries where title like 'Fixture BB-329%' and created_at < now() - interval '6 hours')`);
  await pg.query(`delete from photos where gallery_id in (select id from galleries where title like 'Fixture BB-329%' and created_at < now() - interval '6 hours')`);
  await pg.query(`delete from gallery_items where gallery_id in (select id from galleries where title like 'Fixture BB-329%' and created_at < now() - interval '6 hours')`);
  await pg.query(`delete from galleries where title like 'Fixture BB-329%' and created_at < now() - interval '6 hours'`);
  await pg.query(`delete from customers where full_name like 'Fixture BB-329%' and created_at < now() - interval '6 hours'`);

  const { rows: br } = await pg.query("select id from branches order by name limit 1");
  const branchId = br[0].id;
  const { rows: kh } = await pg.query(
    `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
    [branchId, `${NHAN} Khách`, soGia()],
  );
  const customerId = kh[0].id;
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                            drive_folder_url, photo_count, included_quota, extra_photo_price)
     values ($1,$2,$3,'ready',$4,'https://example.com/x',12,10,20000) returning id`,
    [branchId, customerId, NHAN, `fixture-bb329-${runId}`],
  );
  const galleryId = g[0].id;
  for (let i = 1; i <= 12; i++) {
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
       values ($1,$2,$3,'image/jpeg',$4,'active',1200,1800)`,
      [galleryId, `bb329-${runId}-${i}`, `BB329_${String(i).padStart(3, "0")}.jpg`, i],
    );
  }
  // Hạn mức 10 tấm (dòng "ảnh chỉnh sửa") — thiếu thì app chặn thả tim.
  await pg.query(
    `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
     select $1, id, 10, 0 from products where is_active and kind = 'edited_photo' order by id limit 1`,
    [galleryId],
  );
  const maLink = randomBytes(32).toString("base64url");
  await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'owner',$4,'active')`,
    [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
  );
  return { galleryId, customerId, maLink };
}

async function xoaFixture(pg: Client, bc: BoCuc | undefined) {
  if (!bc?.galleryId) return;
  const id = bc.galleryId;
  await pg.query("delete from selection_addons where selection_id in (select id from selections where gallery_id=$1)", [id]);
  await pg.query("delete from selection_placements where selection_item_id in (select id from selection_items where gallery_id=$1)", [id]).catch(() => {});
  await pg.query("delete from selection_items where gallery_id = $1", [id]).catch(() => {});
  await pg.query("delete from selections where gallery_id = $1", [id]);
  await pg.query("delete from gallery_items where gallery_id = $1", [id]);
  await pg.query("delete from share_links where gallery_id = $1", [id]);
  await pg.query("delete from activity_logs where entity_id = $1", [id]);
  await pg.query("delete from photos where gallery_id = $1", [id]);
  await pg.query("delete from galleries where id = $1", [id]);
  if (bc.customerId) await pg.query("delete from customers where id = $1", [bc.customerId]);
}

/** `overflow` THẬT của body (computed), và trang có cuộn được không. */
async function trangCuonDuoc(page: Page) {
  return page.evaluate(async () => {
    const overflow = getComputedStyle(document.body).overflow;
    window.scrollTo(0, 0);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    window.scrollBy(0, 600);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    return { overflow, cuon: window.scrollY };
  });
}

ownIpTest.describe("BB-329 — màn khách: tiến độ, Đặt in, cửa hàng", () => {
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

  ownIpTest("mục 2+4: xem lớn → Đặt in → cửa hàng → đóng: trang vẫn cuộn; chất liệu chọn được trước kích thước", async ({ page }) => {
    ownIpTest.setTimeout(90_000);
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${bc.maLink}`);

    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    const theDau = page.getByTestId("the-anh").first();
    await theDau.scrollIntoViewIfNeeded();
    const nutChon = theDau.getByRole("button", { name: "Chọn ảnh này" });
    if ((await nutChon.count()) > 0) await nutChon.click();
    await ownIpExpect(theDau.getByRole("button", { name: "Bỏ chọn" })).toBeVisible();
    await theDau.click();

    // Ô ghi chú ở màn xem lớn điện thoại: < 16px là Safari iOS tự phóng trang.
    const oGhiChu = page.locator("#ghi-chu-anh");
    if ((await oGhiChu.count()) > 0) {
      const co = await oGhiChu.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      ownIpExpect(co, "ô ghi chú < 16px → iPhone tự phóng to, kẹt màn").toBeGreaterThanOrEqual(16);
    }

    await page.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" }).click(); // nút "Đặt in" ở thanh đáy
    const nutAnhIn = page.getByRole("button", { name: /Ảnh in và ảnh phóng/ });
    const coAnhIn = await nutAnhIn
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    ownIpTest.skip(!coAnhIn, "bb-dev không có ảnh in đang bán — không có đường Đặt in tấm này");
    await nutAnhIn.click();

    const cuaHang = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
    await cuaHang.waitFor({ state: "visible" });
    ownIpExpect((await trangCuonDuoc(page)).overflow, "cửa hàng đang mở thì nền phải khoá").toBe("hidden");

    // Mục 4 — CHẤT LIỆU đứng trước KÍCH THƯỚC và là chip bấm được (bậc cũ:
    // khổ 10×15 mặc định chỉ còn chữ "UV" không bấm được).
    const buocChatLieu = cuaHang.getByTestId("buoc-chat-lieu");
    await ownIpExpect(buocChatLieu).toBeVisible();
    const chipChatLieu = buocChatLieu.getByRole("button");
    const soChatLieu = await chipChatLieu.count();
    ownIpExpect(soChatLieu, "ảnh in phải có ≥ 2 chất liệu để chọn").toBeGreaterThanOrEqual(2);
    const thuTu = await cuaHang.evaluate((el) => {
      const t = el.textContent ?? "";
      return { chatLieu: t.indexOf("Chất liệu"), kichThuoc: t.indexOf("Kích thước") };
    });
    ownIpExpect(thuTu.chatLieu).toBeGreaterThanOrEqual(0);
    ownIpExpect(thuTu.chatLieu, "Chất liệu phải đứng trước Kích thước").toBeLessThan(thuTu.kichThuoc);

    // Bấm chất liệu thứ hai → chip đó được chọn, tên sản phẩm đổi theo.
    const chipHai = chipChatLieu.nth(1);
    const tenChatLieuHai = (await chipHai.textContent())?.trim() ?? "";
    await chipHai.click();
    await ownIpExpect(chipHai).toHaveAttribute("aria-pressed", "true");
    await ownIpExpect(cuaHang.getByText(new RegExp(tenChatLieuHai.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).first()).toBeVisible();
    await page.screenshot({ path: `${THU_MUC_ANH}/2-cua-hang-chat-lieu.png` });

    await cuaHang.getByRole("button", { name: "Đóng" }).first().click();
    await cuaHang.waitFor({ state: "hidden" });

    // Mục 2 — quay lại lưới ảnh: body không còn overflow hidden, trang cuộn được.
    const sau = await trangCuonDuoc(page);
    ownIpExpect(sau.overflow, "body còn overflow hidden sau khi đóng tấm Đặt in").not.toBe("hidden");
    ownIpExpect(sau.cuon, "trang không cuộn được sau khi đóng tấm Đặt in").toBeGreaterThan(0);
    await page.screenshot({ path: `${THU_MUC_ANH}/2-sau-khi-dong.png` });
  });

  ownIpTest("mục 3: điện thoại — cả 4 phòng đều có khung ảnh, không đè cụm chọn phòng", async ({ page }) => {
    ownIpTest.setTimeout(90_000);
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${bc.maLink}`);
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    const theDau = page.getByTestId("the-anh").first();
    await theDau.scrollIntoViewIfNeeded();
    const nutChon = theDau.getByRole("button", { name: "Chọn ảnh này" });
    if ((await nutChon.count()) > 0) await nutChon.click();
    await ownIpExpect(theDau.getByRole("button", { name: "Bỏ chọn" })).toBeVisible();
    await theDau.click();
    await page.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" }).click();
    const nutTuong = page.getByRole("button", { name: /Xem trên tường nhà mình/ }).first();
    const coNut = await nutTuong
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    ownIpTest.skip(!coNut, "bb-dev không có ảnh in đang bán — không có màn treo tường");
    await nutTuong.scrollIntoViewIfNeeded();
    await nutTuong.click();

    const manTuong = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
    await manTuong.waitFor({ state: "visible" });

    for (const tenPhong of ["Phòng khách", "Phòng của bé", "Phòng ngủ ba mẹ", "Sảnh vào nhà"]) {
      const nutPhong = manTuong.getByRole("button", { name: tenPhong, exact: true });
      await nutPhong.click();
      const khung = manTuong.getByRole("button", { name: "Xem lớn ảnh của bé" });
      await ownIpExpect(khung, `${tenPhong}: không có khung ảnh trên tường`).toBeVisible();
      const hop = await khung.boundingBox();
      const hopPhong = await nutPhong.boundingBox();
      ownIpExpect(hop).not.toBeNull();
      ownIpExpect(hop!.y + hop!.height, `${tenPhong}: khung tràn đáy màn`).toBeLessThanOrEqual(DIEN_THOAI.height);
      ownIpExpect(hop!.y, `${tenPhong}: khung đè lên cụm chọn phòng`).toBeGreaterThanOrEqual(hopPhong!.y + hopPhong!.height);
      await page.screenshot({ path: `${THU_MUC_ANH}/3-tuong-${tenPhong.replace(/\s+/g, "-")}.png` });
    }
  });

  ownIpTest("mục 1: vừa chốt → Chờ xác nhận; CSKH xác nhận → Chờ chỉnh; Lark Đang làm → Đang chỉnh", async ({ page }) => {
    ownIpTest.setTimeout(90_000);
    await page.setViewportSize(DIEN_THOAI);

    await pg.query(`update galleries set status = 'submitted', lark_trang_thai = null where id = $1`, [bc.galleryId]);
    await page.goto(`/g/${bc.maLink}`);
    const the = page.locator("#the-hanh-trinh");
    await the.scrollIntoViewIfNeeded();
    await ownIpExpect(the.getByRole("heading", { name: "Đang chờ studio xác nhận" })).toBeVisible();
    await ownIpExpect(the.locator("[aria-current='step']")).toHaveText("Chờ xác nhận");
    await ownIpExpect(the.getByText("Đã chốt", { exact: true })).toHaveCount(0);
    for (const nhan of ["Chờ xác nhận", "In/nhận ảnh"]) {
      const hop = await the.getByText(nhan, { exact: true }).boundingBox();
      ownIpExpect(hop, nhan).not.toBeNull();
      ownIpExpect(hop!.x, `${nhan} tràn trái`).toBeGreaterThanOrEqual(0);
      ownIpExpect(hop!.x + hop!.width, `${nhan} tràn phải`).toBeLessThanOrEqual(DIEN_THOAI.width);
    }
    // Năm nhãn bước không đè lên nhau và nằm trọn trong thẻ (nhãn mới dài hơn).
    const hopThe = await the.locator(":scope > div").first().boundingBox();
    const hopNhan: { x: number; width: number }[] = [];
    for (const nhan of ["Chờ xác nhận", "Chờ chỉnh", "Đang chỉnh", "Duyệt ảnh", "In/nhận ảnh"]) {
      const h = await the.getByText(nhan, { exact: true }).boundingBox();
      ownIpExpect(h, nhan).not.toBeNull();
      hopNhan.push(h!);
    }
    for (let i = 0; i + 1 < hopNhan.length; i++) {
      ownIpExpect(hopNhan[i]!.x + hopNhan[i]!.width, `nhãn bước ${i + 1} đè nhãn ${i + 2}`).toBeLessThanOrEqual(hopNhan[i + 1]!.x);
    }
    ownIpExpect(hopNhan[0]!.x, "nhãn đầu tràn khỏi thẻ").toBeGreaterThanOrEqual(hopThe!.x);
    ownIpExpect(hopNhan[4]!.x + hopNhan[4]!.width, "nhãn cuối tràn khỏi thẻ").toBeLessThanOrEqual(hopThe!.x + hopThe!.width);
    await the.screenshot({ path: `${THU_MUC_ANH}/1a-cho-xac-nhan.png` });

    await pg.query(`update galleries set status = 'in_retouch' where id = $1`, [bc.galleryId]);
    await page.reload();
    await the.scrollIntoViewIfNeeded();
    await ownIpExpect(the.locator("[aria-current='step']")).toHaveText("Chờ chỉnh");
    await ownIpExpect(the.getByRole("heading", { name: "Đang chỉnh sửa" })).toHaveCount(0);
    await the.screenshot({ path: `${THU_MUC_ANH}/1b-cho-chinh.png` });

    await pg.query(`update galleries set lark_trang_thai = 'optmhzW4sL' where id = $1`, [bc.galleryId]);
    await page.reload();
    await the.scrollIntoViewIfNeeded();
    await ownIpExpect(the.locator("[aria-current='step']")).toHaveText("Đang chỉnh");
    await ownIpExpect(the.getByRole("heading", { name: "Đang chỉnh sửa" })).toBeVisible();
    await the.screenshot({ path: `${THU_MUC_ANH}/1c-dang-chinh.png` });

    await pg.query(`update galleries set status = 'ready', lark_trang_thai = null where id = $1`, [bc.galleryId]);
  });
});
