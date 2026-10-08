/**
 * BB-334B — màn khách link gia đình (docs/29-link-gia-dinh.md, bản vẽ BB-334 01–04).
 *
 *   1. `/k/<mã>` thấy ĐỦ 2 bộ của nhà (390×844: thẻ lớn + dòng gọn; 1440×900: lưới thẻ),
 *      manifest + icon theo nhà.
 *   2. HAI TAB: tab 1 vào bộ 1, tab 2 vào bộ 2, mỗi tab chọn ảnh; rồi cookie bị trỏ
 *      sang bộ 2 (luồng cũ BB-130 `buoi-chup`) mà tab 1 chọn tiếp → lượt chọn KHÔNG lẫn:
 *      bộ 1 chỉ có ảnh bộ 1, bộ 2 chỉ có ảnh bộ 2. Mọi PATCH mang `x-bb-bo` đúng bộ.
 *   3. Chuyển bộ (bản vẽ 03/04): tấm trượt/bảng thả xuống liệt kê 2 bộ, bấm sang bộ kia.
 *   4. Link cũ `/g/<mã>` vẫn chạy y như cũ (không `x-bb-bo`, không nút về trang gia đình),
 *      và thấy CHUNG lượt chọn chính với link gia đình (§1.3).
 *
 * Dữ liệu: tests/fixtures/bb-334b.ts ("Fixture BB-334A-…" chi nhánh riêng, dọn theo id).
 * Ảnh giả (mock Drive phía máy chủ + chặn lh3 phía trình duyệt) — không người.
 * Không gửi gì ra Lark (PHEP_THU_TRINH_DUYET của playwright.config.ts).
 *
 * Chạy: PW_PORT=3334 npx playwright test tests/e2e/bb-334b-link-gia-dinh.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page, Request } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { taoBb334b, donBb334b, type DuLieuBb334b } from "../fixtures/bb-334b";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";

// Ảnh chụp đối chiếu bản vẽ: NGOÀI repo (dữ liệu Fixture, ảnh giả không người).
/** `babybean-assets/` nằm cạnh repo — đi ngược lên tới khi gặp (chạy được cả ở main lẫn worktree). */
function thuMucAnh(con: string): string {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const thu = path.join(d, "babybean-assets");
    if (fs.existsSync(thu)) return path.join(thu, "BB-334", con);
    d = path.dirname(d);
  }
  return path.resolve(__dirname, "../../test-results", con);
}
const THU_MUC_CHUP =
  process.env.BB334B_CHUP ?? thuMucAnh("chup-334b");
const coThuMucChup = fs.existsSync(path.dirname(THU_MUC_CHUP));
if (coThuMucChup) fs.mkdirSync(THU_MUC_CHUP, { recursive: true });
const chup = async (page: Page, ten: string) => {
  if (!coThuMucChup) return;
  // Đợi mọi ảnh ĐANG HIỆN tải xong (bìa, ô chuyển bộ) — ảnh chụp đối chiếu bản vẽ.
  await page
    .waitForFunction(
      () =>
        [...document.images]
          .filter((i) => i.getBoundingClientRect().bottom > 0 && i.getBoundingClientRect().top < innerHeight)
          .every((i) => i.complete),
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(THU_MUC_CHUP, ten) });
};

let d: DuLieuBb334b;

test.use({ actionTimeout: 20_000 });
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  d = await taoBb334b();
});

test.afterAll(async () => {
  if (d) await donBb334b(d);
});

async function vao(page: Page, w: number, h: number, duong: string) {
  await page.setViewportSize({ width: w, height: h });
  await chanLh3TrenTrinhDuyet(page);
  await page.goto(duong);
}

async function choLuoi(page: Page) {
  await page.locator("#dau-luoi-anh").first().waitFor({ state: "attached", timeout: 60_000 });
  await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 60_000 });
}

/** Bấm "Chọn ảnh này"/"Bỏ chọn" trên thẻ thứ i, trả về lượt PATCH /api/g/selection đã gửi. */
async function bamTim(page: Page, i: number, nhan: RegExp = /^Chọn ảnh này$/): Promise<{ req: Request; status: number }> {
  const the = page.getByTestId("the-anh").nth(i);
  await the.scrollIntoViewIfNeeded();
  const cho = page.waitForResponse(
    (r) => r.url().endsWith("/api/g/selection") && r.request().method() === "PATCH",
  );
  await the.getByRole("button", { name: nhan }).click();
  const res = await cho;
  return { req: res.request(), status: res.status() };
}

async function anhDaChon(galleryId: string): Promise<string[]> {
  const { rows } = await d.pg.query(
    `select si.photo_id from selection_items si where si.gallery_id = $1 and si.mark = 'selected' order by si.photo_id`,
    [galleryId],
  );
  return rows.map((r) => r.photo_id as string);
}

test("1a. /k/<mã> ở 390×844: đủ 2 bộ của nhà — thẻ lớn (bộ cần chọn) + dòng gọn", async ({ page }) => {
  await vao(page, 390, 844, `/k/${d.giaDinhA.ma}`);
  await expect(page.getByTestId("trang-gia-dinh")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("loi-chao-gia-dinh")).toHaveText("Chào ba mẹ bé Mít");

  const theLon = page.locator('[data-testid="the-bo-anh"]:visible');
  const dong = page.locator('[data-testid="dong-bo-anh"]:visible');
  await expect(theLon).toHaveCount(1);
  await expect(dong).toHaveCount(1);
  // Mới nhất trước: A2 "Thôi nôi" (12.09.2026) là thẻ lớn, A1 "Đầy tháng" là dòng gọn.
  await expect(theLon).toContainText("Bé Mít · Thôi nôi");
  await expect(theLon).toContainText("Chụp 12.09.2026 · 2 ảnh");
  await expect(theLon).toHaveAttribute("data-so-thu-tu", "2");
  await expect(dong).toContainText("Bé Mít · Đầy tháng");
  await expect(dong).toHaveAttribute("href", `/k/${d.giaDinhA.ma}/1`);
  // Nhãn trạng thái: đúng câu của máy chủ (trangThaiKhach), không tự viết.
  await expect(theLon.getByTestId("chip-trang-thai-bo")).toContainText("Mời ba mẹ chọn ảnh");

  // Manifest + icon theo NHÀ (docs/29 §2.2).
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    `/api/k/${d.giaDinhA.ma}/manifest.webmanifest`,
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    `/api/k/${d.giaDinhA.ma}/bia-vuong?w=180`,
  );
  // Không tràn ngang.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.waitForTimeout(600);
  await chup(page, "01-trang-gia-dinh-dt.png");
});

test("1b. /k/<mã> ở 1440×900: lưới thẻ, đủ 2 bộ", async ({ page }) => {
  await vao(page, 1440, 900, `/k/${d.giaDinhA.ma}`);
  await expect(page.getByTestId("trang-gia-dinh")).toBeVisible({ timeout: 60_000 });
  const the = page.locator('[data-testid="the-bo-anh"]:visible');
  await expect(the).toHaveCount(2);
  await expect(the.nth(0)).toContainText("Bé Mít · Thôi nôi");
  await expect(the.nth(1)).toContainText("Bé Mít · Đầy tháng");
  await expect(page.locator('[data-testid="dong-bo-anh"]:visible')).toHaveCount(0);
  await page.waitForTimeout(600);
  await chup(page, "02-trang-gia-dinh-mt.png");
});

test("2. HAI TAB hai bộ: lượt chọn không lẫn nhau, kể cả khi cookie bị trỏ sang bộ kia", async ({ page, context }) => {
  // Máy chủ dev lạnh: biên dịch route /k/[ma]/[n] TRƯỚC — lần biên dịch đầu làm
  // Fast Refresh tải lại cả trang đang mở, nuốt mất cú bấm điều hướng.
  await page.request.get(`/k/${d.giaDinhA.ma}/1`);
  // Tab 1 — bộ 1 (A1, "Đầy tháng"). Vào từ trang gia đình như ba mẹ thật.
  await vao(page, 390, 844, `/k/${d.giaDinhA.ma}`);
  await expect(page.locator('[data-testid="dong-bo-anh"]:visible')).toBeVisible({ timeout: 60_000 });
  await page.locator('[data-testid="dong-bo-anh"]:visible').click();
  // Máy chủ dev lạnh: lần đầu biên dịch route /k/[ma]/[n] mất vài chục giây.
  await expect(page).toHaveURL(new RegExp(`/k/${d.giaDinhA.ma}/1$`), { timeout: 90_000 });
  await choLuoi(page);

  const truocA1 = await anhDaChon(d.A1.id);
  const truocA2 = await anhDaChon(d.A2.id);
  expect(truocA1).toEqual([]);
  expect(truocA2).toEqual([]);

  const t1 = await bamTim(page, 0);
  expect(t1.status).toBe(200);
  expect(t1.req.headers()["x-bb-bo"]).toBe(d.A1.id);

  // Tab 2 — bộ 2 (A2, "Thôi nôi"), cùng trình duyệt = cùng cookie.
  const tab2 = await context.newPage();
  await vao(tab2, 390, 844, `/k/${d.giaDinhA.ma}/2`);
  await choLuoi(tab2);
  const t2 = await bamTim(tab2, 0);
  expect(t2.status).toBe(200);
  expect(t2.req.headers()["x-bb-bo"]).toBe(d.A2.id);

  // Cookie phiên bị trỏ hẳn sang bộ 2 (đúng cảnh lỗi cũ: luồng BB-130 ký lại cookie).
  const ky = await tab2.request.post("/api/g/buoi-chup", { data: { buoiChupId: d.A2.id } });
  expect(ky.status()).toBe(200);

  // Tab 1 chọn tiếp — PHẢI vào bộ 1 (tiêu đề thắng cookie).
  await page.bringToFront();
  const t3 = await bamTim(page, 1);
  expect(t3.status).toBe(200);
  expect(t3.req.headers()["x-bb-bo"]).toBe(d.A1.id);

  expect(await anhDaChon(d.A1.id)).toEqual([...d.A1.anh].sort());
  expect(await anhDaChon(d.A2.id)).toEqual([d.A2.anh[0]]);

  // Tải lại tab 1: màn đọc lại từ máy chủ đúng bộ 1 (2 tấm đã chọn), không phải bộ 2.
  await page.reload();
  await choLuoi(page);
  await expect(page.getByTestId("the-anh").getByRole("button", { name: /^Bỏ chọn$/ })).toHaveCount(2);
  await tab2.close();
});

test("3. chuyển bộ — tấm trượt (390) và bảng thả xuống (1440) liệt kê bộ của nhà", async ({ page }) => {
  await vao(page, 390, 844, `/k/${d.giaDinhA.ma}/2`);
  await choLuoi(page);
  await expect(page.getByTestId("nut-ve-gia-dinh")).toHaveAttribute("href", `/k/${d.giaDinhA.ma}`);
  await page.getByTestId("nut-doi-buoi-chup").click();
  const tam = page.getByTestId("chuyen-bo-anh");
  await expect(tam).toBeVisible();
  const dongs = tam.getByTestId("dong-chuyen-bo");
  await expect(dongs).toHaveCount(2);
  await expect(tam.locator('[aria-current="page"]')).toContainText("Bé Mít · Thôi nôi");
  await expect(tam.locator('[aria-current="page"]')).toContainText("Đang xem");
  await page.waitForTimeout(400);
  await chup(page, "03-trong-bo-dt.png");

  // Bấm sang bộ kia → địa chỉ /k/<mã>/1, màn chọn ảnh của bộ 1.
  await tam.locator('a[data-testid="dong-chuyen-bo"]').click();
  await expect(page).toHaveURL(new RegExp(`/k/${d.giaDinhA.ma}/1$`), { timeout: 60_000 });
  await choLuoi(page);
  await expect(page.getByTestId("nut-doi-buoi-chup")).toContainText("Đầy tháng");

  // Máy tính.
  await vao(page, 1440, 900, `/k/${d.giaDinhA.ma}/2`);
  await choLuoi(page);
  // BB-405 — một lối "← Album gia đình" cho cả hai cỡ (tên bộ ngay dưới nó).
  await expect(page.getByTestId("nut-ve-gia-dinh")).toBeVisible();
  await page.getByTestId("nut-doi-buoi-chup").click();
  await expect(page.getByTestId("chuyen-bo-anh").getByTestId("dong-chuyen-bo")).toHaveCount(2);
  await page.waitForTimeout(400);
  await chup(page, "04-trong-bo-mt.png");

  // Về trang gia đình.
  await page.getByTestId("ve-trang-gia-dinh").click();
  await expect(page).toHaveURL(new RegExp(`/k/${d.giaDinhA.ma}$`), { timeout: 60_000 });
  await expect(page.getByTestId("trang-gia-dinh")).toBeVisible();
});

test("4. link cũ /g/<mã> vẫn chạy như cũ, thấy CHUNG lượt chọn chính (§1.3)", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${d.linkCuA1.ma}`);
    await choLuoi(page);
    await expect(page.getByTestId("the-anh")).toHaveCount(2);
    await expect(page.getByTestId("nut-doi-buoi-chup")).toHaveCount(0);
    await expect(page.getByTestId("nut-ve-gia-dinh")).toHaveCount(0);
    // Lượt chọn chính của A1 dùng chung: 2 tấm tab 1 đã chọn hiện ở đây.
    await expect(page.getByTestId("the-anh").getByRole("button", { name: /^Bỏ chọn$/ })).toHaveCount(2);

    const bo = await bamTim(page, 0, /^Bỏ chọn$/);
    expect(bo.status).toBe(200);
    expect(bo.req.headers()["x-bb-bo"]).toBeUndefined();
    expect(await anhDaChon(d.A1.id)).toHaveLength(1);
  } finally {
    await ctx.close();
  }
});
