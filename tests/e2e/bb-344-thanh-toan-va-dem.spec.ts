/**
 * BB-344 — (1) khối "Xác nhận thanh toán" ở chi tiết bộ ảnh: bộ không phát sinh tiền thì nút
 * khoá + "Chưa phát sinh tiền cần thu"; bộ vượt hạn mức thì nút dùng được; (2) khối "Cần xử lý
 * ngay" ở Bàn làm việc có dòng "Khách gửi ảnh chọn" cùng số với tab cùng tên, bấm mở đúng tab.
 *
 * Dữ liệu: tests/fixtures/bb-344.ts ("Fixture BB-344-…", dọn theo id KÈM chi nhánh ở afterAll).
 * Không chụp tên khách thật. Không gọi Lark.
 *
 * Chạy: PW_PORT=3210 npx playwright test tests/e2e/bb-344-thanh-toan-va-dem.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { duLieuBB344, donDepBB344, type DuLieuBB344 } from "../fixtures/bb-344";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

let d: DuLieuBB344;
const THU_MUC = "test-results/bb-344";
fs.mkdirSync(THU_MUC, { recursive: true });
const PHIEN = path.join(THU_MUC, ".phien-owner.json");

test.setTimeout(150_000);

test.beforeAll(async () => {
  d = await duLieuBB344({ coNhanSu: true });
});

test.afterAll(async () => {
  if (d) {
    const con = await donDepBB344(d);
    expect(con).toEqual({ conBo: 0, conChiNhanh: 0 });
  }
  fs.rmSync(PHIEN, { force: true });
});

async function mo(browser: Browser, baseURL: string, url: string, kt = { width: 1440, height: 900 }) {
  if (!fs.existsSync(PHIEN)) {
    const c0 = await browser.newContext({ baseURL });
    const p0 = await c0.newPage();
    await dangNhapNhanVien(p0, d.emailOwner!, d.password);
    await c0.storageState({ path: PHIEN });
    await c0.close();
  }
  const ctx: BrowserContext = await browser.newContext({ baseURL, storageState: PHIEN, viewport: kt });
  const page: Page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return { page, ctx };
}

test("1. Bộ không phát sinh tiền: khối thanh toán hiện nhưng nút khoá, có câu 'Chưa phát sinh tiền cần thu'", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, `/admin/galleries/${d.khongPhatSinh}#thanh-toan`);
  try {
    const khoi = page.getByTestId("khoi-thanh-toan-chi-tiet");
    await expect(khoi).toBeVisible({ timeout: 30_000 });
    await expect(khoi.getByTestId("chua-phat-sinh-tien")).toHaveText("Chưa phát sinh tiền cần thu");
    await expect(khoi.getByRole("button", { name: "Ghi nhận đã thu" })).toBeDisabled();
    await expect(khoi.locator('input[name="amount"]')).toBeDisabled();
    await expect(khoi.locator('input[name="giamGiaPhanTram"]')).toBeDisabled();
    await khoi.screenshot({ path: path.join(THU_MUC, "khong-phat-sinh-nut-khoa.png") });
  } finally {
    await ctx.close();
  }
});

test("2. Bộ vượt hạn mức: nút dùng được; ghi thu đủ xong thì khối khoá lại (còn phải thu 0)", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, `/admin/galleries/${d.vuotHanMuc}#thanh-toan`);
  try {
    const khoi = page.getByTestId("khoi-thanh-toan-chi-tiet");
    await expect(khoi).toBeVisible({ timeout: 30_000 });
    await expect(khoi.getByTestId("chua-phat-sinh-tien")).toHaveCount(0);
    const nut = khoi.getByRole("button", { name: "Ghi nhận đã thu" });
    await expect(nut).toBeEnabled({ timeout: 15_000 });
    await expect(khoi.locator('input[name="amount"]')).toHaveValue("300000");
    await khoi.screenshot({ path: path.join(THU_MUC, "vuot-han-muc-nut-dung-duoc.png") });

    await nut.click();
    await expect(page.getByText("Khách đã trả đủ")).toBeVisible({ timeout: 20_000 });
    await expect(khoi.getByTestId("chua-phat-sinh-tien")).toBeVisible({ timeout: 20_000 });
    await expect(khoi.getByRole("button", { name: "Ghi nhận đã thu" })).toBeDisabled();
    const { rows } = await d.pg.query(`select amount::int a from gallery_payments where gallery_id = $1`, [d.vuotHanMuc]);
    expect(rows).toEqual([{ a: 300000 }]);
  } finally {
    await ctx.close();
  }
});

test("3. Bàn làm việc: dòng 'Khách gửi ảnh chọn' cùng số với tab, bấm mở đúng tab", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "/admin");
  try {
    const dong = page.getByTestId("can-xu-ly-ngay-rows").getByRole("link", { name: /Khách gửi ảnh chọn/ });
    await expect(dong).toBeVisible({ timeout: 40_000 });
    const soTrenKhoi = Number((await dong.innerText()).replace(/\D/g, ""));
    expect(soTrenKhoi).toBeGreaterThanOrEqual(3); // ba bộ của fixture

    await dong.click();
    await expect(page).toHaveURL(/\/admin\/viec-can-xu-ly\?tab=khach-mua-them/, { timeout: 20_000 });
    await expect(page.getByTestId("tab-khach-mua-them")).toContainText("Khách gửi ảnh chọn", { timeout: 30_000 });
    const dongTab = page.locator('[data-testid="dong-khach-gui-anh-chon"]');
    await expect(dongTab.first()).toBeVisible({ timeout: 30_000 });
    for (const id of [d.vuotHanMuc, d.dotA, d.dotB]) {
      await expect(page.locator(`[data-testid="dong-khach-gui-anh-chon"][data-gallery-id="${id}"]`)).toHaveCount(1);
    }
    // Cùng một số. bb-dev dùng chung với các đội khác (họ dựng/dọn fixture liên tục) nên hai lượt
    // gọi có thể rơi vào hai thời điểm: hỏi cả hai CÙNG LÚC và thử lại tới khi không có ai chen ngang.
    await expect
      .poll(
        async () => {
          const [a, b] = await Promise.all([
            ctx.request.get("/api/admin/can-xu-ly").then((r) => r.json()),
            ctx.request.get("/api/admin/reports/dot-chon-cho-xac-nhan").then((r) => r.json()),
          ]);
          return (a.data.khachGuiAnhChon as number) - (b.data.boAnh as unknown[]).length;
        },
        { timeout: 30_000, intervals: [500, 1000, 2000] },
      )
      .toBe(0);
  } finally {
    await ctx.close();
  }
});

test("4. Bàn làm việc: có khách xin mở lại thì hiện dòng 'Khách xin mở lại', bấm mở tab 'Yêu cầu mở lại'", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "about:blank");
  try {
    // Giả lập ở BIÊN mạng (không giả lập hook): lấy đáp trả thật rồi đặt choMoLai = 2.
    await page.route("**/api/admin/can-xu-ly", async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      json.data.choMoLai = 2;
      await route.fulfill({ response: res, json });
    });
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    const dong = page.getByTestId("can-xu-ly-ngay-rows").getByRole("link", { name: /Khách xin mở lại/ });
    await expect(dong).toBeVisible({ timeout: 40_000 });
    await expect(dong).toContainText("2");
    await dong.click();
    await expect(page).toHaveURL(/\/admin\/viec-can-xu-ly\?tab=yeu-cau-mo-lai/, { timeout: 20_000 });
  } finally {
    await ctx.close();
  }
});
