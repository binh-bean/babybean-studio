/**
 * BB-361 — người chấm vòng 9 (A, khách khó tính): các lỗi nhỏ quyết định cổng 8,0.
 *   1. (P1) chip "trong gói" ở bảng bên xem lớn 1440 gãy "trong / gói" → chip MỘT dòng.
 *   2. (P1) hướng dẫn lưu app Android: "…như một app riêng / ạ." → "ạ" không đứng một mình;
 *      một tiêu đề cho iPhone và Android.
 *   3. (P2) bộ đã giao 390: khung đầu chỉ MỘT bộ chat + chuông.
 *   5. (P2) thanh đáy 390 có "tấm", số tiền hiện trọn.
 *   6. Che nhân sự thật ở màn Nhân sự (lưới THẺ): tên đăng nhập không "@" cũng bị che.
 *
 * Dữ liệu: tests/fixtures/danh-gia.ts — chạy với DANHGIA_NHAN="Fixture BB-361" để mọi bản ghi
 * mang tên "Fixture BB-361-…"; afterAll dọn theo id.
 * Chạy: DANHGIA_NHAN="Fixture BB-361" PW_PORT=3251 npx playwright test tests/e2e/bb-361-man-khach-v9.spec.ts --workers=1
 *
 * Kiểm ngược (đã chạy, xem bàn giao): hoàn nguyên chip ở bang-san-pham-cua-anh.tsx → ca 1 ĐỎ
 * (getClientRects 2 mảnh); bỏ `giuA` + `text-pretty` ở huong-dan-them-man-hinh.tsx → ca 2 ĐỎ
 * ("ạ" rơi dòng ở 328–342px; chỉ bỏ `giuA` thì `text-pretty` của Chromium vẫn đỡ được — hai lớp
 * bảo vệ, Safari cũ không có `text-pretty` nên `giuA` mới là lớp chính); bỏ `invisible` ở hàng
 * dính → ca 3 ĐỎ (2 nút chat thấy được).
 */
import { daMoLanTruoc } from "./helpers/luu-app";
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { duLieuDanhGia5, donDep, cheTrongDom, type DuLieuDanhGia5 } from "../fixtures/danh-gia";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";

test.setTimeout(150_000);

let d: DuLieuDanhGia5;

test.beforeAll(async () => {
  test.setTimeout(300_000);
  d = await duLieuDanhGia5();
});

test.afterAll(async () => {
  if (!d) return;
  const { conFixture } = await donDep(d);
  expect(conFixture).toBe(0);
});

async function vao(page: Page, w: number, h: number, token: string) {
  await page.setViewportSize({ width: w, height: h });
  await chanLh3TrenTrinhDuyet(page);
  // BB-378 — lời mời lưu app hiện đúng lúc: ba mẹ mở lại lần thứ 2.
  await daMoLanTruoc(page);
  await page.goto(`/g/${token}`);
  await page.locator("#dau-luoi-anh").first().waitFor({ state: "attached", timeout: 45_000 });
  await page.waitForTimeout(1000);
}

/** Phần tử có nằm trong khung nhìn và thấy được không (visibility, kích thước, toạ độ). */
const thayTrongKhung = (el: Element) => {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && cs.visibility !== "hidden";
};

test("1 — chip 'trong gói' ở bảng bên xem lớn 1440 là MỘT dòng", async ({ page }) => {
  await vao(page, 1440, 900, d.chinh.token);
  await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.getByTestId("the-anh").nth(0).getByRole("button", { name: /^Xem ảnh 1$/ }).click();
  const dlg = page.getByRole("dialog").first();
  await dlg.waitFor({ state: "visible" });
  const chip = dlg.getByTestId("chip-trong-goi").first();
  await expect(chip).toBeVisible();
  const do_ = await chip.evaluate((el) => {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    // Số "mảnh" của nền chip: inline vỡ dòng thì getClientRects() > 1.
    return { cao: el.getBoundingClientRect().height, motDong: lh + pad, manh: el.getClientRects().length };
  });
  expect(do_.manh).toBe(1);
  expect(do_.cao).toBeLessThanOrEqual(do_.motDong + 1);
  // Tên album viết hoa chữ đầu (mục 4): "Tờ Album …", không "tờ Album …".
  await expect(dlg.getByText(/^tờ Album/)).toHaveCount(0);
});

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
};

async function moHuongDan(page: Page): Promise<{ tieuDe: string; aMoCoi: string[] }> {
  await vao(page, 390, 844, d.chinh.token);
  const chip = page.getByTestId("goi-y-luu-app").first();
  await chip.scrollIntoViewIfNeeded();
  await chip.getByTestId("goi-y-xem-cach-luu").click();
  const hd = page.getByRole("dialog").first();
  await hd.waitFor({ state: "visible" });
  const tieuDe = (await hd.locator("h3").first().innerText()).replace(/\s+/gu, " ").trim(); // BB-378: tiêu đề giữ hai chữ cuối bằng khoảng trắng không ngắt
  // Đổi bề rộng tấm trượt từng 2px (260→448): ở MỌI bề rộng, "ạ" phải cùng dòng với chữ đứng trước.
  const aMoCoi = await hd.getByTestId("huong-dan-luu-app-mo-ta").evaluate((p) => {
    const loi: string[] = [];
    const text = p.firstChild as Text | null;
    if (!text || !text.data.includes("ạ")) return ["không có chữ ạ"];
    const i = text.data.lastIndexOf("ạ");
    const dong = (a: number, b: number) => {
      const r = document.createRange();
      r.setStart(text, a);
      r.setEnd(text, b);
      return r.getClientRects()[0]?.top ?? -1;
    };
    // chữ cái đứng trước khoảng trắng trước "ạ"
    let j = i - 1;
    while (j > 0 && /\s/.test(text.data[j]!)) j--;
    const goc = (p as HTMLElement).style.width;
    for (let w = 260; w <= 448; w += 2) {
      (p as HTMLElement).style.width = `${w}px`;
      if (Math.abs(dong(i, i + 1) - dong(j, j + 1)) > 2) loi.push(`${w}px`);
    }
    (p as HTMLElement).style.width = goc;
    return loi;
  });
  return { tieuDe, aMoCoi };
}

test.describe("2 — hướng dẫn lưu app, Android", () => {
  test.use({ userAgent: UA.android, isMobile: true, hasTouch: true });
  test("Android: 'ạ' không đứng một mình; tiêu đề chung", async ({ page }) => {
    const { tieuDe, aMoCoi } = await moHuongDan(page);
    expect(aMoCoi, `"ạ" rơi xuống dòng riêng ở bề rộng: ${aMoCoi.join(", ")}`).toEqual([]);
    expect(tieuDe).toBe("Mở ảnh của bé chỉ bằng một chạm");
  });
});

test.describe("2 — hướng dẫn lưu app, iPhone", () => {
  test.use({ userAgent: UA.iphone, isMobile: true, hasTouch: true });
  test("iPhone: cùng tiêu đề với Android", async ({ page }) => {
    const { tieuDe } = await moHuongDan(page);
    expect(tieuDe).toBe("Mở ảnh của bé chỉ bằng một chạm");
  });
});

test("3 — bộ đã giao 390: khung đầu chỉ MỘT bộ chat + chuông; cuộn tới lưới vẫn còn một bộ", async ({ page }) => {
  await vao(page, 390, 844, d.daGiao.token);
  const dem = () =>
    page.evaluate((fnSrc) => {
      const thay = new Function(`return (${fnSrc})`)() as (el: Element) => boolean;
      // Chỉ đếm biểu tượng ở hai thanh đầu (bìa có thể có nút chữ "Nhắn Bean" riêng — không phải bộ biểu tượng).
      const vung = '[data-testid="thanh-thuong-hieu"], #dau-luoi-anh';
      const chat = Array.from(document.querySelectorAll(`:is(${vung}) a[aria-label="Nhắn Bean"]`)).filter(thay).length;
      const chuong = Array.from(document.querySelectorAll(`:is(${vung}) button[aria-label^="Thông báo"]`)).filter(thay).length;
      return { chat, chuong };
    }, thayTrongKhung.toString());
  const dau = await dem();
  expect(dau.chat).toBe(1);
  expect(dau.chuong).toBe(1);
  // Cuộn qua thanh thương hiệu: bộ ở hàng dính phải hiện lại (không quãng nào mất cả hai).
  await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(700);
  await expect(page.getByTestId("nhan-studio-dinh")).toBeVisible();
  const sau = await dem();
  expect(sau.chat).toBe(1);
  expect(sau.chuong).toBe(1);
});

test("5 — thanh đáy 390 có 'tấm', số tiền hiện trọn", async ({ page }) => {
  await vao(page, 390, 844, d.chinh.token);
  await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(900);
  const thanh = page.getByTestId("thanh-noi");
  await expect(thanh.getByTestId("thanh-chon-don-vi")).toBeVisible();
  await expect(thanh.getByTestId("thanh-chon-don-vi")).toHaveText(/tấm/);
  const tien = thanh.getByTestId("thanh-chon-tien-them");
  await expect(tien).toBeVisible();
  await expect(tien).toHaveText(/\d[\d.]*\s₫/);
  const do_ = await thanh.evaluate((el) => {
    const t = el.querySelector('[data-testid="thanh-chon-tien-them"]')!;
    const dong = el.querySelector('[data-testid="thanh-chon-dong-phu"]')!.parentElement!;
    const so = el.querySelector('[data-testid="dem-da-chon"]')!.parentElement!;
    const nut = el.querySelector('button[aria-label="Mua thêm"]') ?? el.querySelector("button");
    const nutTrai = nut!.getBoundingClientRect().left;
    return {
      tienPhai: t.getBoundingClientRect().right,
      soPhai: so.getBoundingClientRect().left + so.scrollWidth,
      khoiPhai: dong.getBoundingClientRect().right,
      nutTrai,
      tienCat: (t as HTMLElement).scrollWidth > (t as HTMLElement).clientWidth + 1,
    };
  });
  expect(do_.tienCat).toBe(false);
  expect(do_.tienPhai).toBeLessThanOrEqual(do_.nutTrai);
  expect(do_.soPhai).toBeLessThanOrEqual(do_.nutTrai);
});

test("6 — che nhân sự thật trên lưới THẺ: tên đăng nhập không '@' cũng bị che", async ({ page }) => {
  // Tên bịa đóng vai "nhân sự thật"; thẻ Fixture phải giữ nguyên.
  await page.setContent(`
    <div class="grid">
      <div data-testid="the-nhan-su"><div><span>TB</span></div><div><p>Trần Văn Bịa</p><code>tranvanbia</code></div><p>Quản lý</p></div>
      <div data-testid="the-nhan-su"><div><span>FX</span></div><div><p>Fixture BB-361 Quản lý</p><code>fixture.ql@demo.babybean.vn</code></div></div>
    </div>
    <div class="the-khong-testid"><p>Lê Thị Hư</p><code>lethihu</code></div>`);
  const ds = ["Trần Văn Bịa", "tranvanbia@staff.babybeanstudio.vn", "tranvanbia", "Lê Thị Hư", "lethihu@staff.babybeanstudio.vn", "lethihu"];
  await page.evaluate(
    ([maHam, dsTen]) => {
      const fn = new Function(`return (${maHam})`)() as (r: HTMLElement, t: string[]) => number;
      return fn(document.body, dsTen);
    },
    [cheTrongDom.toString(), ds] as [string, string[]],
  );
  const chu = await page.locator("body").innerText();
  for (const lo of ["Trần Văn Bịa", "tranvanbia", "TB", "Lê Thị Hư", "lethihu"]) expect(chu).not.toContain(lo);
  expect(chu).toContain("Fixture BB-361 Quản lý");
  expect(chu).toContain("fixture.ql@demo.babybean.vn");
});
