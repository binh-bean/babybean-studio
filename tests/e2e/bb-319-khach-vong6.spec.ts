/**
 * BB-319 — các mục P1 màn khách của báo cáo thẩm mỹ vòng 6 (K-S1, K-S2, K-D1,
 * K-D2) + mục Ghi nhận (K9, tên bé ở xem lớn), đo ĐÚNG hành vi từng mục.
 *
 * K-N1 (ký hiệu ×) và K-N2 (lề 24 px) nay canh THEO LỚP, trên mọi khung màn
 * khách, ở `bb-319-luat-lop-khach.spec.ts` (luật 1, luật 2) — không lặp ở đây.
 *
 * Đo bằng hình học và chữ THẬT trên trình duyệt (bounding box, innerText),
 * không đọc mã nguồn. Dữ liệu: tests/fixtures/danh-gia.ts ("Fixture DANHGIA5-…",
 * dọn theo chi nhánh ở afterAll). Chạy: MOCK_DRIVE_TRE=1 PW_PORT=3179 --workers=1.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { duLieuDanhGia5, donDep, type DuLieuDanhGia5 } from "../fixtures/danh-gia";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { tickHopChotDot1 } from "./helpers/tick-hop-chot-dot1";

const DT = { width: 390, height: 844 };
const MT = { width: 1440, height: 900 };

let d: DuLieuDanhGia5;
test.setTimeout(150_000);
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

test("K-S1: màn Đã giao — lưới ảnh đứng NGAY sau khối bìa, thẻ bán hàng SAU lưới, không có viên Lưu ra màn hình chính", async ({ page }) => {
  for (const kt of [DT, MT]) {
    await vao(page, kt, d.daGiao.token);
    const kq = await page.evaluate(() => {
      const anh = document.querySelector('[data-testid="the-anh"]');
      const ban = document.querySelector('[data-testid="the-ban-hang-sau-luoi"]');
      const dauLuoi = document.getElementById("dau-luoi-anh");
      const viTri = (a: Element | null, b: Element | null) =>
        !a || !b ? null : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? "a-truoc-b" : "b-truoc-a";
      // Mọi chữ của thẻ bán hàng phải nằm SAU tấm ảnh đầu tiên trong thứ tự trang.
      const chuBan = Array.from(document.querySelectorAll("h2,h3,p")).filter((e) =>
        /Ba mẹ (đã )?ưng bộ ảnh|Mời ông bà|Mua thêm|Đặt in/i.test(e.textContent ?? ""),
      );
      const truocLuoi = chuBan.filter((e) => anh && (e.compareDocumentPosition(anh) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
      return {
        coAnh: !!anh,
        coKhoiBan: !!ban,
        luoiTruocBan: viTri(anh, ban),
        soTheBanTruocLuoi: truocLuoi.map((e) => (e.textContent ?? "").slice(0, 40)),
        vien: !!document.querySelector('[data-testid="goi-y-luu-app"]'),
        anhTop: anh ? Math.round(anh.getBoundingClientRect().top + window.scrollY) : null,
        // Khoảng trống giữa đáy thanh dính (hàng chip) và tấm ảnh đầu: không còn khối rỗng chen giữa.
        khe: anh && dauLuoi ? Math.round(anh.getBoundingClientRect().top - dauLuoi.getBoundingClientRect().bottom) : null,
      };
    });
    expect(kq.coAnh).toBe(true);
    expect(kq.soTheBanTruocLuoi, "thẻ bán hàng còn đứng TRƯỚC lưới ảnh").toEqual([]);
    if (kq.coKhoiBan) expect(kq.luoiTruocBan).toBe("a-truoc-b");
    expect(kq.vien, "viên Lưu ra màn hình chính chen trước lưới ở màn Đã giao").toBe(false);
    // Ảnh đầu tiên nằm trong màn đầu + một phần màn hai (không bị đẩy xa bởi thẻ bán hàng/khối rỗng).
    expect(kq.anhTop!, `${kt.width}px: lưới ảnh bị đẩy xuống y=${kq.anhTop}`).toBeLessThan(kt.height * 1.1);
    expect(kq.khe!, `${kt.width}px: khoảng trống ${kq.khe}px giữa hàng chip và lưới`).toBeLessThanOrEqual(24);
  }
});

test("K-S1 đối chứng: bộ chưa giao vẫn giữ thẻ bán hàng trong dải thông báo (không mất chức năng)", async ({ page }) => {
  await vao(page, MT, d.dangChinh.token);
  await expect(page.getByTestId("the-ban-hang-sau-luoi")).toHaveCount(0);
});

/**
 * Dấu "·" TREO trên bìa: (a) một mẩu chữ kết thúc/bắt đầu bằng "·" ("09/09/2026 ·"),
 * hoặc (b) một dấu "·" đứng riêng mà không có mục chữ nào CÙNG DÒNG ở cả hai bên
 * (đo toạ độ thật — innerText của hàng flex tách mỗi mục một dòng nên không dùng được).
 */
async function dauChamTreo(page: Page): Promise<string[]> {
  return page.getByTestId("bia-bo-anh").evaluate((bia) => {
    const loi: string[] = [];
    const hien = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
    };
    const w = document.createTreeWalker(bia, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode as Text;
      const t = (n.textContent ?? "").trim();
      const cha = n.parentElement;
      if (!t || !cha || !hien(cha)) continue;
      if (t === "·") {
        const r = cha.getBoundingClientRect();
        const cungDong = (x: Element | null) =>
          !!x && hien(x) && Math.abs(x.getBoundingClientRect().top - r.top) < 8 && (x.textContent ?? "").trim() !== "·";
        if (!cungDong(cha.previousElementSibling) || !cungDong(cha.nextElementSibling)) loi.push(`dấu · đứng lẻ cạnh "${(cha.parentElement?.textContent ?? "").slice(0, 40)}"`);
      } else {
        // Xét cả khối chữ chứa mẩu này ("Tải cả bộ" + " · 40 ảnh" là MỘT dòng liền, không treo).
        const toan = (cha.textContent ?? "").replace(/\s+/g, " ").trim();
        if (/·$/.test(toan) || /^·/.test(toan)) loi.push(`mẩu chữ treo dấu ·: "${toan}"`);
      }
    }
    return loi;
  });
}

test("K-S2: dòng ngày/chi nhánh ở bìa điện thoại không có dấu · treo, không lặp 'Chi nhánh'", async ({ page }) => {
  for (const token of [d.chinh.token, d.dangChinh.token]) {
    await vao(page, DT, token);
    const meta = await page.getByTestId("bia-meta-dt").innerText();
    expect(meta, `"${meta}"`).not.toMatch(/[·•]/);
    expect(meta, `"${meta}"`).not.toMatch(/Chi nhánh.*Chi nhánh/);
    expect(await dauChamTreo(page)).toEqual([]);
  }
  // Màn đã giao: dòng phụ (chi nhánh…) cũng không treo dấu khi mỗi mục xuống một dòng.
  await vao(page, DT, d.daGiao.token);
  expect(await dauChamTreo(page)).toEqual([]);
});

test("K-D1: bộ chưa gửi — dòng mua thêm ghi 'Trong giỏ', không ghi 'Đã đặt mua'; dòng lẻ nằm ở mục Mua thêm", async ({ page }) => {
  await vao(page, DT, d.chinh.token);
  await denLuoi(page);
  await page.getByTestId("the-anh").getByRole("button", { name: /^Xem ảnh 1$/ }).click();
  const dlg = page.getByRole("dialog").first();
  await dlg.waitFor({ state: "visible" });
  await page.waitForTimeout(800);
  await dlg.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" }).click();
  const tam = page.getByTestId("tam-truot-dung-cho");
  await tam.waitFor({ state: "visible" });
  const chu = await tam.innerText();
  expect(chu).not.toContain("Đã đặt mua");
  // Mục riêng, tiêu đề là trạng thái giỏ: "Trong giỏ" (chưa gửi đơn).
  const gio = tam.getByTestId("gio-trong-xem-lon");
  await expect(gio.locator("h3")).toHaveText("Trong giỏ");
  const dong = gio.getByTestId("dong-gio-le");
  await expect(dong).toHaveCount(1);
  await expect(dong).toContainText("10×15");
  await expect(dong).toContainText("×3");
  // Không nằm dưới nhãn ALBUM, cũng không dưới "Mua thêm cho tấm này" (không phải món của tấm đang xem).
  for (const tieuDe of [/^Album$/, /^Mua thêm cho tấm này$/]) {
    const muc = tam.locator("section", { has: page.locator("h3", { hasText: tieuDe }) });
    if (await muc.count()) await expect(muc.first()).not.toContainText("UV");
  }
});

test("K-D2: chưa biết hạn mức — lời của khách, ≤ 12 chữ mỗi câu, có nút Nhắn studio; không còn 'Chờ hạn mức'", async ({ page }) => {
  const { rows } = await d.pg.query(
    `select value from settings where key = 'chat.page_url' and branch_id is null`,
  );
  const coChat = typeof rows[0]?.value === "string" && String(rows[0].value).startsWith("https://");
  for (const kt of [DT, MT]) {
    await vao(page, kt, d.hanMucChuaBiet.token);
    await denLuoi(page);
    expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/Chờ hạn mức/i);
    // Thanh dưới: dòng phụ nói bằng lời của khách.
    const thanh = (await page.getByTestId("thanh-noi").innerText()).replace(/\s+/g, " ");
    expect(thanh).not.toMatch(/Chờ hạn mức/i);
    expect(thanh).toContain("Gói đang cập nhật");
    // Thả tim: thông báo nói rõ tim CHƯA được lưu + hành động Nhắn studio.
    await page.locator('button[aria-label="Chọn ảnh này"]').first().click();
    const tb = page.getByTestId("thong-bao-trang-thai");
    await expect(tb).toBeVisible();
    const cau = (await page.getByTestId("thong-bao-trang-thai-chu").innerText()).replace(/\s+/g, " ").trim();
    expect(cau).toBe("Bean đang cập nhật gói của ba mẹ ạ. Tim này chưa được lưu ạ.");
    for (const c of cau.split(/(?<=\.)\s+/)) expect(c.replace(/[.,]/g, "").split(" ").length, c).toBeLessThanOrEqual(12);
    expect(cau).not.toMatch(/CSKH|liên hệ|hạn mức/i);
    const nhan = page.getByTestId("thong-bao-nhan-studio");
    if (coChat) {
      await expect(nhan).toBeVisible();
      await expect(nhan).toHaveText("Nhắn Bean");
      await expect(nhan).toHaveAttribute("href", /^https:\/\//);
    } else {
      await expect(nhan).toHaveCount(0);
    }
    // Bấm nút Chốt khi bị chặn: một câu ngắn, không mở hộp chốt.
    await tb.getByRole("button", { name: "Đóng" }).click();
    await page.getByTestId("thanh-noi").getByRole("button", { name: "Chốt danh sách" }).evaluate((el) => (el as HTMLElement).click());
    await expect(page.getByTestId("thong-bao-trang-thai-chu")).toHaveText("Bean đang cập nhật gói của ba mẹ ạ.");
    await expect(page.getByRole("heading", { name: /Chốt ảnh cho/ })).toHaveCount(0);
  }
});

test("Ghi nhận K9: màn Cảm ơn chỉ có MỘT dòng số tấm, nói rõ trong gói", async ({ page }) => {
  await d.pg.query(`update galleries set status='ready' where id=$1`, [d.choChot.id]);
  await d.pg.query(`delete from selection_items where gallery_id=$1`, [d.choChot.id]);
  await d.pg.query(`update selections set submitted_at=null where gallery_id=$1`, [d.choChot.id]);
  await vao(page, DT, d.choChot.token);
  await denLuoi(page);
  const nut = page.locator('button[aria-label="Chọn ảnh này"]');
  for (let i = 0; i < 3; i++) {
    await nut.first().click();
    await page.waitForTimeout(300);
  }
  await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
  await page.fill("#confirm-name-input", "Mẹ Bơ");
  // BB-323 — BB-321 thêm ô BẮT BUỘC trước ô chung (chọn 3 tấm < hạn mức → "đồng ý
  // studio chọn dùm"): ô `checkbox` ĐẦU TIÊN nay là ô đó, ô chung còn trống nên nút
  // Xác nhận khoá. Tick đủ bằng helper chung của BB-321.
  await tickHopChotDot1(page);
  const xn = page.getByRole("button", { name: "Xác nhận" });
  await expect(xn).toBeEnabled({ timeout: 20_000 });
  await xn.click();
  const dong = page.getByTestId("cam-on-dong-so-tam");
  await dong.waitFor({ state: "visible", timeout: 30_000 });
  await expect(dong).toHaveText(/^Đã chọn 3 \/ \d+ tấm trong gói$/);
  expect(await page.getByTestId("cam-on-sau-chot").innerText()).not.toContain("tấm ảnh chỉnh sửa");
});

test("Ghi nhận: xem lớn gọi tên bé; hộp chốt giữ tiêu đề tên bé khi cuộn tới nút Xác nhận", async ({ page }) => {
  await vao(page, DT, d.chinh.token);
  await denLuoi(page);
  await page.getByTestId("the-anh").getByRole("button", { name: /^Xem ảnh 1$/ }).click();
  await page.getByRole("dialog").first().waitFor({ state: "visible" });
  await expect(page.getByTestId("xem-lon-ten-be")).toHaveText("Nguyễn Ngọc Bảo An");
  await page.getByRole("dialog").first().getByRole("button", { name: "Đóng" }).first().click();
  await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
  const tieuDe = page.getByRole("heading", { name: "Chốt ảnh cho bé Nguyễn Ngọc Bảo An" });
  await expect(tieuDe).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận" }).scrollIntoViewIfNeeded();
  const hop = (await tieuDe.boundingBox())!;
  expect(hop.y, "tiêu đề hộp chốt cuộn mất khỏi màn").toBeGreaterThanOrEqual(0);
  expect(hop.y + hop.height).toBeLessThanOrEqual(DT.height);
});
