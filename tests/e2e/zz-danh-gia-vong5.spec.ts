/**
 * ĐÁNH GIÁ THẨM MỸ VÒNG 5 (BB-316) — chỉ để chụp màn hình cho người chấm.
 *
 * 24 màn (K1–K12 khách, Q1–Q12 quản trị) × 2 khổ (dt 390×844, mt 1440×900).
 * Mỗi ảnh là MỘT ca riêng: một ca hỏng không làm dừng ca sau.
 * Dữ liệu: tests/fixtures/danh-gia.ts ("Fixture DANHGIA5-…", dọn theo id).
 * Ảnh ra: babybean-assets/DANHGIA5/chup/. Chạy: PW_PORT=3176 --workers=1.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page, Browser, BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { duLieuDanhGia5, donDep, cheTrongDom, tenNhanVienThat, type DuLieuDanhGia5 } from "../fixtures/danh-gia";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { tickHopChotDot1 } from "./helpers/tick-hop-chot-dot1";

const DIR = process.env.DANHGIA_RA ?? "C:\\Users\\binh\\Downloads\\claude code\\babybean-assets\\DANHGIA5\\chup";
fs.mkdirSync(DIR, { recursive: true });
const NHAT_KY = path.join(DIR, "nhat-ky.txt");
const ghi = (s: string) => fs.appendFileSync(NHAT_KY, s + "\n");

const KT = {
  dt: { width: 390, height: 844 },
  mt: { width: 1440, height: 900 },
} as const;
type Kt = keyof typeof KT;

let d: DuLieuDanhGia5;
const stateFile = (vai: string) => path.join(DIR, `.phien-${vai}.json`);

test.use({ actionTimeout: 15_000 });
test.setTimeout(120_000);

test.beforeAll(async () => {
  fs.writeFileSync(NHAT_KY, `chạy ${new Date().toISOString()}\n`);
  d = await duLieuDanhGia5();
  ghi(`fixture xong run=${d.runId}`);
});

test.afterAll(async () => {
  if (!d) return;
  const { conFixture } = await donDep(d);
  ghi(`dọn xong, còn ${conFixture} bộ ảnh Fixture DANHGIA5`);
  for (const v of ["ql", "owner"]) fs.rmSync(stateFile(v), { force: true });
});

/** Chờ mọi <img> đang thấy được tải xong; ghi nhận số ảnh hỏng. */
async function choAnh(page: Page, ten: string) {
  await page
    .waitForFunction(
      () => {
        const imgs = Array.from(document.images).filter((i) => {
          const r = i.getBoundingClientRect();
          return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < innerHeight;
        });
        return imgs.every((i) => i.complete);
      },
      undefined,
      { timeout: 25_000 },
    )
    .catch(() => ghi(`${ten}: hết giờ chờ ảnh`));
  const hong = await page.evaluate(
    () =>
      Array.from(document.images).filter((i) => {
        const r = i.getBoundingClientRect();
        return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < innerHeight && i.complete && i.naturalWidth === 0;
      }).length,
  );
  if (hong) ghi(`${ten}: ${hong} ảnh hỏng trong khung nhìn`);
  await page.waitForTimeout(700);
}

async function chup(page: Page, ten: string, k: Kt) {
  await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
  await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
  await choAnh(page, `${ten}-${k}`);
  // BB-318 (Q-a): phần tử vượt mép phải khung chứa (loại trừ vùng tự cuộn ngang có chủ đích).
  const tran = await page.evaluate(() => {
    const goc = document.querySelector("main") ?? document.body;
    const gioiHan = Math.min(goc.getBoundingClientRect().right, window.innerWidth);
    const ra: string[] = [];
    const trongVungCuon = (el: Element) => {
      for (let p: Element | null = el.parentElement; p && p !== goc; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      return false;
    };
    goc.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      if (r.right > gioiHan + 1 && !trongVungCuon(el)) {
        ra.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}>${Math.round(gioiHan)}`);
      }
    });
    return { ra: ra.slice(0, 8), n: ra.length, docTran: document.documentElement.scrollWidth - window.innerWidth, mainTran: goc.scrollWidth - goc.clientWidth };
  });
  ghi(`TRÀN ${ten}-${k}: ${tran.n} phần tử; document +${tran.docTran}px; main +${tran.mainTran}px ${tran.ra.join(" | ")}`);
  await page.screenshot({ path: path.join(DIR, `${ten}-${k}.png`) });
  ghi(`CHỤP ${ten}-${k}.png`);
}

/** Bộ chính bị các ca trước (K06 thêm giỏ, K08 chọn bìa) ghi đè -> đặt lại đúng dữ liệu gốc. */
async function datLaiChinh() {
  await d.pg.query(`delete from album_covers where gallery_id = $1`, [d.chinh.id]);
  const { rows } = await d.pg.query(`select id from selections where gallery_id = $1`, [d.chinh.id]);
  const selId = rows[0]?.id as string | undefined;
  if (!selId) return;
  await d.pg.query(`delete from selection_addons where selection_id = $1`, [selId]);
  await d.pg.query(
    `insert into selection_addons (selection_id, product_id, quantity, unit_price)
     select $1, id, 3, 20000 from products where is_active and kind='print' and material='UV' and size='10x15' limit 1`,
    [selId],
  );
}

async function vaoBo(page: Page, k: Kt, token: string) {
  if (token === d.chinh.token) await datLaiChinh();
  await page.setViewportSize(KT[k]);
  await chanLh3TrenTrinhDuyet(page);
  await page.goto(`/g/${token}`);
  await page.waitForLoadState("domcontentloaded");
  await page.locator("#dau-luoi-anh").first().waitFor({ state: "attached", timeout: 45_000 });
  await page.waitForTimeout(1200);
}

const denLuoi = (page: Page) =>
  page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));

async function cuonToiAnh(page: Page, so: number) {
  const dich = page.locator(`[data-testid="the-anh"] button[aria-label="Xem ảnh ${so}"]`);
  for (let lan = 0; lan < 40; lan++) {
    if (await dich.count()) {
      await dich.first().evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -150));
      await page.waitForTimeout(600);
      return;
    }
    await page.evaluate(() => window.scrollBy(0, 1800));
    await page.waitForTimeout(350);
  }
  throw new Error(`không cuộn tới được ảnh ${so}`);
}

// ---------------------------------------------------------------------------
// Đăng nhập nhân viên dùng lại phiên (tránh bị chặn tốc độ đăng nhập)
// ---------------------------------------------------------------------------
async function phienNhanVien(browser: Browser, baseURL: string, vai: "ql" | "owner"): Promise<BrowserContext> {
  const file = stateFile(vai);
  if (!fs.existsSync(file)) {
    const ctx = await browser.newContext({ baseURL });
    const p = await ctx.newPage();
    await dangNhapNhanVien(p, vai === "ql" ? d.emailQl : d.emailOwner, d.password);
    await ctx.storageState({ path: file });
    await ctx.close();
  }
  return browser.newContext({ baseURL, storageState: file });
}

async function trangQuanTri(
  browser: Browser,
  baseURL: string,
  vai: "ql" | "owner",
  k: Kt,
  url: string,
): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await phienNhanVien(browser, baseURL, vai);
  const page = await ctx.newPage();
  await page.setViewportSize(KT[k]);
  await chanLh3TrenTrinhDuyet(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return { page, ctx };
}

/**
 * Danh sách nhân sự bb-dev chứa TÊN + EMAIL THẬT: thay bằng dữ liệu mẫu trước khi chụp.
 * BB-359: che theo DANH SÁCH tên nhân sự thật (không theo "@") — xem `cheTrongDom`.
 */
async function cheNhanVienThat(page: Page) {
  const tenThat = await tenNhanVienThat();
  const daChe = await page.evaluate(
    ([maHam, ds]) => {
      const fn = new Function(`return (${maHam})`)() as (r: HTMLElement, t: string[]) => number;
      return fn(document.body, ds);
    },
    [cheTrongDom.toString(), tenThat] as [string, string[]],
  );
  ghi(`Q09: đã che ${daChe} dòng nhân sự thật`);
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// MÀN KHÁCH
// ---------------------------------------------------------------------------
for (const k of ["dt", "mt"] as Kt[]) {
  test(`K01 bìa — ${k}`, async ({ page }) => {
    await vaoBo(page, k, d.chinh.token);
    await page.locator('img[fetchpriority="high"]').first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    await chup(page, "K01-bia", k);
  });

  test(`K02 lưới đầu — ${k}`, async ({ page }) => {
    await vaoBo(page, k, d.chinh.token);
    await denLuoi(page);
    await chup(page, "K02-luoi-dau", k);
  });

  test(`K03 lưới giữa — ${k}`, async ({ page }) => {
    await vaoBo(page, k, d.chinh.token);
    await denLuoi(page);
    await cuonToiAnh(page, 296);
    await chup(page, "K03-luoi-giua", k);
  });

  test(`K04 xem lớn dọc — ${k}`, async ({ page }) => {
    await vaoBo(page, k, d.chinh.token);
    await denLuoi(page);
    await page.getByTestId("the-anh").nth(0).getByRole("button", { name: /^Xem ảnh 1$/ }).click();
    await page.getByRole("dialog").first().waitFor({ state: "visible" });
    await page.waitForTimeout(800);
    await chup(page, "K04-xem-doc", k);
  });

  test(`K05 xem lớn ngang + ghi chú — ${k}`, async ({ page }) => {
    await vaoBo(page, k, d.chinh.token);
    await denLuoi(page);
    await page.getByTestId("the-anh").getByRole("button", { name: /^Xem ảnh 2$/ }).click();
    const dlg = page.getByRole("dialog").first();
    await dlg.waitFor({ state: "visible" });
    await page.waitForTimeout(800);
    if (k === "dt") {
      // Điện thoại: ô ghi chú nằm trong tấm trượt, mở bằng nút "Ghi chú" (opacity 0 vẫn "visible" với Playwright).
      await dlg.getByRole("button", { name: "Ghi chú cho thợ chỉnh ảnh" }).click();
      await page.waitForTimeout(900);
    }
    await chup(page, "K05-xem-ngang-ghi-chu", k);
  });

  test(`K06 cửa hàng sau thêm vào giỏ — ${k}`, async ({ page }) => {
    await vaoBo(page, k, d.chinh.token);
    await denLuoi(page);
    await page.getByRole("button", { name: /Mua thêm/ }).first().click();
    const ch = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
    await ch.waitFor({ state: "visible" });
    await page.waitForTimeout(800);
    // BB-361 (từ vòng 8a): khối "Trong gói" có nút aria "Chọn ảnh trong gói…" — bấm ĐÚNG nút "Chọn ảnh" của sản phẩm.
    await ch.getByRole("button", { name: "Chọn ảnh", exact: true }).last().click();
    const lc = page.getByRole("dialog", { name: "Chọn ảnh để đặt in" });
    await lc.waitFor({ state: "visible" });
    const a = lc.locator("button:has(img)");
    for (let i = 0; i < Math.min(3, await a.count()); i++) await a.nth(i).click();
    await lc.getByRole("button", { name: /^Xong/ }).click();
    await lc.waitFor({ state: "hidden" });
    const them = ch.getByRole("button", { name: /^Thêm vào giỏ/ }).first();
    if (await them.isVisible().catch(() => false)) await them.click();
    await ch.getByText("Đã thêm vào giỏ").first().waitFor({ state: "visible", timeout: 15_000 });
    await chup(page, "K06-cua-hang-gio", k);
    await page.waitForTimeout(2000);
    await datLaiChinh();
  });

  const moHopChot = async (page: Page) => {
    await denLuoi(page);
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await page.waitForTimeout(900);
  };

  test(`K07 hộp chốt thiếu bìa — ${k}`, async ({ page }) => {
    await vaoBo(page, k, d.chinh.token);
    await moHopChot(page);
    await page.getByTestId("loi-nhac-hop-chot").waitFor({ state: "visible" });
    await chup(page, "K07-chot-thieu-bia", k);
  });

  test(`K08 hộp chốt đủ điều kiện vượt 2 tấm — ${k}`, async ({ page }) => {
    await vaoBo(page, k, d.chinh.token);
    await page.getByText("Chọn ảnh bìa album").first().scrollIntoViewIfNeeded();
    await page.locator('button[aria-label^="Chọn ảnh bìa"]').first().click();
    await page.waitForTimeout(1500);
    await moHopChot(page);
    await page.fill("#confirm-name-input", "Mẹ Lan");
    await tickHopChotDot1(page); // BB-361 (từ vòng 8a): hộp chốt có 2–3 ô bắt buộc (BB-321)
    await page.waitForTimeout(500);
    if (k === "dt") {
      await page.mouse.move(195, 500);
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(500);
    }
    await chup(page, "K08-chot-du-dieu-kien", k);
  });

  test(`K09 cảm ơn sau chốt — ${k}`, async ({ page }) => {
    // Bộ này chỉ chốt được MỘT lần; khổ thứ hai dùng lại bằng cách mở lại trạng thái ready.
    await d.pg.query(`update galleries set status='ready' where id=$1`, [d.choChot.id]);
    await d.pg.query(
      `delete from selection_items where gallery_id=$1; update selections set submitted_at=null where gallery_id=$1`,
      [d.choChot.id],
    ).catch(async () => {
      await d.pg.query(`delete from selection_items where gallery_id=$1`, [d.choChot.id]);
      await d.pg.query(`update selections set submitted_at=null where gallery_id=$1`, [d.choChot.id]);
    });
    await vaoBo(page, k, d.choChot.token);
    await denLuoi(page);
    const nut = page.locator('button[aria-label="Chọn ảnh này"]');
    for (let i = 0; i < 6; i++) {
      await nut.first().click();
      await page.waitForTimeout(300);
    }
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await page.fill("#confirm-name-input", "Mẹ Bơ");
    await tickHopChotDot1(page); // BB-361 (từ vòng 8a): hộp chốt có 2–3 ô bắt buộc (BB-321)
    const xn = page.getByRole("button", { name: "Xác nhận" });
    await expect(xn).toBeEnabled({ timeout: 20_000 });
    await xn.click();
    await page.getByText("Cảm ơn ba mẹ đã chọn từng khoảnh khắc").first().waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(1500);
    await chup(page, "K09-cam-on", k);
  });

  test(`K10 đang chỉnh — ${k}`, async ({ page }) => {
    await vaoBo(page, k, d.dangChinh.token);
    await chup(page, "K10-dang-chinh", k);
  });

  test(`K11 đã giao — ${k}`, async ({ page }) => {
    await vaoBo(page, k, d.daGiao.token);
    await page.evaluate((y) => window.scrollBy(0, y), k === "dt" ? 380 : 120);
    await page.waitForTimeout(600);
    await chup(page, "K11-da-giao", k);
  });

  test(`K12 chân trang + chưa biết hạn mức — ${k}`, async ({ page }) => {
    await vaoBo(page, k, d.hanMucChuaBiet.token);
    await denLuoi(page);
    // Thả tim để hiện câu chặn, rồi xuống chân trang: một khung hình có cả hai.
    await page.locator('button[aria-label="Chọn ảnh này"]').first().click();
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);
    await chup(page, "K12-chan-trang-han-muc", k);
  });
}

// ---------------------------------------------------------------------------
// MÀN QUẢN TRỊ
// ---------------------------------------------------------------------------
for (const k of ["dt", "mt"] as Kt[]) {
  test(`Q01 đăng nhập — ${k}`, async ({ page }) => {
    await page.setViewportSize(KT[k]);
    await page.goto("/login");
    await page.waitForTimeout(1500);
    await chup(page, "Q01-dang-nhap", k);
  });

  const trang: [string, string, "ql" | "owner", () => string][] = [
    ["Q02-bang-dieu-khien", "Q02", "ql", () => `/admin?branchId=${d.branchId}`],
    ["Q03-danh-sach-bo-anh", "Q03", "ql", () => "/admin/galleries"],
    ["Q04-chi-tiet-da-chot", "Q04", "ql", () => `/admin/galleries/${d.daChot.id}`],
    ["Q06-viec-can-xu-ly", "Q06", "ql", () => "/admin/viec-can-xu-ly"],
    ["Q07-khach-hang", "Q07", "ql", () => "/admin/customers"],
    ["Q08-cai-dat", "Q08", "owner", () => "/admin/settings"],
    ["Q09-nhan-su-vai-tro", "Q09", "owner", () => "/admin/staff"],
    ["Q10-bao-cao", "Q10", "ql", () => "/admin/bao-cao"],
    ["Q11-khong-co-quyen", "Q11", "ql", () => "/admin/staff"],
  ];
  for (const [ten, ma, vai, url] of trang) {
    test(`${ma} — ${k}`, async ({ browser, baseURL }) => {
      const { page, ctx } = await trangQuanTri(browser, baseURL!, vai, k, url());
      try {
        if (ma === "Q06") {
          await page.getByRole("tab", { name: /Ảnh vượt hạn mức/ }).click().catch(async () => {
            await page.getByText("Ảnh vượt hạn mức").first().click();
          });
          await page.waitForTimeout(1500);
          // BB-318: ĐO trước khi đưa về mép trái — sau khi bấm tab, có phần tử nào (kể cả cả trang / <main>) trượt ngang không?
          const truot = await page.evaluate(() => {
            const ra: string[] = [];
            if (window.scrollX > 0) ra.push(`window.scrollX=${window.scrollX}`);
            document.querySelectorAll("*").forEach((el) => {
              if (el.scrollLeft > 0) ra.push(`${el.tagName.toLowerCase()}[${el.getAttribute("role") ?? ""}].scrollLeft=${el.scrollLeft}`);
            });
            return ra;
          });
          ghi(`${ten}-${k}: sau khi bấm tab, phần tử trượt ngang = ${truot.length ? truot.join("; ") : "không có"}`);
          // Bấm tab làm cả trang trượt ngang (ghi nhận): đưa trang về mép trái, để nguyên dải tab.
          await page.evaluate(() => {
            window.scrollTo(0, 0);
            document.querySelectorAll("*").forEach((el) => {
              if (el.scrollLeft > 0 && el.getAttribute("role") !== "tablist") el.scrollLeft = 0;
            });
          });
          await page.waitForTimeout(400);
        }
        if (ma === "Q09") await cheNhanVienThat(page);
        await chup(page, ten, k);
      } finally {
        await ctx.close();
      }
    });
  }

  test(`Q05 trình thiết kế bìa — ${k}`, async ({ browser, baseURL }) => {
    const { page, ctx } = await trangQuanTri(browser, baseURL!, "ql", k, `/admin/galleries/${d.chinh.id}`);
    try {
      await page
        .locator("button:has-text('Đổi bìa'), button:has-text('Mở trình thiết kế bìa')")
        .first()
        .click();
      await page.locator("div[role='dialog']").first().waitFor({ state: "visible" });
      await page.waitForFunction(
        () => {
          const dlg = document.querySelector("div[role='dialog']");
          return !!dlg && dlg.querySelectorAll(".animate-pulse").length === 0 && dlg.querySelectorAll("img").length > 0;
        },
        undefined,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(800);
      await chup(page, "Q05-thiet-ke-bia", k);
    } finally {
      await ctx.close();
    }
  });

  test(`Q12 menu / thanh bên — ${k}`, async ({ browser, baseURL }) => {
    const { page, ctx } = await trangQuanTri(browser, baseURL!, "owner", k, "/admin/settings");
    try {
      if (k === "dt") {
        await page.getByRole("button", { name: /menu|Mở menu|Điều hướng/i }).first().click();
        await page.waitForTimeout(900);
      }
      await chup(page, "Q12-menu", k);
    } finally {
      await ctx.close();
    }
  });
}
