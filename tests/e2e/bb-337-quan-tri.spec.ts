/**
 * BB-337 — Quản trị: tab "Khách gửi ảnh chọn" có đủ công cụ, chi tiết bộ ảnh có
 * "Xác nhận thanh toán", danh sách khách tải thêm được, trang chi tiết khách.
 *
 * Dữ liệu: tests/fixtures/danh-gia.ts ("Fixture DANHGIA5-…", dọn theo id KÈM chi
 * nhánh ở afterAll). Không bấm "Đồng bộ ngay" (sẽ ghi dữ liệu Lark thật vào bb-dev).
 * Không chụp màn có tên khách thật — chỉ chụp phần tử của bộ/khách Fixture.
 *
 * Chạy: PW_PORT=3203 npx playwright test tests/e2e/bb-337-quan-tri.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { duLieuDanhGia5, donDep, type DuLieuDanhGia5 } from "../fixtures/danh-gia";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

let d: DuLieuDanhGia5;
const THU_MUC = "test-results/bb-337";
fs.mkdirSync(THU_MUC, { recursive: true });
const PHIEN = path.join(THU_MUC, ".phien-owner.json");

test.setTimeout(150_000);

test.beforeAll(async () => {
  d = await duLieuDanhGia5();
});

test.afterAll(async () => {
  if (d) await donDep(d);
  fs.rmSync(PHIEN, { force: true });
});

async function mo(browser: Browser, baseURL: string, url: string, kt = { width: 1440, height: 900 }) {
  if (!fs.existsSync(PHIEN)) {
    const c0 = await browser.newContext({ baseURL });
    const p0 = await c0.newPage();
    await dangNhapNhanVien(p0, d.emailOwner, d.password);
    await c0.storageState({ path: PHIEN });
    await c0.close();
  }
  const ctx: BrowserContext = await browser.newContext({ baseURL, storageState: PHIEN, viewport: kt });
  const page: Page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return { page, ctx };
}

test("1. Khách gửi ảnh chọn: một dòng mỗi bộ, mở 'Xử lý' có đủ công cụ; xác nhận đợt 1 thì dòng rời mục", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "/admin/viec-can-xu-ly?tab=khach-mua-them");
  try {
    await expect(page.getByTestId("tab-khach-mua-them")).toContainText("Khách gửi ảnh chọn", { timeout: 30_000 });
    const dong = page.locator(`[data-testid="dong-khach-gui-anh-chon"][data-gallery-id="${d.daChot.id}"]`);
    await expect(dong).toHaveCount(1, { timeout: 30_000 });
    await expect(dong.getByTestId("cac-viec-cua-dong")).toContainText("Đợt 1: chờ xác nhận danh sách");

    await dong.getByTestId("nut-xu-ly-viec").click();
    const ngan = dong.getByTestId("ngan-xu-ly");
    await expect(ngan.getByTestId("khoi-dot-1")).toBeVisible();
    // Xác nhận thanh toán = đúng form BB-320 (ô Giảm giá %).
    await expect(ngan.getByTestId("khoi-thanh-toan").locator('input[name="giamGiaPhanTram"]')).toBeVisible({ timeout: 20_000 });
    await expect(ngan.getByRole("link", { name: "Tải danh sách ảnh đã chọn" })).toHaveAttribute(
      "href",
      `/api/admin/galleries/${d.daChot.id}/export`,
    );
    await expect(ngan.getByRole("button", { name: "Từ chối (lý do)" })).toBeVisible();
    await dong.screenshot({ path: path.join(THU_MUC, "dong-khach-gui-anh-chon.png") });

    await ngan.getByTestId("nut-xac-nhan-dot-1").click();
    await expect(page.locator(`[data-testid="dong-khach-gui-anh-chon"][data-gallery-id="${d.daChot.id}"]`)).toHaveCount(0, {
      timeout: 20_000,
    });
    const { rows } = await d.pg.query(`select status from galleries where id = $1`, [d.daChot.id]);
    expect(rows[0].status).toBe("in_retouch");
  } finally {
    await ctx.close();
  }
});

test("2. Chi tiết bộ ảnh CHƯA phát sinh tiền vẫn có 'Xác nhận thanh toán'; #thanh-toan cuộn tới đúng khối", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, `/admin/galleries/${d.phu.id}#thanh-toan`);
  try {
    const khoi = page.getByTestId("khoi-thanh-toan-chi-tiet");
    await expect(khoi).toBeVisible({ timeout: 30_000 });
    await expect(khoi).toContainText("Xác nhận thanh toán");
    await expect(khoi.locator('input[name="giamGiaPhanTram"]')).toBeVisible();
    await expect(khoi).toBeInViewport({ timeout: 10_000 });
    await khoi.screenshot({ path: path.join(THU_MUC, "chi-tiet-xac-nhan-thanh-toan.png") });
  } finally {
    await ctx.close();
  }
});

test("3. Danh sách khách: báo số đang hiện / tổng, 'Tải thêm khách' nối thêm trang sau", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "/admin/customers");
  try {
    const dem = page.getByTestId("dem-khach");
    await expect(dem).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("nut-dong-bo-khach")).toBeVisible();
    const { rows } = await d.pg.query(`select count(*)::int n from customers`);
    const tongDb = rows[0].n as number;
    const hang = page.locator("table tbody tr");
    await expect(hang.first()).toBeVisible({ timeout: 30_000 });
    // Tổng trên màn = số khách trong các chi nhánh người xem được phép (≤ toàn DB).
    const tong = Number(((await dem.innerText()).match(/tổng ([\d.]+)|đủ ([\d.]+)/) ?? []).slice(1).find(Boolean)?.replace(/\./g, ""));
    expect(tong).toBeGreaterThan(0);
    // Không so khít với `tongDb`: hai đội khác dựng/dọn fixture trên cùng DB trong lúc chạy.
    await expect(hang).toHaveCount(Math.min(50, tong));
    if (tong > 50) {
      await page.getByTestId("nut-tai-them-khach").click();
      await expect(hang).toHaveCount(Math.min(100, tong), { timeout: 20_000 });
    }
    console.log(`[bb-337] khách trong DB: ${tongDb}; tổng người xem được: ${tong}; đang hiện sau một lần tải thêm: ${await hang.count()}`);
  } finally {
    await ctx.close();
  }
});

test("4. Trang chi tiết khách: lịch sử chụp, lịch sử mua, tổng giá trị, lượt ghé, khung 'sắp có'", async ({ browser, baseURL }) => {
  const { rows } = await d.pg.query(`select customer_id from galleries where id = $1`, [d.daGiao.id]);
  const khachId = rows[0].customer_id as string;
  const { page, ctx } = await mo(browser, baseURL!, `/admin/customers/${khachId}`);
  try {
    const trang = page.getByTestId("trang-khach-hang");
    await expect(trang).toBeVisible({ timeout: 30_000 });
    await expect(trang.getByTestId("dong-lich-su-chup")).toHaveCount(1);
    await expect(trang.getByTestId("lich-su-chup")).toContainText("Đã giao");
    await expect(trang.getByTestId("tong-gia-tri-khach")).toBeVisible();
    // Fixture chụp "current_date - 20" → năm nay có 1 lượt ghé.
    await expect(trang.getByTestId("luot-ghe-nam-nay")).toContainText("1");
    await expect(trang.getByTestId("khung-link-gia-dinh")).toContainText("sắp có");
    await expect(trang.getByTestId("lich-su-mua")).toBeVisible();
    await trang.screenshot({ path: path.join(THU_MUC, "trang-khach-hang.png") });
  } finally {
    await ctx.close();
  }
});
