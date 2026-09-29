/**
 * BB-319 — đi tới đúng 12 màn khách của rubric (K01–K12) và ĐO chúng.
 *
 * OWNER: QA-BOT. Dùng cho `bb-319-luat-lop-khach.spec.ts` (sáu luật theo LỚP lỗi).
 *
 * Các bước đi tới từng màn CHÉP ĐÚNG `zz-danh-gia-vong5.spec.ts` (bộ chụp của
 * người chấm) — luật phải đo trên đúng khung hình người chấm nhìn, không phải
 * một trạng thái dễ hơn. Không import từ tệp spec kia: Playwright chạy mọi
 * `test(...)` top-level của module được import (xem ghi chú `kiem-bo-cuc.ts`).
 *
 * `doMan()` chỉ ĐỌC DOM đã dựng (bounding box, computed style, chữ đang thấy)
 * — không đọc mã nguồn (AGENTS.md §5a).
 */
import type { Page } from "@playwright/test";
import type { DuLieuDanhGia5 } from "../../fixtures/danh-gia";
import { chanLh3TrenTrinhDuyet } from "./mock-lh3-trinh-duyet";
import { tickHopChotDot1 } from "./tick-hop-chot-dot1";

export const KHO = {
  dt: { width: 390, height: 844 },
  mt: { width: 1440, height: 900 },
} as const;
export type Kho = keyof typeof KHO;

export const MA_K = ["K01", "K02", "K03", "K04", "K05", "K06", "K07", "K08", "K09", "K10", "K11", "K12"] as const;
export type MaK = (typeof MA_K)[number];

/** Vùng cần đo của từng màn: lớp trên cùng người chấm nhìn thấy. `null` = cả trang. */
export const GOC_DO: Record<MaK, string | null> = {
  K01: null,
  K02: null,
  K03: null,
  K04: 'div[role="dialog"][aria-modal="true"]',
  K05: 'div[role="dialog"][aria-modal="true"]',
  K06: '[role="dialog"][aria-label="Mua thêm sản phẩm"]',
  K07: '[data-testid="hop-chot"]',
  K08: '[data-testid="hop-chot"]',
  K09: '[data-testid="cam-on-sau-chot"]',
  K10: null,
  K11: null,
  K12: null,
};

/** Bộ chính bị các màn trước (K06 thêm giỏ, K08 chọn bìa) ghi đè → đặt lại đúng dữ liệu gốc. */
export async function datLaiChinh(d: DuLieuDanhGia5) {
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

async function vaoBo(page: Page, d: DuLieuDanhGia5, k: Kho, token: string) {
  if (token === d.chinh.token) await datLaiChinh(d);
  await page.setViewportSize(KHO[k]);
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

async function moHopChot(page: Page) {
  await denLuoi(page);
  await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
  await page.waitForTimeout(900);
}

/** Đi tới màn `ma` ở khổ `k` — y hệt từng bước của bộ chụp người chấm. */
export async function denManK(page: Page, d: DuLieuDanhGia5, ma: MaK, k: Kho): Promise<void> {
  switch (ma) {
    case "K01":
      await vaoBo(page, d, k, d.chinh.token);
      await page.locator('img[fetchpriority="high"]').first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
      return;
    case "K02":
      await vaoBo(page, d, k, d.chinh.token);
      await denLuoi(page);
      await page.waitForTimeout(500);
      return;
    case "K03":
      await vaoBo(page, d, k, d.chinh.token);
      await denLuoi(page);
      await cuonToiAnh(page, 296);
      return;
    case "K04":
    case "K05": {
      await vaoBo(page, d, k, d.chinh.token);
      await denLuoi(page);
      await page
        .getByTestId("the-anh")
        .getByRole("button", { name: ma === "K04" ? /^Xem ảnh 1$/ : /^Xem ảnh 2$/ })
        .click();
      const dlg = page.getByRole("dialog").first();
      await dlg.waitFor({ state: "visible" });
      await page.waitForTimeout(800);
      if (ma === "K05" && k === "dt") {
        await dlg.getByRole("button", { name: "Ghi chú cho thợ chỉnh ảnh" }).click();
        await page.waitForTimeout(900);
      }
      return;
    }
    case "K06": {
      await vaoBo(page, d, k, d.chinh.token);
      await denLuoi(page);
      await page.getByRole("button", { name: /Mua thêm/ }).first().click();
      const ch = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
      await ch.waitFor({ state: "visible" });
      await page.waitForTimeout(800);
      await ch.getByRole("button", { name: "Chọn ảnh" }).first().click();
      const lc = page.getByRole("dialog", { name: "Chọn ảnh để đặt in" });
      await lc.waitFor({ state: "visible" });
      const a = lc.locator("button:has(img)");
      for (let i = 0; i < Math.min(3, await a.count()); i++) await a.nth(i).click();
      await lc.getByRole("button", { name: /^Xong/ }).click();
      await lc.waitFor({ state: "hidden" });
      const them = ch.getByRole("button", { name: /^Thêm vào giỏ/ }).first();
      if (await them.isVisible().catch(() => false)) await them.click();
      await ch.getByText("Đã thêm vào giỏ").first().waitFor({ state: "visible", timeout: 30_000 });
      await page.waitForTimeout(700);
      return;
    }
    case "K07":
      await vaoBo(page, d, k, d.chinh.token);
      await moHopChot(page);
      await page.getByTestId("loi-nhac-hop-chot").waitFor({ state: "visible" });
      return;
    case "K08":
      await vaoBo(page, d, k, d.chinh.token);
      await page.getByText("Chọn ảnh bìa album").first().scrollIntoViewIfNeeded();
      await page.locator('button[aria-label^="Chọn ảnh bìa"]').first().click();
      await page.waitForTimeout(1500);
      await moHopChot(page);
      await page.fill("#confirm-name-input", "Mẹ Lan");
      await tickHopChotDot1(page); // BB-323: đủ ô bắt buộc của BB-321, như ba mẹ thật phải tick
      await page.waitForTimeout(500);
      if (k === "dt") {
        await page.mouse.move(195, 500);
        await page.mouse.wheel(0, 700);
        await page.waitForTimeout(500);
      }
      return;
    case "K09": {
      await d.pg.query(`update galleries set status='ready' where id=$1`, [d.choChot.id]);
      await d.pg.query(`delete from selection_items where gallery_id=$1`, [d.choChot.id]);
      await d.pg.query(`update selections set submitted_at=null where gallery_id=$1`, [d.choChot.id]);
      await vaoBo(page, d, k, d.choChot.token);
      await denLuoi(page);
      const nut = page.locator('button[aria-label="Chọn ảnh này"]');
      for (let i = 0; i < 6; i++) {
        await nut.first().click();
        await page.waitForTimeout(300);
      }
      await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
      await page.fill("#confirm-name-input", "Mẹ Bơ");
      // BB-323 — từ BB-321 ô `checkbox` đầu tiên là ô bắt buộc khi chọn thiếu, không
      // phải ô chung: tick đủ bằng helper, không thì nút Xác nhận khoá mãi.
      await tickHopChotDot1(page);
      const xn = page.getByRole("button", { name: "Xác nhận" });
      await xn.waitFor({ state: "visible" });
      for (let i = 0; i < 40 && !(await xn.isEnabled()); i++) await page.waitForTimeout(500);
      await xn.click();
      await page.getByTestId("cam-on-sau-chot").waitFor({ state: "visible", timeout: 30_000 });
      await page.waitForTimeout(1500);
      return;
    }
    case "K10":
      await vaoBo(page, d, k, d.dangChinh.token);
      return;
    case "K11":
      await vaoBo(page, d, k, d.daGiao.token);
      await page.evaluate((y) => window.scrollBy(0, y), k === "dt" ? 380 : 120);
      await page.waitForTimeout(600);
      return;
    case "K12":
      await vaoBo(page, d, k, d.hanMucChuaBiet.token);
      await denLuoi(page);
      await page.locator('button[aria-label="Chọn ảnh này"]').first().click();
      await page.waitForTimeout(400);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(700);
      return;
  }
}

// ---------------------------------------------------------------------------
// KHUNG PHỤ — phần còn lại của màn khách (ngoài 24 khung chấm điểm), để luật
// theo lớp phủ CẢ ỨNG DỤNG, không chỉ đúng chỗ người chấm chụp. Khung "trang"
// đo TOÀN TRANG (mọi phần tử đang dựng, không chỉ phần trong khung nhìn).
// ---------------------------------------------------------------------------

export interface KhungPhu {
  ma: string;
  kho: Kho;
  /** Vùng đo (hộp thoại); `null` = cả trang. */
  goc: string | null;
  /** Đo toàn trang thay vì chỉ khung nhìn. */
  toanTrang: boolean;
  /** Tên bé phải thấy (null = khung phụ không bắt buộc gọi tên, vd cửa hàng). */
  tenBe: (d: DuLieuDanhGia5) => string | null;
  /** Đơn của bộ ảnh đã gửi chưa (quyết định "Trong giỏ" hay "Đã đặt mua"). */
  daGui: boolean;
  di: (page: Page, d: DuLieuDanhGia5) => Promise<void>;
}

const TEN_CHINH = () => "Nguyễn Ngọc Bảo An";

export const KHUNG_PHU: KhungPhu[] = [
  { ma: "P-chinh-trang", kho: "dt", goc: null, toanTrang: true, tenBe: TEN_CHINH, daGui: false, di: (p, d) => vaoBo(p, d, "dt", d.chinh.token) },
  { ma: "P-chinh-trang", kho: "mt", goc: null, toanTrang: true, tenBe: TEN_CHINH, daGui: false, di: (p, d) => vaoBo(p, d, "mt", d.chinh.token) },
  { ma: "P-phu-trang", kho: "dt", goc: null, toanTrang: true, tenBe: () => "Bé Na", daGui: false, di: (p, d) => vaoBo(p, d, "dt", d.phu.token) },
  { ma: "P-da-chot-trang", kho: "dt", goc: null, toanTrang: true, tenBe: () => "Bé Cam", daGui: true, di: (p, d) => vaoBo(p, d, "dt", d.daChot.token) },
  { ma: "P-dang-chinh-trang", kho: "dt", goc: null, toanTrang: true, tenBe: () => "Bé Mít", daGui: true, di: (p, d) => vaoBo(p, d, "dt", d.dangChinh.token) },
  { ma: "P-da-giao-trang", kho: "dt", goc: null, toanTrang: true, tenBe: () => "Bé Xoài", daGui: true, di: (p, d) => vaoBo(p, d, "dt", d.daGiao.token) },
  { ma: "P-da-giao-trang", kho: "mt", goc: null, toanTrang: true, tenBe: () => "Bé Xoài", daGui: true, di: (p, d) => vaoBo(p, d, "mt", d.daGiao.token) },
  { ma: "P-han-muc-trang", kho: "dt", goc: null, toanTrang: true, tenBe: () => "Ngô Gia Huy", daGui: false, di: (p, d) => vaoBo(p, d, "dt", d.hanMucChuaBiet.token) },
  {
    ma: "P-dat-in-tam-truot",
    kho: "dt",
    goc: '[data-testid="tam-truot-dung-cho"]',
    toanTrang: true,
    tenBe: () => null,
    daGui: false,
    di: async (p, d) => {
      await vaoBo(p, d, "dt", d.chinh.token);
      await denLuoi(p);
      await p.getByTestId("the-anh").getByRole("button", { name: /^Xem ảnh 1$/ }).click();
      const dlg = p.getByRole("dialog").first();
      await dlg.waitFor({ state: "visible" });
      await dlg.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" }).click();
      await p.getByTestId("tam-truot-dung-cho").waitFor({ state: "visible" });
      await p.waitForTimeout(600);
    },
  },
  {
    ma: "P-cua-hang-album",
    kho: "dt",
    goc: '[role="dialog"][aria-label="Mua thêm sản phẩm"]',
    toanTrang: true,
    tenBe: () => null,
    daGui: false,
    di: async (p, d) => {
      await vaoBo(p, d, "dt", d.chinh.token);
      await denLuoi(p);
      await p.getByRole("button", { name: /Mua thêm/ }).first().click();
      const ch = p.getByRole("dialog", { name: "Mua thêm sản phẩm" });
      await ch.waitFor({ state: "visible" });
      await ch.getByRole("button", { name: "Album", exact: true }).click().catch(() => {});
      await p.waitForTimeout(600);
      await ch.getByRole("button", { name: /Giỏ ·/ }).click().catch(() => {});
      await p.waitForTimeout(400);
    },
  },
  {
    ma: "P-hop-chot-chi-tiet",
    kho: "dt",
    goc: '[data-testid="hop-chot"]',
    toanTrang: true,
    tenBe: TEN_CHINH,
    daGui: false,
    di: async (p, d) => {
      await vaoBo(p, d, "dt", d.chinh.token);
      await moHopChot(p);
      await p.getByTestId("nut-xem-chi-tiet-hop-chot").click();
      await p.getByTestId("chi-tiet-hop-chot").waitFor({ state: "visible" });
    },
  },
  {
    ma: "P-da-giao-moi-mua",
    kho: "dt",
    goc: '[data-testid="man-mua-them-sau-duyet"]',
    toanTrang: true,
    tenBe: () => null,
    daGui: true,
    di: async (p, d) => {
      await vaoBo(p, d, "dt", d.daGiao.token);
      await p.getByRole("button", { name: "Xem thêm" }).first().click();
      await p.getByRole("button", { name: "Gửi yêu cầu cho studio" }).waitFor({ state: "visible" });
      await p.waitForTimeout(500);
    },
  },
];

// ---------------------------------------------------------------------------
// ĐO
// ---------------------------------------------------------------------------

export interface ManhChu {
  /** Chữ của một nút văn bản (đã gộp khoảng trắng). */
  t: string;
  /** Cỡ chữ tính toán, px. */
  px: number;
  ff: string;
  fw: string;
  fst: string;
  /** Thẻ cha trực tiếp. */
  the: string;
  /** Nằm trong h1/h2/h3 (hoặc lớp kh-h*). */
  tieuDe: boolean;
  /** text-transform tính toán ("uppercase" cho nhãn nhỏ kiểu eyebrow). */
  tt: string;
  /** Nằm trong nút/đường dẫn/ô nhập. */
  dieuKhien: boolean;
}

export interface KhoiLe {
  ma: string;
  left: number;
  right: number;
}

export interface NutDac {
  chu: string;
  bg: string;
  /** Bán kính bo góc so với nửa chiều cao (≥ 0.95 là viên tròn). */
  tronVien: number;
}

export interface DoManKhach {
  chu: ManhChu[];
  /** Mỗi "đoạn" = chữ của một khối (các nút văn bản có chung khối cha gần nhất). */
  doan: string[];
  khoi: KhoiLe[];
  nut: NutDac[];
  /** Mép trái/phải của các ô ảnh trong lưới đang thấy. */
  luoi: KhoiLe[];
  /** Phần tử chứa đúng tên bé bị cắt chữ ("…"/tràn khung). */
  tenBiCat: string[];
  /** Chữ đầy đủ đang thấy (để tìm tên, nhãn giỏ, ký hiệu). */
  toanBo: string;
}

/**
 * Đo MỘT khung hình. `goc` là vùng lớp trên cùng (hộp thoại) — ngoài vùng đó
 * là nền bị làm mờ, người chấm không chấm.
 */
export async function doMan(
  page: Page,
  goc: string | null,
  tenBe: string | null,
  toanTrang = false,
): Promise<DoManKhach> {
  return page.evaluate(
    ({ gocSel, ten, caTrang }) => {
      const W = window.innerWidth;
      const H = caTrang ? Number.POSITIVE_INFINITY : window.innerHeight;
      const root = (gocSel ? document.querySelector(gocSel) : null) ?? document.body;

      const anDi = (el: Element | null): boolean => {
        for (let p: Element | null = el; p && p !== document.documentElement; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return true;
          if (p.getAttribute("aria-hidden") === "true") return true;
          if (p.tagName.toLowerCase() === "nextjs-portal") return true;
        }
        return false;
      };
      const trongKhung = (r: DOMRect) =>
        r.width >= 1 && r.height >= 1 && (caTrang || (r.bottom > 0 && r.top < H)) && r.right > 0 && r.left < W;

      /** Bị một vùng tự cuộn (overflow auto/scroll/hidden) cắt khỏi tầm nhìn? */
      const biCatBoiCha = (el: Element, r: DOMRect): boolean => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
          const rp = p.getBoundingClientRect();
          if (r.right <= rp.left + 1 || r.left >= rp.right - 1) return true;
          // Đo toàn trang: phần nằm ngoài vùng cuộn DỌC của một hộp thoại vẫn là chữ khách đọc (cuộn tới là thấy).
          if (!caTrang && (r.bottom <= rp.top + 1 || r.top >= rp.bottom - 1)) return true;
        }
        return false;
      };

      const khoiCha = (el: Element): Element => {
        for (let p: Element | null = el; p; p = p.parentElement) {
          const tag = p.tagName.toLowerCase();
          if (["button", "a", "label", "li", "p", "h1", "h2", "h3", "h4", "td", "th"].includes(tag)) return p;
          const d = getComputedStyle(p).display;
          if (!d.startsWith("inline") && d !== "contents") return p;
        }
        return el;
      };

      const chu: ManhChu[] = [];
      const theoKhoi = new Map<Element, string[]>();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode as Text;
        const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!t) continue;
        const cha = n.parentElement;
        if (!cha || anDi(cha)) continue;
        const tagCha = cha.tagName.toLowerCase();
        if (["script", "style", "noscript", "title", "option"].includes(tagCha)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rs = Array.from(range.getClientRects()).filter((r) => trongKhung(r as DOMRect));
        if (rs.length === 0) continue;
        if (biCatBoiCha(cha, rs[0] as DOMRect)) continue;
        const cs = getComputedStyle(cha);
        const tieuDe = !!cha.closest("h1,h2,h3,.kh-h1,.kh-h2,.kh-h3");
        const dieuKhien = !!cha.closest("button,a,input,textarea,select,[role=button]");
        chu.push({
          t,
          px: Math.round(parseFloat(cs.fontSize) * 10) / 10,
          ff: cs.fontFamily,
          fw: cs.fontWeight,
          fst: cs.fontStyle,
          the: tagCha,
          tieuDe,
          tt: cs.textTransform,
          dieuKhien,
        });
        const k = khoiCha(cha);
        const ds = theoKhoi.get(k) ?? [];
        ds.push(t);
        theoKhoi.set(k, ds);
      }
      // Ô nhập: chữ gợi ý (placeholder) cũng là chữ khách đọc.
      root.querySelectorAll("input[placeholder],textarea[placeholder]").forEach((el) => {
        const inp = el as HTMLInputElement;
        if (anDi(inp) || inp.value) return;
        const r = inp.getBoundingClientRect();
        if (!trongKhung(r)) return;
        theoKhoi.set(inp, [inp.placeholder]);
      });
      const doan = Array.from(theoKhoi.values()).map((ds) => ds.join(" ").replace(/\s+/g, " ").trim());

      // ----- Khối nội dung cho luật lề (mép trái/phải của thứ mắt thấy) -----
      const khoi: KhoiLe[] = [];
      const luoi: KhoiLe[] = [];
      root.querySelectorAll("*").forEach((el) => {
        const tag = el.tagName.toLowerCase();
        if (["img", "video", "canvas", "svg", "path", "script", "style", "source", "picture"].includes(tag)) return;
        if (anDi(el)) return;
        if (el.closest('[data-testid="the-anh"]')) return;
        const khungLuoi = el.closest('section[aria-label="Ảnh của buổi chụp"]');
        if (khungLuoi) {
          // Lề của lưới = mép TRONG (sau padding) của khung lưới — đúng chỗ cột ảnh đầu/cuối bắt đầu.
          if (el === khungLuoi) {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (trongKhung(r))
              luoi.push({
                ma: "luoi-anh",
                left: Math.round((r.left + parseFloat(cs.paddingLeft)) * 10) / 10,
                right: Math.round((W - r.right + parseFloat(cs.paddingRight)) * 10) / 10,
              });
          }
          return;
        }
        // Thanh 3 cột đều của xem lớn: biểu tượng + chữ canh GIỮA cột, không có "mép lề".
        if (el.closest('[data-testid="thanh-day-3-cot"]')) return;
        const cs = getComputedStyle(el);
        if (cs.display === "inline" || cs.display === "contents") return;
        let r = el.getBoundingClientRect();
        const svg = el.querySelector("svg");
        if (["button", "a"].includes(tag) && !(el.textContent ?? "").trim() && svg) r = svg.getBoundingClientRect();
        if (!trongKhung(r) || r.left < -0.5) return;
        if (r.width >= W - 1) return; // tràn hết bề ngang: thanh, lớp phủ, ảnh bìa
        // Trong dải tự cuộn ngang (hàng chip, ảnh nhỏ): phần tràn qua mép phải là có chủ đích.
        let trongCuon = false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if ((ox === "auto" || ox === "scroll") && p.scrollWidth > p.clientWidth + 1) trongCuon = true;
        }
        if (trongCuon && r.right > W - 24) return;
        if (biCatBoiCha(el, r)) return;
        const coChu = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
        const laDieuKhien = ["button", "a", "input", "textarea", "select"].includes(tag);
        const coNen = (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") || parseFloat(cs.borderLeftWidth) > 0;
        if (!(coChu || laDieuKhien || coNen)) return;
        // Tấm nền chạm mép màn (cột chữ bìa máy tính, dải kem) là nền tràn viền, không phải "nội dung lệch lề".
        if (!coChu && !laDieuKhien && (r.left <= 0.5 || W - r.right <= 0.5)) return;
        khoi.push({
          ma: ((el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 28)) || tag).slice(0, 40),
          left: Math.round(r.left * 10) / 10,
          right: Math.round((W - r.right) * 10) / 10,
        });
      });

      // ----- Nút ĐẶC (có nền) -----
      const nut: NutDac[] = [];
      root.querySelectorAll("button,a,[role=button]").forEach((el) => {
        if (anDi(el)) return;
        const r = el.getBoundingClientRect();
        if (!trongKhung(r) || r.height < 24) return;
        const cs = getComputedStyle(el);
        const bg = cs.backgroundColor;
        const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(bg);
        if (!m) return;
        const a = m[4] === undefined ? 1 : Number(m[4]);
        if (a < 0.5) return;
        const [rr, gg, bb] = [Number(m[1]), Number(m[2]), Number(m[3])];
        const sang = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255;
        if (sang > 0.8) return; // nền sáng (kem/trắng/be) — nút phụ, chip, thẻ
        const chuNut = ((el.textContent ?? "").trim() || el.getAttribute("aria-label") || "").slice(0, 40);
        nut.push({ chu: chuNut, bg: `rgb(${rr}, ${gg}, ${bb})`, tronVien: parseFloat(cs.borderTopLeftRadius) / (r.height / 2) });
      });

      // ----- Tên bé bị cắt -----
      const tenBiCat: string[] = [];
      if (ten) {
        root.querySelectorAll("*").forEach((el) => {
          if (anDi(el)) return;
          const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").includes(ten));
          if (!own) return;
          const he = el as HTMLElement;
          const r = he.getBoundingClientRect();
          if (!trongKhung(r)) return;
          const cs = getComputedStyle(he);
          if (he.scrollWidth > he.clientWidth + 1 && (cs.overflowX !== "visible" || cs.textOverflow === "ellipsis")) {
            tenBiCat.push((he.textContent ?? "").trim().slice(0, 60));
          }
        });
      }

      return {
        chu,
        doan,
        khoi,
        nut,
        luoi,
        tenBiCat,
        toanBo: chu.map((c) => c.t).join(" \n "),
      };
    },
    { gocSel: goc, ten: tenBe, caTrang: toanTrang },
  );
}
