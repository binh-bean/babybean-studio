/**
 * BB-378 — ba yêu cầu của anh trong Bản yêu cầu (màn khách):
 *   1. "Lưu app ra màn hình chính" (P1): lời mời nói LỢI ÍCH trước, hướng dẫn đúng
 *      máy có hình từng bước, hiện ĐÚNG LÚC (lần mở thứ 2 / đã chọn vài tấm), bỏ qua
 *      được và nhớ, KHÔNG hiện khi đã chạy dạng app.
 *   2. "Ghép mua ảnh trong không gian" (P1): chạm khung trên tường → xem lớn CẢ CẢNH
 *      (ảnh phòng + ảnh của bé), phóng được; bảng chữ gọn, nền kính mờ; điện thoại
 *      bảng kéo lên/xuống, mặc định thấp.
 *   3. Màn phụ (P2): link hết hạn / không tìm thấy (gồm thu hồi) có nút Nhắn Bean;
 *      màn chọn buổi chụp của link cũ `/g/` theo ngôn ngữ thiết kế hiện nay.
 *
 * Dữ liệu: nền Fixture riêng (`dungNenFixture`: chi nhánh + khách "Fixture BB-378 …"),
 * 2 bộ ảnh × 6 ảnh dọc (ảnh giả qua mock, không người), link theo bộ / theo khách /
 * thu hồi / hết hạn — dọn theo id (`donNenFixture`). Không gửi Lark (PHEP_THU_TRINH_DUYET).
 * Ảnh chụp: `BB378_ANH` (mặc định test-results/bb-378).
 *
 * Chạy: PW_PORT=3378 npx playwright test tests/e2e/bb-378-man-khach-goi-y.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page, BrowserContext } from "@playwright/test";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const THU_MUC_ANH = process.env.BB378_ANH || "test-results/bb-378";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });
const chup = (page: Page, ten: string) => page.screenshot({ path: `${THU_MUC_ANH}/${ten}.png` });

const DT = { width: 390, height: 844 };
const MT = { width: 1440, height: 900 };
const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

let pg: Client;
let nen: NenFixture;
const bo: string[] = [];
const ma = { bo: "", khach: "", thuHoi: "", hetHan: "" };

async function taoBo(ten: string): Promise<string> {
  const { rows } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                            photo_count, included_quota, extra_photo_price, download_enabled)
     values ($1,$2,$3,'ready',$4,'https://example.com/bb378',6,10,50000,false) returning id`,
    [nen.branchId, nen.customerId, `Fixture BB-378 ${nen.runId} ${ten}`, `SEED_FOLDER_ID_BB378_${nen.runId}_${ten}`],
  );
  const id = rows[0].id as string;
  for (let i = 1; i <= 6; i++) {
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
       values ($1,$2,$3,'image/jpeg',$4,'active',2000,3000)`,
      [id, `bb378-${nen.runId}-${ten}-${i}.jpg`, `BB378${ten}_000${i}.jpg`, i],
    );
  }
  return id;
}

async function taoLinkBo(galleryId: string, trangThai: "active" | "revoked", hetHan: boolean): Promise<string> {
  const m = randomBytes(32).toString("base64url");
  await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status, expires_at)
     values ($1,$2,$3,'owner',$4,$5,$6)`,
    [galleryId, sha256(m), m.slice(0, 6), `Fixture BB-378 ${nen.runId}`, trangThai, hetHan ? new Date(Date.now() - 86_400_000) : null],
  );
  return m;
}

test.setTimeout(180_000);

test.beforeAll(async () => {
  test.setTimeout(90_000);
  pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  nen = await dungNenFixture(pg, "BB-378");
  bo.push(await taoBo("Mot"), await taoBo("Hai"));
  ma.bo = await taoLinkBo(bo[0]!, "active", false);
  ma.thuHoi = await taoLinkBo(bo[0]!, "revoked", false);
  ma.hetHan = await taoLinkBo(bo[0]!, "active", true);
  ma.khach = randomBytes(32).toString("base64url");
  await pg.query(
    `insert into share_links (customer_id, token_hash, token_prefix, role, status, label)
     values ($1,$2,$3,'owner','active',$4)`,
    [nen.customerId, sha256(ma.khach), ma.khach.slice(0, 6), `Fixture BB-378 ${nen.runId} khách`],
  );
});

test.afterAll(async () => {
  if (pg) {
    try {
      await donNenFixture(pg, { galleryIds: bo, customerIds: [nen?.customerId], branchIds: [nen?.branchId] });
    } finally {
      await pg.end();
    }
  }
});

/** Mở bộ ảnh tới lưới (điện thoại: bấm "Bắt đầu chọn ảnh" trên bìa nếu có). */
async function moLuoi(page: Page, duong = `/g/${ma.bo}`) {
  await chanLh3TrenTrinhDuyet(page);
  await page.goto(duong);
  const batDau = page.getByRole("button", { name: /Bắt đầu chọn ảnh|Tiếp tục chọn/ }).filter({ visible: true }).first();
  await expect(batDau.or(page.getByTestId("the-anh").nth(2)).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("the-anh").first()).toBeAttached({ timeout: 60_000 });
  if (await batDau.isVisible().catch(() => false)) await batDau.click();
  await page.waitForTimeout(400);
}

/** Giả "đã chạy dạng app": iOS (navigator.standalone) hoặc Android/Chrome (display-mode). */
async function giaLaApp(context: BrowserContext, cach: "ios" | "android") {
  await context.addInitScript((c) => {
    if (c === "ios") {
      Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    } else {
      const goc = window.matchMedia.bind(window);
      window.matchMedia = (q: string) =>
        q.includes("display-mode: standalone")
          ? ({ matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as MediaQueryList)
          : goc(q);
    }
  }, cach);
}

// ---------------------------------------------------------------------------
// 1 — Lưu app ra màn hình chính
// ---------------------------------------------------------------------------
test.describe("1 — lời mời lưu app", () => {
  test.use({ userAgent: UA_IPHONE, viewport: DT, isMobile: true, hasTouch: true });

  test("lần mở đầu chưa mời; chọn 3 tấm thì mời, nói lợi ích trước", async ({ page }) => {
    await page.setViewportSize(DT);
    await moLuoi(page);
    await page.waitForTimeout(800);
    await expect(page.getByTestId("goi-y-luu-app"), "lần mở ĐẦU, chưa chọn gì: chưa mời").toHaveCount(0);

    for (let i = 0; i < 3; i++) {
      const tam = page.getByTestId("the-anh").nth(i);
      await tam.scrollIntoViewIfNeeded();
      await tam.getByRole("button", { name: "Chọn ảnh này" }).click();
      await expect(tam.getByRole("button", { name: "Bỏ chọn" })).toBeVisible();
    }
    const loiMoi = page.getByTestId("goi-y-luu-app");
    await expect(loiMoi).toBeAttached({ timeout: 10_000 });
    await loiMoi.scrollIntoViewIfNeeded();
    await expect(loiMoi).toContainText("Mở ảnh của bé chỉ bằng một chạm");
    await expect(loiMoi).toContainText("không phải tìm lại tin nhắn");
    await chup(page, "dt-01-loi-moi-luu-app");
  });

  test("lần mở thứ 2: mời ngay; Xem cách lưu → các bước iPhone có hình, đổi sang Android được", async ({ page, context }) => {
    // Bỏ tim của ca trước: tim có sẵn cũng là tín hiệu "người quay lại" — ở đây chỉ đo đếm lần mở.
    await pg.query(
      "delete from selection_items where selection_id in (select id from selections where gallery_id = $1)",
      [bo[0]],
    );
    // Phiên đầu (tab cũ) đếm 1 lần mở → chưa mời; tab mới = phiên mới = lần mở thứ 2.
    await moLuoi(page);
    await page.waitForTimeout(800);
    await expect(page.getByTestId("goi-y-luu-app"), "lần mở đầu: chưa mời").toHaveCount(0);
    await page.close();
    const tab2 = await context.newPage();
    await tab2.setViewportSize(DT);
    await moLuoi(tab2);
    const loiMoi = tab2.getByTestId("goi-y-luu-app");
    await expect(loiMoi, "lần mở thứ 2: mời ngay").toBeAttached({ timeout: 15_000 });
    await loiMoi.scrollIntoViewIfNeeded();
    await loiMoi.getByTestId("goi-y-xem-cach-luu").click();

    const hd = tab2.getByRole("dialog", { name: "Lưu app ra màn hình chính" });
    await expect(hd).toBeVisible();
    await expect(hd.locator("h3")).toHaveText("Mở ảnh của bé chỉ bằng một chạm");
    await expect(hd.getByTestId("huong-dan-luu-app")).toHaveAttribute("data-nhom", "iphone");
    const buoc = hd.getByTestId("buoc-luu-app").locator("li");
    await expect(buoc).toHaveCount(3);
    await expect(buoc.nth(0)).toContainText("Chia sẻ");
    await expect(buoc.nth(1)).toContainText("Thêm vào MH chính");
    await expect(hd.locator("svg[data-minh-hoa]")).toHaveCount(3);
    await expect(hd.locator('svg[data-minh-hoa="safari-chia-se"]')).toBeVisible();
    await chup(tab2, "dt-02-huong-dan-iphone");

    await hd.getByRole("button", { name: "Android", exact: true }).click();
    await expect(hd.getByTestId("huong-dan-luu-app")).toHaveAttribute("data-nhom", "android");
    await expect(hd.locator('svg[data-minh-hoa="chrome-menu"]')).toBeVisible();
    await expect(buoc.nth(1)).toContainText("Cài đặt ứng dụng");
    await chup(tab2, "dt-03-huong-dan-android");

    // Đã xem cách lưu = đã trả lời lời mời: phiên mới không mời lại.
    await hd.getByRole("button", { name: "Đã hiểu" }).click();
    const tab3 = await context.newPage();
    await tab3.setViewportSize(DT);
    await moLuoi(tab3);
    await tab3.waitForTimeout(800);
    await expect(tab3.getByTestId("goi-y-luu-app")).toHaveCount(0);
  });

  test("Để sau: ẩn và nhớ — phiên mới không mời lại", async ({ context, page }) => {
    await context.addInitScript(() => {
      try {
        if (!localStorage.getItem("bb_luu_app_so_lan_mo")) localStorage.setItem("bb_luu_app_so_lan_mo", "3");
      } catch {}
    });
    await moLuoi(page);
    const loiMoi = page.getByTestId("goi-y-luu-app");
    await expect(loiMoi).toBeAttached({ timeout: 15_000 });
    await loiMoi.scrollIntoViewIfNeeded();
    await loiMoi.getByRole("button", { name: "Để sau" }).click();
    await expect(loiMoi).toHaveCount(0);
    const tab2 = await context.newPage();
    await moLuoi(tab2);
    await tab2.waitForTimeout(800);
    await expect(tab2.getByTestId("goi-y-luu-app")).toHaveCount(0);
  });

  for (const cach of ["ios", "android"] as const) {
    test(`đang chạy dạng app (${cach}) → không bao giờ mời, kể cả lần mở thứ 5`, async ({ context, page }) => {
      await giaLaApp(context, cach);
      await context.addInitScript(() => {
        try {
          localStorage.setItem("bb_luu_app_so_lan_mo", "5");
        } catch {}
      });
      await moLuoi(page);
      // Đủ mọi tín hiệu khác: lần mở thứ 6 + vừa chọn 3 tấm.
      for (let i = 0; i < 3; i++) {
        const tam = page.getByTestId("the-anh").nth(i);
        await tam.scrollIntoViewIfNeeded();
        const nut = tam.getByRole("button", { name: /Chọn ảnh này|Bỏ chọn/ });
        await expect(nut).toBeVisible();
      }
      await page.waitForTimeout(800);
      await expect(page.getByTestId("goi-y-luu-app")).toHaveCount(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 2 — Ướm ảnh lên tường / bàn
// ---------------------------------------------------------------------------
async function moManTuong(page: Page) {
  await moLuoi(page);
  const tam = page.getByTestId("the-anh").nth(4);
  await tam.scrollIntoViewIfNeeded();
  const chon = tam.getByRole("button", { name: "Chọn ảnh này" });
  if (await chon.count()) await chon.click();
  await expect(tam.getByRole("button", { name: "Bỏ chọn" })).toBeVisible();
  await tam.click();
  const nutTuong = page.getByRole("button", { name: /Xem trên tường nhà/ }).filter({ visible: true }).first();
  const sp = page.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" }).filter({ visible: true }).first();
  const coLoiVao = await expect(nutTuong.or(sp).first())
    .toBeVisible({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!coLoiVao, "bb-dev không có ảnh in đang bán — không có màn treo tường");
  // Điện thoại: nút nằm trong bảng "Đặt in" của màn xem lớn.
  if (!(await nutTuong.isVisible())) await sp.click();
  await expect(nutTuong).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(300); // bảng "Đặt in" trượt xong
  await nutTuong.click();
  const man = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
  await expect(man).toBeVisible({ timeout: 20_000 });
  return man;
}

for (const [ten, kho] of [
  ["mt", MT],
  ["dt", DT],
] as const) {
  test(`2 — ${ten}: chạm khung → xem lớn cả cảnh, phóng được; bảng gọn kính mờ`, async ({ page }) => {
    await page.setViewportSize(kho);
    const man = await moManTuong(page);
    const khung = man.getByTestId("khung-tren-tuong");
    await expect(khung).toBeVisible({ timeout: 15_000 });

    // Bảng gọn: chi tiết phụ ẩn; chân bảng có chất liệu · cỡ · giá + nút chính; nền kính mờ.
    const bang = man.getByTestId("bang-treo-tuong");
    await expect(bang.getByTestId("chi-tiet-treo-tuong")).toHaveCount(0);
    await expect(bang.getByTestId("tom-tat-treo-tuong")).toContainText(/\d+×\d+ cm/);
    await expect(bang.getByRole("button", { name: "Thêm vào giỏ" })).toBeVisible();
    const mo = await bang.evaluate((el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).getPropertyValue("-webkit-backdrop-filter"));
    expect(mo, "nền bảng phải mờ kính").toMatch(/blur\((\d+)px\)/);
    expect(Number(/blur\((\d+)px\)/.exec(mo)![1])).toBeGreaterThanOrEqual(16);
    const nen = await bang.evaluate((el) => getComputedStyle(el).backgroundColor);
    const alpha = Number(/rgba?\([^)]*,\s*([\d.]+)\)/.exec(nen)?.[1] ?? "1");
    expect(alpha, "nền bảng phải trong để thấy cảnh phía sau").toBeLessThan(0.8);

    if (ten === "dt") {
      await expect(bang).toHaveAttribute("data-muc", "thap");
      const h = (await bang.boundingBox())!.height;
      expect(h, "điện thoại: bảng mặc định thấp (≤30vh)").toBeLessThanOrEqual(kho.height * 0.3 + 1);
      const hopKhung = (await khung.boundingBox())!;
      expect(hopKhung.y + hopKhung.height, "khung không nằm dưới bảng").toBeLessThanOrEqual((await bang.boundingBox())!.y + 4);
      await chup(page, "dt-10-tuong-bang-thap");
      // Kéo tay cầm lên → bảng cao; kéo xuống → về thấp.
      const tay = bang.getByTestId("tay-cam-bang");
      const t = (await tay.boundingBox())!;
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
      await page.mouse.down();
      await page.mouse.move(t.x + t.width / 2, t.y - 160, { steps: 6 });
      await page.mouse.up();
      await expect(bang).toHaveAttribute("data-muc", "cao");
      await page.waitForTimeout(400);
      expect((await bang.boundingBox())!.height).toBeGreaterThan(kho.height * 0.3 + 1);
      await chup(page, "dt-11-tuong-bang-cao");
      const t2 = (await tay.boundingBox())!;
      await page.mouse.move(t2.x + t2.width / 2, t2.y + t2.height / 2);
      await page.mouse.down();
      await page.mouse.move(t2.x + t2.width / 2, t2.y + 160, { steps: 6 });
      await page.mouse.up();
      await expect(bang).toHaveAttribute("data-muc", "thap");
    } else {
      await chup(page, "mt-10-tuong-bang-gon");
      await bang.getByRole("button", { name: "Chi tiết" }).click();
      await expect(bang.getByTestId("chi-tiet-treo-tuong")).toBeVisible();
      await chup(page, "mt-11-tuong-chi-tiet");
      await bang.getByRole("button", { name: "Ẩn chi tiết" }).click();
    }

    // Chạm khung → xem lớn CẢ CẢNH: ảnh phòng + ảnh của bé, không chỉ riêng tấm ảnh.
    await khung.click();
    const xl = page.getByRole("dialog", { name: "Xem lớn ảnh của bé" });
    await expect(xl).toBeVisible();
    await expect(xl).toHaveAttribute("data-testid", "xem-lon-canh");
    const sanKhau = xl.getByTestId("xem-lon-canh-san-khau");
    await expect(sanKhau.locator('img[src*="/tuong/"]')).toBeVisible();
    const anhBe = sanKhau.getByTestId("xem-lon-canh-anh-be");
    await expect(anhBe.locator('img[src*="/api/img/"], img[src*="googleusercontent"], img').first()).toBeVisible();
    // Ảnh của bé nằm TRONG ảnh phòng (cả cảnh), và chiếm phần nhỏ của nó — không phải ảnh lớn riêng.
    const hopSan = (await sanKhau.boundingBox())!;
    const hopBe = (await anhBe.boundingBox())!;
    expect(hopBe.x).toBeGreaterThanOrEqual(hopSan.x - 1);
    expect(hopBe.y).toBeGreaterThanOrEqual(hopSan.y - 1);
    expect(hopBe.x + hopBe.width).toBeLessThanOrEqual(hopSan.x + hopSan.width + 1);
    expect(hopBe.width * hopBe.height).toBeLessThan(hopSan.width * hopSan.height * 0.6);
    await page.waitForTimeout(300);
    await chup(page, `${ten}-12-xem-lon-ca-canh`);

    // Phóng to bằng nút; ảnh của bé to lên theo.
    await expect(xl).toHaveAttribute("data-phong", "1.00");
    await xl.getByRole("button", { name: "Phóng to" }).click();
    await expect.poll(async () => Number(await xl.getAttribute("data-phong"))).toBeGreaterThan(1.5);
    await page.waitForTimeout(350);
    expect((await anhBe.boundingBox())!.width).toBeGreaterThan(hopBe.width * 1.4);
    await chup(page, `${ten}-13-xem-lon-phong-to`);

    // Esc chỉ đóng lớp xem lớn — màn tường vẫn mở.
    await page.keyboard.press("Escape");
    await expect(xl).toBeHidden();
    await expect(man).toBeVisible();
  });
}

// ---------------------------------------------------------------------------
// 3 — Màn phụ: link hết hạn / không tìm thấy / thu hồi; chọn buổi chụp
// ---------------------------------------------------------------------------
for (const [ten, kho] of [
  ["dt", DT],
  ["mt", MT],
] as const) {
  test(`3 — ${ten}: link hết hạn, đã thu hồi, không có: màn Bean có nút Nhắn Bean`, async ({ page }) => {
    await page.setViewportSize(kho);
    const ca = [
      { duong: `/g/${ma.hetHan}`, loai: "het-han", tieuDe: "Link này đã hết hạn" },
      { duong: `/g/${ma.thuHoi}`, loai: "khong-thay", tieuDe: "Không tìm thấy bộ ảnh" },
      { duong: `/k/${randomBytes(24).toString("base64url")}`, loai: "khong-thay", tieuDe: "Không tìm thấy bộ ảnh" },
    ];
    for (const c of ca) {
      await page.goto(c.duong);
      const man = page.getByTestId("man-loi-link");
      await expect(man).toBeVisible({ timeout: 60_000 });
      await expect(man).toHaveAttribute("data-loai", c.loai);
      const h1 = man.getByRole("heading", { level: 1 });
      await expect(h1).toHaveText(c.tieuDe);
      expect(await h1.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Playfair/i);
      expect(await man.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(251, 247, 242)");
      const nut = man.getByTestId("man-loi-nhan-bean");
      await expect(nut).toBeVisible();
      await expect(nut).toHaveText(/Nhắn Bean|Liên hệ Bean/);
      const href = (await nut.getAttribute("href")) ?? "";
      expect(href === "/" || /^https?:\/\//.test(href), `href nút nhắn: ${href}`).toBe(true);
      // Hết hạn / không có thì "Thử lại" vô ích — không bày ra.
      await expect(man.getByRole("button", { name: "Thử lại" })).toHaveCount(0);
      await expect(page.locator('img[src*="/api/img/"]')).toHaveCount(0);
      await chup(page, `${ten}-20-loi-${c.loai}-${c.duong.startsWith("/k/") ? "k" : "g"}`);
    }
  });

  test(`3 — ${ten}: link cũ theo khách → màn chọn buổi chụp kiểu mới, chọn được buổi`, async ({ page }) => {
    await page.setViewportSize(kho);
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${ma.khach}`);
    const man = page.getByTestId("chon-buoi-chup");
    await expect(man).toBeVisible({ timeout: 60_000 });
    await expect(man.getByRole("heading", { level: 1 })).toHaveText("Ba mẹ muốn xem buổi nào ạ?");
    expect(await man.getByRole("heading", { level: 1 }).evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Playfair/i);
    await expect(man).not.toContainText(/album/i);
    const dong = man.getByTestId("dong-buoi-chup");
    await expect(dong).toHaveCount(2);
    await chup(page, `${ten}-30-chon-buoi-chup`);
    await dong.first().click();
    await expect(page.getByTestId("the-anh").first()).toBeAttached({ timeout: 60_000 });
  });
}
