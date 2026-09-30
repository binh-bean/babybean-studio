/**
 * BB-328 — trang gốc "/" và màn đăng nhập.
 *
 * Canh:
 *  1. Chi nhánh do phép thử dựng ("Fixture …") KHÔNG hiện cho khách. Lỗi thật
 *     29/09: trang gốc liệt kê "Fixture DANHGIA5-… Chi nhánh".
 *  2. "Nhân viên đăng nhập" ở đầu trang dẫn tới /login. BB-331: nút nhỏ kiểu
 *     kính mờ (nền trong mờ + backdrop-blur), và thẻ "Nhân viên studio" ở cột
 *     phải đã bị bỏ theo yêu cầu anh. Tiêu đề lớn là "Yours truly, Bean".
 *  3. "Nhắn tin cho studio" là nút viền nhẹ (nền trong suốt), không phải khối
 *     màu mực như trước.
 *  4. Màn đăng nhập có lối quay về trang chủ.
 *
 * Fixture: MỘT chi nhánh giả "Fixture BB-328-<run> Chi nhánh", đang hoạt
 * động, dọn theo đúng id trong afterAll.
 *
 * Ảnh chụp (tuỳ chọn): đặt BB328_CHUP=<thư mục> để lưu ảnh 390×844 và
 * 1440×900. Tên + địa chỉ chi nhánh được thay bằng chữ mẫu trước khi chụp.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import path from "node:path";

const runId = Math.random().toString(36).slice(2, 8);
const TEN_FIXTURE = `Fixture BB-328-${runId} Chi nhánh`;
const CHUP = process.env.BB328_CHUP;

async function chup(page: Page, ten: string) {
  if (!CHUP) return;
  await page.evaluate(() => {
    document.querySelectorAll('[data-testid="ds-chi-nhanh"] li').forEach((li, i) => {
      const h = li.querySelector("h3");
      const p = li.querySelector("p");
      if (h) h.textContent = `Chi nhánh Mẫu ${i + 1}`;
      if (p) p.textContent = `${12 + i * 22} Đường Mẫu`;
    });
  });
  await page.screenshot({ path: path.join(CHUP, `${ten}.png`), fullPage: true });
}

test.describe("BB-328: trang gốc + đăng nhập nhân viên", () => {
  let pg: Client;
  let branchId = "";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const { rows } = await pg.query(
      `insert into branches (code, name, address, is_active) values ($1,$2,$3,true) returning id`,
      [`FIXTURE-BB328-${runId}`, TEN_FIXTURE, "1 Đường Giả"],
    );
    branchId = rows[0].id;
  });

  test.afterAll(async () => {
    if (branchId) await pg.query("delete from branches where id = $1", [branchId]).catch(() => {});
    const { rows } = await pg.query("select count(*)::int n from branches where id = $1", [branchId]);
    expect(rows[0].n).toBe(0);
    await pg.end();
  });

  for (const [ten, kich] of [
    ["mt", { width: 390, height: 844 }],
    ["dt", { width: 1440, height: 900 }],
  ] as const) {
    test(`trang gốc (${ten})`, async ({ page }) => {
      await page.setViewportSize(kich);
      await page.goto("/");

      // 1. Có danh sách chi nhánh thật, nhưng không có chi nhánh fixture.
      await expect(page.getByTestId("ds-chi-nhanh")).toBeVisible();
      await expect(page.getByTestId("ds-chi-nhanh").locator("li").first()).toBeVisible();
      await expect(page.getByText(TEN_FIXTURE)).toHaveCount(0);
      await expect(page.getByTestId("ds-chi-nhanh").getByText(/^Fixture/i)).toHaveCount(0);

      // 2. Một lối vào cho nhân viên ở góc phải, kiểu kính mờ (BB-331).
      const dau = page.getByTestId("nut-nhan-vien-dau-trang");
      await expect(dau).toBeVisible();
      await expect(dau).toHaveText("Nhân viên đăng nhập");
      await expect(dau).toHaveAttribute("href", "/login");
      const kieu = await dau.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          blur: cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter || "",
          nen: cs.backgroundColor,
          cao: el.getBoundingClientRect().height,
        };
      });
      expect(kieu.blur).toContain("blur");
      // Nền bán trong suốt: alpha < 1 (rgba(…, a) hoặc color(… / a)), không phải khối đặc.
      const alpha = Number(kieu.nen.match(/[,/]\s*([\d.]+)\)$/)?.[1] ?? "1");
      expect(alpha).toBeLessThan(1);
      expect(kieu.cao).toBeLessThanOrEqual(34);
      // Thẻ "Nhân viên studio" anh gạch bỏ đã không còn.
      await expect(page.getByTestId("loi-vao-nhan-vien")).toHaveCount(0);
      await expect(page.getByText("Nhân viên studio", { exact: true })).toHaveCount(0);
      // Tiêu đề mới, Playfair, không nghiêng.
      const h1 = page.getByTestId("tieu-de-trang-chu");
      await expect(h1).toHaveText("Yours truly, Bean");
      const phong = await h1.evaluate((el) => ({ f: getComputedStyle(el).fontFamily, s: getComputedStyle(el).fontStyle }));
      expect(phong.f).toMatch(/Playfair/i);
      expect(phong.s).toBe("normal");

      // 3. Nút nhắn tin (nếu đã cấu hình) là nút viền, nền trong suốt.
      const nhan = page.getByTestId("nut-nhan-studio");
      if (await nhan.count()) {
        const nen = await nhan.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(nen).toBe("rgba(0, 0, 0, 0)");
      }

      // Không cuộn ngang ở khổ điện thoại.
      const tran = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(tran).toBeLessThanOrEqual(0);

      await chup(page, `trang-chu-${ten}`);
    });
  }

  test("màn đăng nhập có lối về trang chủ", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByTestId("nut-nhan-vien-dau-trang").click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /đăng nhập/i })).toBeVisible();
    const ve = page.getByRole("link", { name: "Về trang chủ" });
    await expect(ve).toBeVisible();
    await chup(page, "dang-nhap-mt");
    await page.setViewportSize({ width: 1440, height: 900 });
    await chup(page, "dang-nhap-dt");
    await ve.click();
    await expect(page).toHaveURL(/\/$/);
  });
});
