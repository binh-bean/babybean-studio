/**
 * BB-353 — màn khách sau vòng chấm 7 (người chấm A, "khách khó tính").
 *
 *   1 (P0). Chốt THẬT qua giao diện → màn cảm ơn, bìa, thẻ tiến trình và dải
 *           khoá cùng nói "Bean đang xác nhận", không chỗ nào nói "đang chỉnh"
 *           (trước BB-353: bìa "Studio đang chỉnh ảnh của …" cạnh thẻ "Đang chờ
 *           studio xác nhận" — V7-K09b/K09c).
 *   2.      Ở 375 và 390, nút Back khi đang xem lớn / mở cửa hàng / mở hộp chốt
 *           đóng ĐÚNG lớp đó, giữ nguyên địa chỉ bộ ảnh (trước: rời trang, 3/3).
 *   4.      Hộp chốt ở 1440×900: nút Huỷ/Xác nhận hiện TRỌN trong hộp và trong
 *           màn hình (trước: mép dưới hộp cắt nửa nút — K07-mt/K08-mt).
 *
 * Dữ liệu: tests/fixtures/danh-gia.ts với nhãn "Fixture BB-353-…" (ảnh giả qua
 * mock-drive), dọn theo id (`donDep`). Không gửi gì ra Lark (PHEP_THU_TRINH_DUYET).
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import type { DuLieuDanhGia5 } from "../fixtures/danh-gia";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { tickHopChotDot1 } from "./helpers/tick-hop-chot-dot1";

let d: DuLieuDanhGia5;
let donDep: (d: DuLieuDanhGia5) => Promise<{ conFixture: number }>;

test.use({ actionTimeout: 15_000 });
test.setTimeout(150_000);
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // Nhãn fixture đọc lúc nạp module → đặt trước khi nạp.
  process.env.DANHGIA_NHAN = `Fixture BB-353-${Math.random().toString(36).slice(2, 8)}`;
  const m = await import("../fixtures/danh-gia");
  donDep = m.donDep;
  d = await m.duLieuDanhGia5();
});

test.afterAll(async () => {
  if (d) await donDep(d);
});

async function vao(page: Page, w: number, h: number, token: string) {
  await page.setViewportSize({ width: w, height: h });
  await chanLh3TrenTrinhDuyet(page);
  await page.goto(`/g/${token}`);
  await page.locator("#dau-luoi-anh").first().waitFor({ state: "attached", timeout: 45_000 });
  await page.waitForTimeout(800);
}

const denLuoi = (page: Page) =>
  page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));

async function vanOBoAnh(page: Page, url: string) {
  expect(page.url(), "Back không được rời trang bộ ảnh").toBe(url);
  await expect(page.locator("#dau-luoi-anh").first()).toBeAttached();
}

for (const kho of [
  { ten: "375", w: 375, h: 812 },
  { ten: "390", w: 390, h: 844 },
]) {
  test(`mục 2: Back đóng từng lớp, giữ bộ ảnh — ${kho.ten}`, async ({ page }) => {
    await vao(page, kho.w, kho.h, d.chinh.token);
    const url = page.url();

    // (a) Xem lớn.
    await denLuoi(page);
    await page.getByTestId("the-anh").nth(0).getByRole("button", { name: /^Xem ảnh 1$/ }).click();
    const xemLon = page.getByRole("dialog").first();
    await expect(xemLon).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await vanOBoAnh(page, url);

    // (b) Cửa hàng.
    await page.mouse.wheel(0, 600);
    await page.getByRole("button", { name: /Mua thêm/ }).first().click();
    const cuaHang = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
    await expect(cuaHang).toBeVisible();
    await page.goBack();
    await expect(cuaHang).toHaveCount(0);
    await vanOBoAnh(page, url);

    // (c) Hộp chốt.
    await denLuoi(page);
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    const hop = page.getByTestId("hop-chot");
    await expect(hop).toBeVisible();
    await page.goBack();
    await expect(hop).toHaveCount(0);
    await vanOBoAnh(page, url);

    // Lớp đóng bằng nút Huỷ cũng không để lại mục lịch sử "chết": mở lại, Huỷ,
    // rồi mở xem lớn — một lần Back vẫn đóng được xem lớn.
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await expect(hop).toBeVisible();
    await hop.getByRole("button", { name: "Huỷ" }).click();
    await expect(hop).toHaveCount(0);
    await denLuoi(page);
    await page.getByTestId("the-anh").nth(0).getByRole("button", { name: /^Xem ảnh 1$/ }).click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await vanOBoAnh(page, url);
  });
}

test("mục 4: hộp chốt ở 1440×900 hiện trọn nút Huỷ / Xác nhận", async ({ page }) => {
  await vao(page, 1440, 900, d.chinh.token);
  await denLuoi(page);
  await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
  const hop = page.getByTestId("hop-chot");
  await expect(hop).toBeVisible();
  // Đợi hộp đủ nội dung như người chấm thấy (khối nhắc bìa + khối "sản phẩm in chưa có ảnh"
  // hiện sau lượt đọc đợt 1) — lúc đó nội dung cao hơn hộp, phải cuộn.
  await page.getByTestId("loi-nhac-hop-chot").waitFor({ state: "visible" });
  await page.locator('[data-da-doc-dot1="1"]').waitFor({ state: "attached", timeout: 20_000 });
  await page.waitForTimeout(600);
  const tranNoiDung = await hop.evaluate((el) => {
    const tong = Array.from(el.children).reduce((t, c) => t + (c as HTMLElement).scrollHeight, 0);
    return tong > el.clientHeight;
  });
  expect(tranNoiDung, "ca thử phải là ca nội dung cao hơn hộp (như K07/K08-mt)").toBe(true);
  const khung = (await hop.boundingBox())!;
  for (const ten of ["Huỷ", "Xác nhận"]) {
    const nut = (await hop.getByRole("button", { name: ten, exact: true }).boundingBox())!;
    expect(nut, `thiếu nút ${ten}`).not.toBeNull();
    expect(nut.y, `${ten}: mép trên trong hộp`).toBeGreaterThanOrEqual(khung.y);
    expect(nut.y + nut.height, `${ten}: mép dưới không bị hộp cắt`).toBeLessThanOrEqual(khung.y + khung.height + 0.5);
    expect(nut.y + nut.height, `${ten}: trong màn hình`).toBeLessThanOrEqual(900);
  }
});

for (const kho of [
  { ten: "390", w: 390, h: 844 },
  { ten: "1440", w: 1440, h: 900 },
]) {
  test(`mục 1 (P0): chốt thật → cảm ơn, bìa, thẻ tiến trình, dải khoá cùng một trạng thái — ${kho.ten}`, async ({ page }) => {
    // Bộ chốt sống: đặt lại về "ready" để chốt được ở cả hai khổ.
    await d.pg.query(`update galleries set status='ready' where id=$1`, [d.choChot.id]);
    await d.pg.query(`delete from selection_items where gallery_id=$1`, [d.choChot.id]);
    await d.pg.query(`update selections set submitted_at=null where gallery_id=$1`, [d.choChot.id]);

    await vao(page, kho.w, kho.h, d.choChot.token);
    await denLuoi(page);
    const nut = page.locator('button[aria-label="Chọn ảnh này"]');
    for (let i = 0; i < 6; i++) {
      await nut.first().click();
      await page.waitForTimeout(250);
    }
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await page.fill("#confirm-name-input", "Mẹ Fixture");
    await tickHopChotDot1(page);
    const xn = page.getByRole("button", { name: "Xác nhận", exact: true });
    await expect(xn).toBeEnabled({ timeout: 20_000 });
    await xn.click();

    const camOn = page.getByTestId("cam-on-trang-thai");
    await expect(camOn).toBeVisible({ timeout: 30_000 });
    const cauCamOn = (await camOn.innerText()).trim();
    expect(cauCamOn).toMatch(/^Bean đang xác nhận danh sách ảnh của .+ ạ\.$/);

    await page.reload();
    await page.locator("#dau-luoi-anh").first().waitFor({ state: "attached", timeout: 45_000 });
    // BB-358 — "ạ" gắn chữ trước bằng khoảng trắng không ngắt (U+00A0): so chữ như người đọc thấy.
    const bia = (await page.getByTestId("bia-loi-chao").first().innerText()).replace(/ /g, " ").trim();
    // Một trạng thái cho mọi chỗ: bìa = cảm ơn; dải khoá = tiêu đề thẻ tiến trình.
    expect(bia, "bìa lệch màn cảm ơn").toBe(cauCamOn);
    // BB-355 (bản vẽ v8 b) — chờ xác nhận: dải khoá gộp vào thẻ tiến độ, không còn khối riêng.
    // Tiêu đề thẻ gộp giữ vai "dải khoá" cũ trong phép so: cùng một dòng trạng thái.
    await expect(page.getByTestId("dai-khoa-trang-thai")).toHaveCount(0);
    const the = page.getByTestId("the-tien-do-gop").getByRole("heading", { level: 3 });
    await expect(the).toBeVisible();
    const dai = (await the.innerText()).trim();
    expect(dai).toBe("Bean đang xác nhận danh sách ảnh ạ");
    await expect(page.locator('[aria-current="step"]').first()).toHaveText(/Chờ\s*xác nhận/);
    for (const cau of [bia, dai, cauCamOn]) expect(cau).not.toMatch(/đang chỉnh|studio/i);
  });
}
