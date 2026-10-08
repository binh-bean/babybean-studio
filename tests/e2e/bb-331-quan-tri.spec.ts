/**
 * BB-331 — Admin: chi nhánh xoá được (khi rỗng), dòng vượt hạn mức tự xử lý
 * được, Bàn làm việc đổi thứ tự khối + bỏ chi nhánh Fixture, Cài đặt bày đủ
 * kích thước đang bán.
 *
 * Dữ liệu: tests/fixtures/danh-gia.ts ("Fixture DANHGIA5-…", dọn theo id) +
 * MỘT chi nhánh rỗng "Fixture BB-331-<run> Chi nhánh" để xoá qua giao diện.
 * Chạy: PW_PORT=3196 npx playwright test tests/e2e/bb-331-quan-tri.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { duLieuDanhGia5, donDep, type DuLieuDanhGia5 } from "../fixtures/danh-gia";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

let d: DuLieuDanhGia5;
let chiNhanhRongId = "";
const runId = Math.random().toString(36).slice(2, 8);
const TEN_RONG = `Fixture BB-331-${runId} Chi nhánh`;
const THU_MUC = "test-results/bb-331";
fs.mkdirSync(THU_MUC, { recursive: true });
const PHIEN = path.join(THU_MUC, ".phien-owner.json");
const CHUP = process.env.BB331_CHUP;

test.setTimeout(150_000);

test.beforeAll(async () => {
  d = await duLieuDanhGia5();
  const { rows } = await d.pg.query(
    `insert into branches (code, name, is_active) values ($1,$2,true) returning id`,
    [`FIXTURE-BB331-${runId}`.toUpperCase(), TEN_RONG],
  );
  chiNhanhRongId = rows[0].id;
});

test.afterAll(async () => {
  if (!d) return;
  if (chiNhanhRongId) {
    await d.pg.query(`update activity_logs set branch_id = null where branch_id = $1`, [chiNhanhRongId]).catch(() => {});
    await d.pg.query(`delete from activity_logs where entity_id = $1`, [chiNhanhRongId]).catch(() => {});
    await d.pg.query(`delete from branches where id = $1`, [chiNhanhRongId]).catch(() => {});
  }
  const branchId = d.branchId;
  const pg = d.pg;
  const { rows: con } = await pg
    .query(`select count(*)::int n from branches where name = $1`, [TEN_RONG])
    .catch(() => ({ rows: [{ n: -1 }] }));
  await donDep(d);
  expect(con[0].n, "chi nhánh rỗng đã dọn").toBe(0);
  // donDep đóng pg — kiểm bằng kết nối mới rằng chi nhánh fixture đã đi hẳn.
  const { Client } = await import("pg");
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await c.connect();
  const { rows } = await c.query(`select count(*)::int n from branches where id = $1`, [branchId]);
  await c.end();
  expect(rows[0].n, "chi nhánh Fixture DANHGIA5 của lượt này đã dọn sạch").toBe(0);
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
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  return { page, ctx };
}

test("Chi nhánh: còn bộ ảnh thì nói lý do + mời Ngừng hoạt động; rỗng thì xoá được", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "/admin/branches");
  try {
    const bang = page.locator("table");
    // Chi nhánh fixture có bộ ảnh + nhân sự → bấm Xoá chỉ hiện lý do, KHÔNG gọi API.
    const dongCo = bang.locator("tr", { hasText: `DANHGIA5-${d.runId}` }).first();
    await expect(dongCo).toBeVisible({ timeout: 30_000 });
    let goiXoa = 0;
    page.on("request", (r) => {
      if (r.method() === "DELETE" && r.url().includes("/api/admin/branches/")) goiXoa++;
    });
    await dongCo.getByTestId("nut-xoa-chi-nhanh").click();
    const lyDo = page.getByTestId("ly-do-khong-xoa-chi-nhanh").first();
    await expect(lyDo).toBeVisible();
    await expect(lyDo).toContainText("bộ ảnh");
    await expect(lyDo.getByRole("button", { name: "Ngừng hoạt động" })).toBeVisible();
    expect(goiXoa).toBe(0);
    if (CHUP) await page.screenshot({ path: path.join(CHUP, "chi-nhanh-ly-do.png") });

    // Chi nhánh rỗng → xác nhận → biến mất khỏi danh sách và khỏi CSDL.
    const dongRong = bang.locator("tr", { hasText: TEN_RONG });
    await expect(dongRong).toBeVisible();
    page.once("dialog", (dl) => void dl.accept());
    await dongRong.getByTestId("nut-xoa-chi-nhanh").click();
    await expect(page.getByRole("status")).toContainText(`Đã xoá chi nhánh ${TEN_RONG}`);
    await expect(bang.locator("tr", { hasText: TEN_RONG })).toHaveCount(0);
    const { rows } = await d.pg.query(`select count(*)::int n from branches where id = $1`, [chiNhanhRongId]);
    expect(rows[0].n).toBe(0);
    chiNhanhRongId = "";
  } finally {
    await ctx.close();
  }
});

test("Ảnh vượt hạn mức: mỗi dòng có Xác nhận thanh toán / Mở bộ ảnh / Nhắc khách; thu đủ là dòng rời danh sách", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "/admin/viec-can-xu-ly?tab=over-quota");
  try {
    const lienKet = page.locator(`table [data-testid="mo-bo-anh"][href="/admin/galleries/${d.chinh.id}"]`);
    await expect(lienKet).toBeVisible({ timeout: 30_000 });
    // Hàng thao tác nằm NGAY dưới hàng số liệu của đúng bộ đó.
    const hangThaoTac = lienKet.locator("xpath=ancestor::tr[1]/following-sibling::tr[1]");
    const thaoTac = hangThaoTac.getByTestId("thao-tac-vuot-han-muc");
    await expect(thaoTac.getByTestId("nut-xac-nhan-thanh-toan")).toBeVisible();
    await expect(thaoTac.getByTestId("nut-mo-bo-anh")).toHaveAttribute("href", `/admin/galleries/${d.chinh.id}#thanh-toan`);
    await expect(thaoTac.getByRole("button", { name: "Nhắc khách" })).toBeVisible();

    await thaoTac.getByTestId("nut-xac-nhan-thanh-toan").click();
    const form = hangThaoTac.getByTestId("form-thanh-toan-vuot-han-muc");
    await expect(form).toBeVisible();
    // BB-395: đường chính là mã hoá đơn; nhập tay (chủ studio có quyền) nằm trong mục dự phòng, bắt lý do.
    await expect(form.getByTestId("khoi-hoa-don")).toBeVisible({ timeout: 20_000 });
    await form.getByTestId("nhap-tay-du-phong").locator("summary").click();
    await form.locator('input[name="note"]').fill("Fixture BB-331 nhập tay");
    // Đúng form BB-320: có ô Giảm giá %, số tiền điền sẵn bằng số còn phải thu.
    await expect(form.locator('input[name="giamGiaPhanTram"]')).toBeVisible();
    const soTien = Number(await form.locator('input[name="amount"]').inputValue());
    expect(soTien).toBeGreaterThan(0);
    if (CHUP) await page.screenshot({ path: path.join(CHUP, "vuot-han-muc-form.png") });
    await form.getByRole("button", { name: "Ghi nhận đã thu" }).click();

    await expect(page.getByTestId("thong-bao-da-xu-ly")).toContainText("rời danh sách", { timeout: 20_000 });
    await expect(page.locator(`[data-testid="mo-bo-anh"][href="/admin/galleries/${d.chinh.id}"]`)).toHaveCount(0);
    const { rows } = await d.pg.query(`select coalesce(sum(amount),0)::int s from gallery_payments where gallery_id = $1`, [d.chinh.id]);
    expect(rows[0].s).toBe(soTien);
  } finally {
    await ctx.close();
  }
});

test("Bàn làm việc: Việc hôm nay xuống cuối; Theo chi nhánh không có Fixture", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "/admin");
  try {
    const cuoi = page.getByTestId("khoi-viec-hom-nay-cuoi");
    await expect(cuoi).toBeVisible({ timeout: 30_000 });
    // Là khối CUỐI của trang: không còn thẻ nào nằm dưới nó.
    const laCuoi = await cuoi.evaluate((el) => el.nextElementSibling === null);
    expect(laCuoi).toBe(true);
    const yViec = (await cuoi.boundingBox())!.y;
    const yBieuDo = (await page.getByText("Bộ ảnh mới (14 ngày)").boundingBox())!.y;
    expect(yViec).toBeGreaterThan(yBieuDo);
    // Hai khối theo chi nhánh không còn tên chi nhánh "Fixture …" (lượt này có
    // đơn mua thêm ở chi nhánh Fixture DANHGIA5 — trước bản vá nó đứng đầu).
    for (const tieuDe of ["Theo chi nhánh", "Tiến độ theo chi nhánh"]) {
      const the = page.getByText(tieuDe, { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
      await expect(the).toBeVisible();
      await expect(the.getByText(/Fixture/)).toHaveCount(0);
    }
    if (CHUP) await page.screenshot({ path: path.join(CHUP, "ban-lam-viec.png"), fullPage: true });
  } finally {
    await ctx.close();
  }
});

test("Cài đặt: bày đủ kích thước đang bán, kể cả kích thước khách chưa thấy", async ({ browser, baseURL }) => {
  const { page, ctx } = await mo(browser, baseURL!, "/admin/settings");
  try {
    const khoi = page.getByTestId("danh-muc-kich-thuoc");
    await expect(khoi).toBeVisible({ timeout: 30_000 });
    await expect(khoi.locator('[data-trang-thai="khach_thay"]').first()).toBeVisible();
    // Anh chốt 30/09: có giá là khách thấy, không còn ngưỡng số lần bán.
    expect(await khoi.locator('[data-trang-thai="thieu_mau_gia"]').count()).toBe(0);
    // Lỗi thời (không do BB-395): bảng giá anh gửi 01/10 CÓ bán "Kim Tuyến" — danh mục Lark đặt tên
    // chất liệu là "Cavas/Kim tuyến" (bb-dev 08/10: 30×45 … 80×120). Vẫn cấm canvas THUẦN (không
    // kèm Kim tuyến), và bắt buộc nhóm Kim tuyến phải hiện (27/09 từng bị ẩn nhầm vì chữ "canvas").
    await expect(khoi).not.toContainText(/(canvas|cavas)(?!\s*\/\s*kim\s*tuy)/i);
    await expect(khoi).toContainText(/kim tuyến/i);
    if (CHUP) await khoi.screenshot({ path: path.join(CHUP, "kich-thuoc.png") });
  } finally {
    await ctx.close();
  }
});
