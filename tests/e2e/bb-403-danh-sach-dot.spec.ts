/**
 * BB-403 — các đợt chọn ảnh hiện NGAY trên trang như đợt 1, có nút chép; không còn nút tải.
 *
 * VIẾT NHƯNG CHƯA CHẠY (luật Đợt 19: Claude chạy lần lượt khi vắng khách). Cần migration 0077
 * (`selection_rounds`, cột `selection_items.dot`) — tự SKIP khi chưa có. Chạy:
 *
 *   MOCK_DRIVE_TRE=1 PW_PORT=3181 npx playwright test tests/e2e/bb-403-danh-sach-dot.spec.ts --workers=1
 *
 * Nền Fixture: MỘT chi nhánh "Fixture BB-403-…" + nhân sự thử, bộ A có đợt 1 (2 ảnh) và đợt 2
 * (2 ảnh, chờ xác nhận). Dọn theo id ở afterAll (`donBb345`).
 */

import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { taoBb345, donBb345, type DuLieuBb345 } from "../fixtures/bb-345";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

test.setTimeout(180_000);

let d: DuLieuBb345;
let coBangDot = false;
const DOT1 = [0, 1];
const DOT2 = [2, 3];

test.beforeAll(async () => {
  d = await taoBb345({ nhan: "Fixture BB-403", soAnhA: 6, taoNhanVien: true });
  const { rows: bang } = await d.pg.query(`select to_regclass('public.selection_rounds')::text as t`);
  const { rows: cot } = await d.pg.query(
    `select 1 from information_schema.columns where table_name = 'selection_items' and column_name = 'dot'`,
  );
  coBangDot = !!bang[0]?.t && cot.length > 0;
  if (!coBangDot) return;

  await d.pg.query(`update selections set submitted_at = now(), submitted_by_name = 'Fixture BB-403 Mẹ' where id = $1`, [d.A.selectionId]);
  const chen = async (i: number, dot: number, ghiChu: string | null) =>
    d.pg.query(
      `insert into selection_items (selection_id, photo_id, gallery_id, mark, dot, retouch_note) values ($1,$2,$3,'selected',$4,$5)`,
      [d.A.selectionId, d.A.anh[i]!.id, d.A.id, dot, ghiChu],
    );
  for (const i of DOT1) await chen(i, 1, null);
  for (const i of DOT2) await chen(i, 2, i === DOT2[0] ? "làm sáng da" : null);
  await d.pg.query(
    `insert into selection_rounds (gallery_id, selection_id, so_dot, trang_thai, so_anh, so_anh_tinh_tien, gia_moi_anh, tien_anh, anh_ids)
     values ($1,$2,2,'cho_xac_nhan',2,2,50000,100000,$3::uuid[])`,
    [d.A.id, d.A.selectionId, DOT2.map((i) => d.A.anh[i]!.id)],
  );
});

test.afterAll(async () => {
  if (d) await donBb345(d);
});

async function moTrang(browser: import("@playwright/test").Browser, baseURL: string, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ baseURL, viewport, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  // Ghi lại mọi lần gọi route xuất (đợt đã xem được nhớ đệm nên bấm lại không gọi mạng nữa).
  const yeuCauXuat: string[] = [];
  page.on("request", (r) => {
    if (/\/export\?/.test(r.url())) yeuCauXuat.push(new URL(r.url()).search);
  });
  await dangNhapNhanVien(page, d.staff!.email, d.staff!.password);
  await page.goto(`/admin/galleries/${d.A.id}`, { waitUntil: "domcontentloaded" });
  return { ctx, page, yeuCauXuat };
}

const khung = (page: Page) => page.getByTestId("khung-danh-sach-anh");
const boNhoTam = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test("1. Có chip từng đợt; mặc định đợt chờ xử lý; bấm đợt 2 hiện đúng tên tệp ngay trên trang", async ({ browser, baseURL }) => {
  test.skip(!coBangDot, "Chưa áp migration 0077 (đợt chọn)");
  const { ctx, page, yeuCauXuat } = await moTrang(browser, baseURL!);
  try {
    const chon = page.getByTestId("chon-dot");
    await expect(chon).toBeVisible({ timeout: 40_000 });
    await expect(chon.getByTestId("chip-dot-1")).toBeVisible();
    await expect(chon.getByTestId("chip-dot-2")).toBeVisible();
    await expect(chon.getByTestId("chip-dot-tat-ca")).toBeVisible();
    // Đợt 2 đang chờ xác nhận → mở sẵn.
    await expect(chon.getByTestId("chip-dot-2")).toHaveAttribute("aria-pressed", "true");
    await expect(khung(page)).toHaveValue(new RegExp(d.A.anh[DOT2[0]!]!.fileName), { timeout: 30_000 });
    await expect(page.getByTestId("dong-dot-dang-xem")).toContainText("Đợt 2 · mua thêm · Chờ xác nhận · 2 ảnh mới");

    // Bấm Đợt 1: chỉ ảnh đợt 1.
    await chon.getByTestId("chip-dot-1").click();
    await expect(khung(page)).toHaveValue(new RegExp(d.A.anh[DOT1[0]!]!.fileName), { timeout: 30_000 });
    expect(await khung(page).inputValue()).not.toContain(d.A.anh[DOT2[0]!]!.fileName);

    // Bấm Đợt 2: gọi export?hien=1&dot=2.
    await chon.getByTestId("chip-dot-2").click();
    await expect(chon.getByTestId("chip-dot-2")).toHaveAttribute("aria-pressed", "true");
    expect(yeuCauXuat).toContain("?hien=1&dot=2");
    await expect(khung(page)).toHaveValue(new RegExp(d.A.anh[DOT2[1]!]!.fileName), { timeout: 30_000 });
    expect(await khung(page).inputValue()).not.toContain(d.A.anh[DOT1[0]!]!.fileName);

    // Tất cả: đủ bốn tệp.
    await chon.getByTestId("chip-dot-tat-ca").click();
    // Chờ ảnh ĐỢT 1 xuất hiện (khung còn chữ đợt 2 cũ trong lúc tải, nên không chờ theo ảnh đợt 2).
    await expect(khung(page)).toHaveValue(new RegExp(d.A.anh[DOT1[0]!]!.fileName), { timeout: 30_000 });
    const tatCa = await khung(page).inputValue();
    for (const i of [...DOT1, ...DOT2]) expect(tatCa).toContain(d.A.anh[i]!.fileName);

    // Không còn nút/liên kết tải cho đợt ở trang này.
    await expect(page.locator('#dot-chon a[download], #xuat-danh-sach a[download]')).toHaveCount(0);
    await expect(page.getByText(/Tải danh sách chỉ đợt|Chi tiết chỉ đợt/)).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("2. Chép tên tệp / chép bản chi tiết của đợt 2 vào bộ nhớ tạm, báo 'Đã chép N tệp'", async ({ browser, baseURL }) => {
  test.skip(!coBangDot, "Chưa áp migration 0077 (đợt chọn)");
  const { ctx, page } = await moTrang(browser, baseURL!);
  try {
    await page.getByTestId("chip-dot-2").click({ timeout: 40_000 });
    await expect(khung(page)).toHaveValue(new RegExp(d.A.anh[DOT2[0]!]!.fileName), { timeout: 30_000 });

    await page.getByTestId("chep-ten-tep").click();
    await expect(page.getByTestId("da-chep")).toHaveText("Đã chép 2 tệp");
    const ten = (await boNhoTam(page)).split(/\r?\n/);
    expect(ten).toEqual([d.A.anh[DOT2[0]!]!.fileName, d.A.anh[DOT2[1]!]!.fileName]);

    await page.getByTestId("chep-ban-chi-tiet").click();
    await expect(page.getByTestId("da-chep")).toHaveText("Đã chép 2 tệp");
    // Dòng "Đã chép 2 tệp" của lần bấm trước còn đó khi bản chi tiết (chưa nhớ đệm) đang tải:
    // chờ bộ nhớ tạm ĐỔI sang bản chi tiết rồi mới đọc.
    await expect.poll(() => boNhoTam(page), { timeout: 30_000 }).toContain("CHỈ ẢNH ĐỢT 2");
    const ct = await boNhoTam(page);
    expect(ct).toContain(`${d.A.anh[DOT2[0]!]!.fileName} ("làm sáng da")`);
    expect(ct).not.toContain(d.A.anh[DOT1[0]!]!.fileName);
  } finally {
    await ctx.close();
  }
});

test("3. Thẻ 'Đợt chọn': 'Xem danh sách đợt 2' mở đúng đợt ở khối danh sách; mở bằng #xuat-danh-sach-dot-2 cũng đúng", async ({
  browser,
  baseURL,
}) => {
  test.skip(!coBangDot, "Chưa áp migration 0077 (đợt chọn)");
  const { ctx, page } = await moTrang(browser, baseURL!);
  try {
    await page.getByTestId("chip-dot-1").click({ timeout: 40_000 });
    await expect(page.getByTestId("chip-dot-1")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("xem-danh-sach-dot-2").click();
    await expect(page.getByTestId("chip-dot-2")).toHaveAttribute("aria-pressed", "true");
    await expect(khung(page)).toHaveValue(new RegExp(d.A.anh[DOT2[0]!]!.fileName), { timeout: 30_000 });

    // Từ trang khác (hàng đợi "Việc cần xử lý"): địa chỉ có #xuat-danh-sach-dot-1 mở thẳng đợt 1.
    await page.goto(`/admin/galleries/${d.A.id}#xuat-danh-sach-dot-1`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("chip-dot-1")).toHaveAttribute("aria-pressed", "true", { timeout: 40_000 });
  } finally {
    await ctx.close();
  }
});

test("4. Điện thoại 390px: hàng chip + hai nút chép không tràn ngang", async ({ browser, baseURL }) => {
  test.skip(!coBangDot, "Chưa áp migration 0077 (đợt chọn)");
  const { ctx, page } = await moTrang(browser, baseURL!, { width: 390, height: 844 });
  try {
    await expect(page.getByTestId("chon-dot")).toBeVisible({ timeout: 40_000 });
    const tran = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(tran).toBe(false);
    const hop = await page.getByTestId("danh-sach-anh-chon").boundingBox();
    expect(hop!.x + hop!.width).toBeLessThanOrEqual(390);
  } finally {
    await ctx.close();
  }
});
