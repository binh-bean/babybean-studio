/**
 * BB-317 — bảy mục P1 màn khách của báo cáo thẩm mỹ vòng 5 (K-a … K-g + Cảm xúc).
 * Đo bằng hình học thật trên trình duyệt (bounding box, computed style), không
 * đọc mã nguồn. Dữ liệu: tests/fixtures/danh-gia.ts ("Fixture DANHGIA5-…", dọn
 * theo chi nhánh ở afterAll). Chạy: MOCK_DRIVE_TRE=1 PW_PORT=3177 --workers=1.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { duLieuDanhGia5, donDep, type DuLieuDanhGia5 } from "../fixtures/danh-gia";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";

const DT = { width: 390, height: 844 };
const MT = { width: 1440, height: 900 };
const CAU_HAN_MUC = "Studio đang cập nhật số ảnh trong gói.";

let d: DuLieuDanhGia5;
test.setTimeout(120_000);
test.beforeAll(async () => {
  d = await duLieuDanhGia5();
});
test.afterAll(async () => {
  if (d) await donDep(d);
});

async function vao(page: Page, kt: { width: number; height: number }, token: string) {
  await page.setViewportSize(kt);
  await chanLh3TrenTrinhDuyet(page);
  await page.goto(`/g/${token}`);
  await page.locator("#dau-luoi-anh").first().waitFor({ state: "attached", timeout: 45_000 });
  await page.waitForTimeout(1200);
}
const denLuoi = (page: Page) =>
  page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));

test("K-a: thanh chốt nổi máy tính rộng theo nội dung, số đếm không bị cắt, viên phụ không giành chỗ", async ({ page }) => {
  await vao(page, MT, d.chinh.token);
  await denLuoi(page);
  const thanh = page.getByTestId("thanh-noi");
  await expect(thanh).toBeVisible();
  const dem = await page.getByTestId("dem-da-chon").evaluate((el) => {
    const p = el.parentElement!;
    return { cat: p.scrollWidth > p.clientWidth, chu: p.textContent ?? "" };
  });
  expect(dem.cat, `số đếm bị cắt: "${dem.chu}"`).toBe(false);
  expect(dem.chu.replace(/\s+/g, " ").trim()).toBe("17 / 15 tấm");
  const chu = (await thanh.innerText()).replace(/\s+/g, " ");
  expect(chu).not.toContain("…");
  expect(chu).toContain("Thêm 100.000");
  const hop = await thanh.locator("> div").first().boundingBox();
  expect(hop!.width).toBeGreaterThan(425); // vượt trần 420px cũ: rộng theo nội dung
});

test("K-c: Chốt danh sách cùng màu nút chính (mực) với Xác nhận, không còn hồng cam", async ({ page }) => {
  await vao(page, MT, d.chinh.token);
  await denLuoi(page);
  const nutChot = page.getByTestId("thanh-noi").getByRole("button", { name: "Chốt danh sách" });
  const nen = await nutChot.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(nen).toBe("rgb(46, 42, 39)");
  await nutChot.click();
  const xacNhan = page.getByRole("button", { name: "Xác nhận" });
  const nenXn = await xacNhan.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(nenXn).toBe(nen);
});

test("K-b: bìa điện thoại — ảnh sạch ~62% màn, chữ và nút ở dải kem BÊN DƯỚI, chip Lưu app không đè bìa", async ({ page }) => {
  await vao(page, DT, d.chinh.token);
  const anh = (await page.getByTestId("bia-khoi-anh").boundingBox())!;
  const chu = (await page.getByTestId("bia-khoi-chu").boundingBox())!;
  const nut = (await page
    .getByTestId("bia-bo-anh")
    .getByRole("button", { name: /Tiếp tục chọn|Bắt đầu chọn ảnh/ })
    .boundingBox())!;
  expect(anh.height / DT.height).toBeGreaterThan(0.5);
  expect(anh.height / DT.height).toBeLessThan(0.66);
  expect(chu.y, "khối chữ phải bắt đầu dưới đáy ảnh").toBeGreaterThanOrEqual(anh.y + anh.height - 1);
  expect(nut.y + nut.height, "nút chính trong màn đầu").toBeLessThanOrEqual(DT.height);
  const chong = await page.evaluate(() => {
    const anhEl = document.querySelector('[data-testid="bia-khoi-anh"]')!.getBoundingClientRect();
    const bia = document.querySelector('[data-testid="bia-bo-anh"]')!;
    return Array.from(bia.querySelectorAll("h1,p,button,a,span")).filter((e) => {
      if (!(e as HTMLElement).offsetParent) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < anhEl.bottom - 2 && r.bottom > anhEl.top + 2;
    }).length;
  });
  expect(chong, "chữ/nút đè lên ảnh bìa").toBe(0);
  const chip = page.getByTestId("goi-y-luu-app");
  if (await chip.count()) {
    const c = (await chip.boundingBox())!;
    const bia = (await page.getByTestId("bia-bo-anh").boundingBox())!;
    expect(c.y).toBeGreaterThanOrEqual(bia.y + bia.height - 1);
  }
});

test("K-f: đang chỉnh (điện thoại) có dòng Studio đang chỉnh ảnh của tên bé", async ({ page }) => {
  await vao(page, DT, d.dangChinh.token);
  const dong = page.getByTestId("bia-loi-chao");
  await expect(dong).toBeVisible();
  await expect(dong).toHaveText(/^Studio đang chỉnh ảnh của .+\.$/);
});

test("K-d: màn đã giao (máy tính) dùng cùng lưới bìa với K1 — ảnh ở cột PHẢI", async ({ page }) => {
  await vao(page, MT, d.chinh.token);
  const x1 = (await page.getByTestId("bia-khoi-anh").boundingBox())!;
  await vao(page, MT, d.daGiao.token);
  const x11 = (await page.getByTestId("bia-khoi-anh").boundingBox())!;
  const chu11 = (await page.getByTestId("dau-da-hoan-thien").boundingBox())!;
  expect(Math.abs(x11.x - x1.x), "mép trái ảnh bìa lệch giữa K1 và K11").toBeLessThanOrEqual(2);
  expect(Math.abs(x11.width - x1.width)).toBeLessThanOrEqual(2);
  expect(x11.x).toBeGreaterThan(MT.width / 2);
  expect(chu11.x).toBeLessThan(x11.x);
});

test("K-g: hạn mức chưa biết — nút mờ + aria-disabled, MỘT câu ≤ 12 chữ, thông báo nằm dưới hàng chip", async ({ page }) => {
  await vao(page, MT, d.hanMucChuaBiet.token);
  await denLuoi(page);
  const nut = page.getByTestId("thanh-noi").getByRole("button", { name: "Chốt danh sách" });
  await expect(nut).toHaveAttribute("aria-disabled", "true");
  expect(Number(await nut.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.7);
  await page.locator('button[aria-label="Chọn ảnh này"]').first().click();
  const tb = page.getByTestId("thong-bao-trang-thai");
  await expect(tb).toBeVisible();
  const chu = (await tb.innerText()).replace(/\s+/g, " ").replace("✕", "").trim();
  expect(chu).toBe(CAU_HAN_MUC);
  expect(chu.split(" ").length).toBeLessThanOrEqual(12);
  expect(chu).not.toMatch(/CSKH|liên hệ/);
  await page.waitForTimeout(400);
  const tbHop = (await tb.boundingBox())!;
  const dau = (await page.locator("#dau-luoi-anh").boundingBox())!;
  expect(tbHop.y, "thông báo che hàng chip lọc").toBeGreaterThanOrEqual(dau.y + dau.height - 1);
  // Bấm nút Chốt khi bị chặn: cùng một câu, không mở hộp chốt.
  await tb.getByRole("button").click();
  await nut.click({ force: true }); // aria-disabled: Playwright coi là không bấm được, khách thật vẫn bấm
  await expect(tb).toContainText(CAU_HAN_MUC);
  await expect(page.getByRole("heading", { name: /Chốt ảnh cho/ })).toHaveCount(0);
});

test("Cảm xúc: thanh dính điện thoại gọi tên bé không chen logo; hộp chốt gọi tên bé", async ({ page }) => {
  await vao(page, DT, d.chinh.token);
  await denLuoi(page);
  const ten = page.getByTestId("ten-be-thanh-dinh");
  await expect(ten).toBeVisible();
  await expect(ten).toHaveText("Nguyễn Ngọc Bảo An");
  const logo = (await page.getByTestId("ten-thuong-hieu-dinh").first().boundingBox())!;
  const tenHop = (await ten.boundingBox())!;
  expect(tenHop.y).toBeGreaterThanOrEqual(logo.y + logo.height - 1);
  await page.getByTestId("thanh-noi").getByRole("button", { name: "Chốt danh sách" }).click();
  await expect(page.getByRole("heading", { name: "Chốt ảnh cho bé Nguyễn Ngọc Bảo An" })).toBeVisible();
});
