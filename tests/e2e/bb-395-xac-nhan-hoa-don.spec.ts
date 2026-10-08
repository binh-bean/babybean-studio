/**
 * BB-395 — xác nhận phát sinh bằng MÃ HOÁ ĐƠN (nguồn hoá đơn GIẢ — `PHEP_THU_TRINH_DUYET=1`,
 * mã HD_20990101#9xxx; KHÔNG gọi Lark).
 *
 *   1. Khớp: CSKH nhập HĐ 9002 (2 file) cho bộ vượt 2 → "Khớp", bộ khoá (in_retouch), hạn mức 12,
 *      sổ có dòng mang mã hoá đơn + mã phiếu thu, còn phải thu 0. Đồng bộ lại → không thêm dòng.
 *   2. Thiếu → bỏ mục → khớp: HĐ 9004 (1 file) cho bộ vượt 2 → "Thiếu" kèm 50.000; tích "Bỏ" →
 *      "Khớp", khách còn 11 ảnh chọn.
 *   3. Thừa: HĐ 9003 (5 file) cho bộ vượt 3 → "Thừa", "Còn 2 ảnh đã trả"; màn khách hiện
 *      "Ba mẹ còn 2 ảnh đã thanh toán…".
 *   4. CSKH (không có `thanh_toan:nhap_tay`) KHÔNG thấy form nhập tay; chủ studio thấy trong mục dự phòng.
 *   5. Khách 2 bộ: gán từ tab "Ảnh vượt hạn mức" → gợi ý đúng bộ theo dòng Hậu Kỳ, bấm chọn mới gán.
 *   6. Một mã một bộ: gán lại 9002 cho bộ khác → bị chặn.
 *
 * Dữ liệu: tests/fixtures/bb-395.ts (nền Fixture riêng, dọn theo id ở afterAll).
 * Chạy: PW_PORT=3210 npx playwright test tests/e2e/bb-395-xac-nhan-hoa-don.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { duLieuBB395, donDepBB395, type DuLieuBB395 } from "../fixtures/bb-395";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

let d: DuLieuBB395;
const THU_MUC = "test-results/bb-395";
fs.mkdirSync(THU_MUC, { recursive: true });

test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);

test.beforeAll(async () => {
  d = await duLieuBB395();
});

test.afterAll(async () => {
  if (d) await donDepBB395(d);
  for (const f of [".phien-cs.json", ".phien-owner.json"]) fs.rmSync(path.join(THU_MUC, f), { force: true });
});

async function mo(browser: Browser, baseURL: string, vai: "cs" | "owner", url: string) {
  const phien = path.join(THU_MUC, `.phien-${vai}.json`);
  if (!fs.existsSync(phien)) {
    const c0 = await browser.newContext({ baseURL });
    const p0 = await c0.newPage();
    await dangNhapNhanVien(p0, vai === "cs" ? d.emailCs : d.emailOwner, d.password);
    await c0.storageState({ path: phien });
    await c0.close();
  }
  const ctx: BrowserContext = await browser.newContext({ baseURL, storageState: phien, viewport: { width: 1440, height: 900 } });
  const page: Page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return { page, ctx };
}

async function dongBo(page: Page, ma: string) {
  const khoi = page.getByTestId("khoi-thanh-toan-chi-tiet").getByTestId("khoi-hoa-don");
  await expect(khoi).toBeVisible({ timeout: 30_000 });
  await khoi.getByTestId("o-ma-hoa-don").fill(ma);
  await khoi.getByTestId("nut-dong-bo-hoa-don").click();
  return khoi;
}

test("1. Khớp: xác nhận luôn — khoá đợt, nâng hạn mức, sổ có mã hoá đơn; đồng bộ lại không nhân đôi", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "cs", `/admin/galleries/${d.bo.khop}#thanh-toan`);
  try {
    const khoi = await dongBo(page, "HD_20990101#9002");
    await expect(khoi.getByTestId("thong-bao-hoa-don")).toContainText("Khớp hoá đơn", { timeout: 30_000 });
    await expect(khoi.locator('[data-testid="dong-hoa-don"][data-ma="HD_20990101#9002"] [data-testid="nhan-trang-thai-hoa-don"]')).toHaveAttribute(
      "data-trang-thai",
      "khop",
    );
    await khoi.screenshot({ path: path.join(THU_MUC, "1-khop.png") });

    const { rows: g } = await d.pg.query(`select status::text s, app.gallery_quota(id) q from galleries where id = $1`, [d.bo.khop]);
    expect(g[0]).toEqual({ s: "in_retouch", q: 12 });
    const { rows: so } = await d.pg.query(
      `select amount::int a, ma_hoa_don, ma_phieu_thu, payment_method from gallery_payments where gallery_id = $1`,
      [d.bo.khop],
    );
    expect(so).toHaveLength(1);
    expect(so[0]).toMatchObject({ a: 100000, ma_hoa_don: "HD_20990101#9002", payment_method: "chuyen_khoan" });
    expect(String(so[0].ma_phieu_thu)).toMatch(/^THU-20990101#/);

    // Đồng bộ lại cùng mã (ô trống = đồng bộ các mã đã gán): không thêm dòng sổ, không thêm hạn mức.
    await khoi.getByTestId("nut-dong-bo-hoa-don").click();
    await expect(khoi.getByTestId("thong-bao-hoa-don")).toBeVisible({ timeout: 30_000 });
    const { rows: lai } = await d.pg.query(
      `select (select count(*)::int from gallery_payments where gallery_id = $1) n, app.gallery_quota($1) q`,
      [d.bo.khop],
    );
    expect(lai[0]).toEqual({ n: 1, q: 12 });
  } finally {
    await ctx.close();
  }
});

test("2. Thiếu → tích Bỏ mục dư → Khớp", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "cs", `/admin/galleries/${d.bo.thieu}#thanh-toan`);
  try {
    const khoi = await dongBo(page, "HD_20990101#9004");
    const dongFile = khoi.locator('[data-testid="dong-doi-chieu"][data-khoa="file"]');
    await expect(dongFile).toBeVisible({ timeout: 30_000 });
    await expect(dongFile).toContainText("50.000");
    await expect(dongFile.getByTestId("nhan-trang-thai-hoa-don")).toHaveAttribute("data-trang-thai", "thieu");
    await khoi.screenshot({ path: path.join(THU_MUC, "2-thieu.png") });

    // Vòng 2: danh sách ảnh (thu nhỏ + tên tệp), TÍCH SẴN 1 ảnh chọn sau cùng; nút "Bỏ 1 ảnh đã tích".
    const ds = khoi.getByTestId("ds-anh-bo");
    await expect(ds).toBeVisible({ timeout: 30_000 });
    await expect(ds.getByTestId("tich-bo-anh").and(page.locator(":checked"))).toHaveCount(1);
    await expect(ds).toContainText("R01_0012.JPG");
    await khoi.screenshot({ path: path.join(THU_MUC, "2-danh-sach-anh-bo.png") });
    // Đổi tích: bỏ tích ảnh sau cùng, tích một ảnh khác — vẫn đúng 1.
    const tich = ds.getByTestId("tich-bo-anh");
    await tich.nth(0).uncheck();
    await expect(ds.getByTestId("nut-bo-anh")).toBeDisabled();
    await tich.nth(1).check();
    await expect(ds.getByTestId("nut-bo-anh")).toHaveText("Bỏ 1 ảnh đã tích");
    await ds.getByTestId("nut-bo-anh").click();
    await expect(khoi.getByTestId("thong-bao-hoa-don")).toContainText("Khớp hoá đơn", { timeout: 30_000 });
    const { rows } = await d.pg.query(
      `select count(*)::int n from selection_items si join selections s on s.id = si.selection_id
        where s.gallery_id = $1 and s.is_primary and si.mark = 'selected'`,
      [d.bo.thieu],
    );
    expect(rows[0].n).toBe(11);
    // Ảnh được bỏ là ảnh nhân viên ĐÃ ĐỔI tích (R01_0011), không phải ảnh sau cùng; nhật ký có id ảnh.
    const { rows: con } = await d.pg.query(
      `select p.file_name from selection_items si join photos p on p.id = si.photo_id where si.gallery_id = $1 and p.file_name in ('R01_0011.JPG','R01_0012.JPG')`,
      [d.bo.thieu],
    );
    expect(con.map((r: { file_name: string }) => r.file_name)).toEqual(["R01_0012.JPG"]);
    const { rows: nk } = await d.pg.query(
      `select metadata from activity_logs where entity_id = $1 and action = 'gallery.hoa_don_bo_muc'`,
      [d.bo.thieu],
    );
    expect((nk[0]?.metadata?.photoIds ?? []).length).toBe(1);
  } finally {
    await ctx.close();
  }
});

test("3. Thừa: còn 2 ảnh đã trả — nhân viên thấy lối chọn hộ, khách thấy lời Bean", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "cs", `/admin/galleries/${d.bo.thua}#thanh-toan`);
  try {
    const khoi = await dongBo(page, "HD_20990101#9003");
    await expect(khoi.getByTestId("con-anh-da-tra")).toContainText("Còn 2 ảnh đã trả", { timeout: 30_000 });
    await expect(khoi.getByRole("button", { name: "Mở trang khách để chọn hộ" })).toBeVisible();
    const { rows } = await d.pg.query(`select app.gallery_quota($1) q`, [d.bo.thua]);
    expect(rows[0].q).toBe(15);
  } finally {
    await ctx.close();
  }

  const khach = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const p = await khach.newPage();
    await p.goto(`/g/${d.tokenThua}`, { waitUntil: "domcontentloaded" });
    await expect(p.getByTestId("the-anh-da-tra-con-lai")).toHaveText("Ba mẹ còn 2 ảnh đã thanh toán, ba mẹ chọn tiếp nhé ạ", {
      timeout: 40_000,
    });
    await p.screenshot({ path: path.join(THU_MUC, "3-khach-con-anh-da-tra.png") });
  } finally {
    await khach.close();
  }
});

test("4. CSKH không thấy nhập tay; chủ studio thấy trong mục dự phòng", async ({ browser, baseURL }) => {
  const cs = await mo(browser, baseURL!, "cs", `/admin/galleries/${d.bo.haiBoD}#thanh-toan`);
  try {
    const khoi = cs.page.getByTestId("khoi-thanh-toan-chi-tiet");
    await expect(khoi.getByTestId("khoi-hoa-don")).toBeVisible({ timeout: 30_000 });
    await expect(khoi.getByTestId("nhap-tay-du-phong")).toHaveCount(0);
    await expect(khoi.getByRole("button", { name: "Ghi nhận đã thu" })).toHaveCount(0);
    // Máy chủ cũng chặn (không chỉ giấu nút).
    const r = await cs.ctx.request.post(`/api/admin/galleries/${d.bo.haiBoD}/payments`, {
      data: { amount: 50000, method: "tien_mat", note: "thử" },
    });
    expect(r.status()).toBe(403);
  } finally {
    await cs.ctx.close();
  }
  const owner = await mo(browser, baseURL!, "owner", `/admin/galleries/${d.bo.haiBoD}#thanh-toan`);
  try {
    await expect(owner.page.getByTestId("nhap-tay-du-phong")).toBeVisible({ timeout: 30_000 });
  } finally {
    await owner.ctx.close();
  }
});

test("5. Khách 2 bộ: gợi ý đúng bộ theo dòng Hậu Kỳ, bấm chọn mới gán", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "cs", "/admin/viec-can-xu-ly?tab=over-quota");
  try {
    const khoi = page.getByTestId("gan-hoa-don-theo-khach");
    await expect(khoi).toBeVisible({ timeout: 40_000 });
    await khoi.getByTestId("o-ma-hoa-don-theo-khach").fill("HD_20990101#9009");
    await khoi.getByTestId("nut-tim-bo-theo-hoa-don").click();
    const ds = khoi.getByTestId("bo-ung-vien");
    await expect(ds.first()).toBeVisible({ timeout: 30_000 });
    // Cả hai bộ của khách đều được liệt kê; chưa gán gì cho tới khi bấm.
    await expect(ds.filter({ hasText: "hai-bo-d" })).toHaveCount(1);
    const goiY = khoi.locator('[data-testid="bo-ung-vien"][data-goi-y="1"]');
    await expect(goiY).toContainText("hai-bo-e");
    const { rows: truoc } = await d.pg.query(`select count(*)::int n from hoa_don_bo_anh where ma_hoa_don = 'HD_20990101#9009'`);
    expect(truoc[0].n).toBe(0);
    await khoi.screenshot({ path: path.join(THU_MUC, "5-goi-y-hai-bo.png") });

    await goiY.getByRole("button", { name: "Gán vào bộ này" }).click();
    await expect.poll(async () => {
      const { rows } = await d.pg.query(`select gallery_id from hoa_don_bo_anh where ma_hoa_don = 'HD_20990101#9009'`);
      return rows[0]?.gallery_id ?? null;
    }, { timeout: 30_000 }).toBe(d.bo.haiBoE);
  } finally {
    await ctx.close();
  }
});

test("6. Một mã một bộ: gán 9002 (đã thuộc bộ khớp) cho bộ khác → bị chặn", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "cs", `/admin/galleries/${d.bo.haiBoD}#thanh-toan`);
  try {
    const khoi = await dongBo(page, "HD_20990101#9002");
    await expect(khoi.getByTestId("thong-bao-hoa-don")).toContainText("đã gán cho một bộ ảnh khác", { timeout: 30_000 });
    const { rows } = await d.pg.query(`select gallery_id from hoa_don_bo_anh where ma_hoa_don = 'HD_20990101#9002'`);
    expect(rows).toEqual([{ gallery_id: d.bo.khop }]);
  } finally {
    await ctx.close();
  }
});

test("7. Đợt 2: hoá đơn trả tien_anh của đợt → đợt xác nhận, hạn mức KHÔNG đổi; bấm đường cũ → vẫn 0", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "cs", `/admin/galleries/${d.bo.dot2}#thanh-toan`);
  try {
    const tien = async () => (await (await ctx.request.get(`/api/admin/galleries/${d.bo.dot2}/payments`)).json()).data;
    // Cần migration 0103 (view chỉ đếm ảnh đợt 1): trước khi xác nhận, đợt 2 còn chờ → phải thu 0.
    expect((await tien()).amountToCollect).toBe(0);
    const khoi = await dongBo(page, "HD_20990101#9010");
    await expect(khoi.locator('[data-testid="dong-doi-chieu"][data-khoa="dot:2"] [data-testid="nhan-trang-thai-hoa-don"]')).toHaveAttribute(
      "data-trang-thai",
      "khop",
      { timeout: 30_000 },
    );
    await khoi.screenshot({ path: path.join(THU_MUC, "7-dot-2.png") });
    const { rows } = await d.pg.query(
      `select r.trang_thai, r.ma_hoa_don, r.ma_phieu_thu, r.da_thanh_toan_luc is not null tt, app.gallery_quota(r.gallery_id) q
         from selection_rounds r where r.gallery_id = $1 and r.so_dot = 2`,
      [d.bo.dot2],
    );
    expect(rows[0]).toMatchObject({ trang_thai: "da_xac_nhan", ma_hoa_don: "HD_20990101#9010", tt: true, q: 10 });
    expect(String(rows[0].ma_phieu_thu)).toMatch(/^THU-20990101#/);

    // tien_anh của đợt (100.000) KHÔNG vào "Phải thu"; tiền hoá đơn (90.000) vào sổ và tự triệt tiêu.
    expect((await tien()).amountToCollect).toBe(0);
    expect((await tien()).outstanding).toBe(0);
    // Đường cũ: "Xác nhận đợt" — đợt đã xác nhận nên route từ chối, và tien_anh KHÔNG bị đòi lần hai.
    const cu = await ctx.request.post(`/api/admin/galleries/${d.bo.dot2}/dot-chon/2/xac-nhan`, { data: {} });
    expect(cu.status()).toBe(409);
    expect((await tien()).amountToCollect).toBe(0);
    expect((await tien()).outstanding).toBe(0);
  } finally {
    await ctx.close();
  }
});

test("7b. (0103) Bộ không vượt đợt 1 + đợt 2 chưa xác nhận: vượt hạn mức đợt 1 = 0; xác nhận đợt → phải thu = tien_anh MỘT lần", async ({
  browser,
  baseURL,
}) => {
  const { ctx } = await mo(browser, baseURL!, "owner", "about:blank");
  try {
    // View chỉ đếm ảnh đợt 1: 10/10 → bộ không nằm trong "vượt hạn mức chưa thu".
    const { rows: v } = await d.pg.query(`select count(*)::int n from v_over_quota_unbilled where gallery_id = $1`, [d.bo.dot2b]);
    expect(v[0].n).toBe(0);
    const tien = async () => (await (await ctx.request.get(`/api/admin/galleries/${d.bo.dot2b}/payments`)).json()).data;
    expect((await tien()).amountToCollect).toBe(0); // đợt 2 còn chờ → chưa phải thu
    const xn = await ctx.request.post(`/api/admin/galleries/${d.bo.dot2b}/dot-chon/2/xac-nhan`, { data: {} });
    expect(xn.status()).toBe(200);
    const sau = await tien();
    expect(sau.amountToCollect).toBe(100_000); // 2 ảnh × 50.000 — một lần, không cộng thêm "vượt"
    expect(sau.dueAmount).toBe(100_000);
    // Báo cáo "Ảnh vượt hạn mức" không đòi 2 ảnh đợt 2.
    const bc = await (await ctx.request.get(`/api/admin/reports/over-quota`)).json();
    expect((bc.data.items as { galleryId: string }[]).some((i) => i.galleryId === d.bo.dot2b)).toBe(false);
  } finally {
    await ctx.close();
  }
});

test("8. Trang khách hàng: gán theo khách — hoá đơn của khách khác bị chặn", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "cs", `/admin/customers/${d.customerId}`);
  try {
    const khoi = page.getByTestId("gan-hoa-don-theo-khach");
    await expect(khoi).toBeVisible({ timeout: 40_000 });
    await khoi.getByTestId("o-ma-hoa-don-theo-khach").fill("HD_20990101#9007");
    await khoi.getByTestId("nut-tim-bo-theo-hoa-don").click();
    await expect(khoi).toContainText("Hoá đơn này của khách khác", { timeout: 30_000 });
    await expect(khoi.getByTestId("bo-ung-vien")).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
