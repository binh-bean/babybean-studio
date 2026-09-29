/**
 * BB-320 — sửa sáu mục quản trị của vòng chấm thẩm mỹ 6 (Q-S1, Q-S2, Q-N1, Q-N2,
 * Q-D1, Q-D2) cùng các ghi nhận. Mỗi ca ĐO số thật trên trình duyệt, ở cả hai
 * khổ (dt 390×844, mt 1440×900):
 *
 *  Q-N1  mọi trang quản trị có ĐÚNG MỘT khối tiêu đề: H1 Playfair 30px, mô tả nằm
 *        DƯỚI H1 và ĐƯỜNG KẺ nằm dưới mô tả (không giữa H1 và mô tả).
 *  Q-N2  mọi thẻ số của Bảng điều khiển / Việc cần xử lý / Báo cáo có CÙNG cỡ nhãn,
 *        cùng cỡ số, không IN HOA, nhãn không gãy dòng.
 *  Q-S1  trạng thái trống "Cần xử lý ngay" gọn (< 130px), tích màu rêu của hệ.
 *  Q-S2  bảng Khách hàng trải hết bề rộng nội dung, SĐT không gãy dòng (mt).
 *  Q-D2  dòng vượt hạn mức có cột "Bộ ảnh" là liên kết tới bộ đó.
 *  Q9    dòng "không xoá được" không nằm sẵn trên trang; Q11 đúng câu giám đốc chốt.
 *
 * Dữ liệu: tests/fixtures/danh-gia.ts ("Fixture DANHGIA5-…", dọn theo id).
 * Chạy: PW_PORT=3180 npx playwright test tests/e2e/bb-320-quan-tri-vong6.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { duLieuDanhGia5, donDep, type DuLieuDanhGia5 } from "../fixtures/danh-gia";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const KT = { dt: { width: 390, height: 844 }, mt: { width: 1440, height: 900 } } as const;
type Kt = keyof typeof KT;

let d: DuLieuDanhGia5;
const THU_MUC = "test-results/bb-320";
fs.mkdirSync(THU_MUC, { recursive: true });
const stateFile = (vai: string) => path.join(THU_MUC, `.phien-${vai}.json`);

test.setTimeout(120_000);

test.beforeAll(async () => {
  d = await duLieuDanhGia5();
});

test.afterAll(async () => {
  if (!d) return;
  await donDep(d);
  for (const v of ["ql", "owner"]) fs.rmSync(stateFile(v), { force: true });
});

async function mo(browser: Browser, baseURL: string, vai: "ql" | "owner", k: Kt, url: string) {
  const file = stateFile(vai);
  if (!fs.existsSync(file)) {
    const c0 = await browser.newContext({ baseURL });
    const p0 = await c0.newPage();
    await dangNhapNhanVien(p0, vai === "ql" ? d.emailQl : d.emailOwner, d.password);
    await c0.storageState({ path: file });
    await c0.close();
  }
  const ctx: BrowserContext = await browser.newContext({ baseURL, storageState: file });
  const page: Page = await ctx.newPage();
  await page.setViewportSize(KT[k]);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  return { page, ctx };
}

const TRANG_CO_TIEU_DE: [string, string, "ql" | "owner"][] = [
  ["Bảng điều khiển", "/admin", "ql"],
  ["Bộ ảnh", "/admin/galleries", "ql"],
  ["Khách hàng", "/admin/customers", "ql"],
  ["Việc cần xử lý", "/admin/viec-can-xu-ly", "ql"],
  ["Báo cáo", "/admin/bao-cao", "ql"],
  ["Chi nhánh", "/admin/branches", "ql"],
  ["Nhân sự & vai trò", "/admin/staff", "owner"],
  ["Cài đặt", "/admin/settings", "owner"],
  ["Nhật ký thao tác", "/admin/reports/nhat-ky", "ql"],
];

for (const k of ["dt", "mt"] as Kt[]) {
  for (const [ten, url, vai] of TRANG_CO_TIEU_DE) {
    test(`Q-N1 khối tiêu đề trang chung — ${ten} — ${k}`, async ({ browser, baseURL }) => {
      const { page, ctx } = await mo(browser, baseURL!, vai, k, url);
      try {
        const khoi = page.getByTestId("khoi-tieu-de-trang");
        await expect(khoi, "phải có ĐÚNG MỘT khối tiêu đề trang").toHaveCount(1);
        const h1 = khoi.locator("h1");
        await expect(h1).toBeVisible();

        const kq = await khoi.evaluate((el) => {
          const h = el.querySelector("h1")!;
          const cs = getComputedStyle(h);
          const mota = el.querySelector("p");
          const rk = el.getBoundingClientRect();
          const rh = h.getBoundingClientRect();
          const rm = mota?.getBoundingClientRect() ?? null;
          return {
            phong: cs.fontFamily,
            co: cs.fontSize,
            duoiH1: rh.bottom,
            motaTren: rm?.top ?? null,
            motaDuoi: rm?.bottom ?? null,
            duoiKhoi: rk.bottom,
            vach: getComputedStyle(el).borderBottomWidth,
          };
        });
        expect(kq.phong, "H1 phải là Playfair").toMatch(/Playfair/i);
        expect(kq.co).toBe("30px");
        expect(kq.vach, "đường kẻ ở đáy khối").toBe("1px");
        if (kq.motaTren !== null) {
          expect(kq.motaTren, "mô tả nằm dưới H1").toBeGreaterThanOrEqual(kq.duoiH1 - 1);
          expect(kq.motaDuoi!, "đường kẻ nằm dưới mô tả, không giữa H1 và mô tả").toBeLessThanOrEqual(kq.duoiKhoi);
        }
      } finally {
        await ctx.close();
      }
    });
  }

  test(`Q-N2 một kiểu thẻ số — ${k}`, async ({ browser, baseURL }) => {
    const gom: Record<string, { nhan: string; so: string; hoa: string; catCut: boolean; chu: string }[]> = {};
    for (const [ten, url, thaoTac] of [
      ["bang-dieu-khien", `/admin?branchId=${d.branchId}`, null],
      ["bao-cao", "/admin/bao-cao", null],
      ["viec-can-xu-ly", "/admin/viec-can-xu-ly?tab=over-quota", null],
      ["chi-tiet", `/admin/galleries/${d.daChot.id}`, null],
    ] as const) {
      void thaoTac;
      const { page, ctx } = await mo(browser, baseURL!, "ql", k, url);
      try {
        await page.getByTestId(/^the-so/).first().waitFor({ state: "visible", timeout: 30_000 });
        gom[ten] = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-testid^="the-so"]')).map((el) => {
            // Nhãn là phần tử con đầu tiên của thẻ; "cắt" = chữ dài hơn khung nên bị `truncate` che mất.
            const nhanEl = el.firstElementChild as HTMLElement;
            const soEl = el.querySelector(".bb-so") as HTMLElement;
            const cn = getComputedStyle(nhanEl);
            return {
              nhan: cn.fontSize,
              so: getComputedStyle(soEl.firstElementChild ?? soEl).fontSize,
              hoa: cn.textTransform,
              catCut: nhanEl.scrollWidth > nhanEl.clientWidth + 1,
              chu: nhanEl.textContent ?? "",
            };
          }),
        );
      } finally {
        await ctx.close();
      }
    }
    const tatCa = Object.values(gom).flat();
    expect(tatCa.length, "phải tìm thấy thẻ số ở cả bốn màn").toBeGreaterThanOrEqual(12);
    for (const [man, cacThe] of Object.entries(gom)) {
      expect(cacThe.length, `màn ${man} không có thẻ số`).toBeGreaterThan(0);
    }
    expect(new Set(tatCa.map((t) => t.nhan)).size, `cỡ nhãn thẻ số: ${JSON.stringify(gom)}`).toBe(1);
    expect(new Set(tatCa.map((t) => t.hoa)).size, "không thẻ nào IN HOA").toBe(1);
    expect(tatCa[0]!.hoa).toBe("none");
    expect(tatCa.filter((t) => t.catCut).map((t) => t.chu), "nhãn thẻ số không bị cắt chữ").toEqual([]);
    // Số: hai cỡ đã định (26/28px, hoặc 20/22px cho giá trị dài) — không còn 18/32px lẻ.
    for (const t of tatCa) expect(["26px", "28px", "20px", "22px"]).toContain(t.so);
  });

  test(`Q-S1 trạng thái trống gọn — ${k}`, async ({ browser, baseURL }) => {
    const { page, ctx } = await mo(browser, baseURL!, "ql", k, `/admin?branchId=${d.branchId}`);
    try {
      const dong = page.getByTestId("can-xu-ly-ngay-trong");
      // Dữ liệu Fixture bị loại khỏi khối này (loc-chung.ts) nên khối trống là ca thật ở đây.
      await expect(dong).toBeVisible({ timeout: 30_000 });
      const kq = await dong.evaluate((el) => {
        const the = el.closest(".rounded-\\[var\\(--bb-radius\\)\\]") as HTMLElement;
        const tich = el.querySelector("svg") as SVGElement;
        return { cao: the.getBoundingClientRect().height, mau: getComputedStyle(tich).color };
      });
      expect(kq.cao, "thẻ trống cao không quá 130px").toBeLessThan(130);
      // Rêu của hệ (#4f5b45), không phải bạc hà emerald.
      expect(kq.mau).toBe("rgb(79, 91, 69)");
    } finally {
      await ctx.close();
    }
  });
}

test("Q-S2 bảng khách hàng trải hết bề rộng, SĐT không gãy dòng — mt", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "ql", "mt", "/admin/customers");
  try {
    await page.locator("table tbody tr").first().waitFor({ state: "visible", timeout: 30_000 });
    const kq = await page.evaluate(() => {
      const bang = document.querySelector("table")!.getBoundingClientRect();
      const khung = document.querySelector('[data-testid="khoi-tieu-de-trang"]')!.getBoundingClientRect();
      // Số DÒNG CHỮ thật của ô SĐT: đếm các "đỉnh" khác nhau của khung chữ (Range), không chia chiều cao ô.
      const sdt = Array.from(document.querySelectorAll("table tbody tr td.select-all")).map((td) => {
        const r = document.createRange();
        r.selectNodeContents(td);
        return new Set(Array.from(r.getClientRects()).map((c) => Math.round(c.top))).size;
      });
      const th = Array.from(document.querySelectorAll("table thead th")).map((t) => Math.round(t.getBoundingClientRect().height));
      return { bang: bang.width, khung: khung.width, sdtDong: Math.max(...sdt), caoTh: Math.max(...th) };
    });
    expect(kq.bang, "bảng phải rộng ≥ 98% khung nội dung").toBeGreaterThanOrEqual(kq.khung * 0.98);
    expect(kq.sdtDong, "SĐT một dòng").toBe(1);
    expect(kq.caoTh, "tiêu đề cột không gãy hai dòng").toBeLessThan(48);
  } finally {
    await ctx.close();
  }
});

test("Q-D2 dòng vượt hạn mức có cột Bộ ảnh dẫn tới bộ đó — mt", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "ql", "mt", "/admin/viec-can-xu-ly?tab=over-quota");
  try {
    // Bảng (lg trở lên); danh sách thẻ điện thoại nằm trước trong DOM nhưng bị ẩn ở khổ này.
    const lienKet = page.locator("table").getByTestId("mo-bo-anh").first();
    await expect(lienKet).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("columnheader", { name: "Bộ ảnh" })).toBeVisible();
    const href = await lienKet.getAttribute("href");
    expect(href).toBe(`/admin/galleries/${d.chinh.id}`);
    const ten = (await lienKet.innerText()).trim();
    expect(ten.length).toBeGreaterThan(0);
    expect(ten, "phải là tên bé/khách, không phải dấu gạch").not.toBe("–");
  } finally {
    await ctx.close();
  }
});

test("Q9 dòng 'không xoá được' chỉ hiện khi bấm Xoá — mt", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "owner", "mt", "/admin/staff");
  try {
    await page.getByRole("button", { name: "Xoá" }).first().waitFor({ state: "visible", timeout: 30_000 });
    // Mặc định KHÔNG có dòng cảnh báo nào chứa chữ "nhật ký".
    await expect(page.locator("main").getByText(/nhật ký/i)).toHaveCount(0);
    // Bấm Xoá trên tài khoản có nhật ký (aria-disabled) thì lý do MỚI hiện ra.
    const khoa = page.locator("button[data-xoa-bi-chan=true]", { hasText: "Xoá" }).first();
    if ((await khoa.count()) > 0) {
      await khoa.click();
      await expect(page.locator("main").getByText(/nhật ký/i)).toHaveCount(1);
    }
    // Nút "Thêm nhân viên" nằm trong khối tiêu đề trang.
    await expect(page.getByTestId("khoi-tieu-de-trang").getByRole("button", { name: /Thêm nhân viên/ })).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test("Q11 câu không có quyền đúng lời giám đốc — dt", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "ql", "dt", "/admin/staff");
  try {
    await expect(page.getByText("Chỉ Admin mới xem được mục này.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Quản trị hệ thống/)).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
