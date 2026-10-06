/**
 * BB-374 — "Ảnh album không chỉnh sửa" trên trình duyệt.
 *
 * Ca 1 (luôn chạy) — GIAO DIỆN khách + quản trị trên bộ ảnh Fixture thật, chỉ giả lập BIÊN
 *   GIỚI mạng (AGENTS §5a: giả lập fetch thì được): thêm `albumKhongChinh` vào phản hồi
 *   /api/g/gallery và trả lời /api/g/album-khong-chinh bằng một kho trong bộ nhớ. Canh: câu
 *   Bean "chọn thêm N tấm", bộ đếm x/N RIÊNG, chọn đủ N thì tấm N+1 bị khoá, dấu trên lưới,
 *   bộ đếm ảnh chỉnh sửa KHÔNG nhích. Cần cho tới khi 0092/0093 được áp (route thật trả
 *   "chưa có suất" vì chưa có sản phẩm loại `album_unedited`).
 *
 * Ca 2 (sau 0092 + 0093) — luồng THẬT đầu-cuối: CSKH "Thêm sản phẩm" 5 suất → khách chọn 5
 *   tấm "cho album" → tổng tiền 0 → xuất "Thông tin chi tiết" đánh dấu đúng 5 dòng
 *   "Không chỉnh — cho album". Chưa áp migration thì tự bỏ qua kèm lý do.
 *
 * Dữ liệu "Fixture BB-374 …" (tests/fixtures/bb-345.ts, chi nhánh riêng) + sản phẩm "Mẫu kiểm
 * thử BB-374 …", dọn theo id ở afterAll. Không gọi Lark.
 *
 * Chạy: PW_PORT=3374 npx playwright test tests/e2e/bb-374-anh-album-khong-chinh.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page, Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { taoBb345, donBb345, type DuLieuBb345 } from "../fixtures/bb-345";
import { donNenFixture } from "../fixtures/nen-fixture";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { thuMucAnh } from "./helpers/thu-muc-anh";

const ANH_CHUP = thuMucAnh("dot17", "bb374");
fs.mkdirSync(ANH_CHUP, { recursive: true });
const SO_SUAT = 5;

let d: DuLieuBb345;
let coMigration = false;
const productIds: string[] = [];

test.setTimeout(240_000);

test.beforeAll(async () => {
  d = await taoBb345({ nhan: "Fixture BB-374", soAnhA: 8, taoNhanVien: true });
  const { rows: en } = await d.pg.query(
    `select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'product_kind' and e.enumlabel = 'album_unedited'`,
  );
  const { rows: bang } = await d.pg.query(`select to_regclass('public.anh_album_khong_chinh')::text as t`);
  coMigration = en.length > 0 && !!bang[0]?.t;
  // Hạn mức chỉnh sửa = 3 (Edit file ×3) — đủ cho phép thử, không ai vượt.
  const pEdit = randomUUID();
  await d.pg.query(
    `insert into products (id, name, kind, list_price, is_active) values ($1,'Fixture BB-374 Edit file','edited_photo',50000,false)`,
    [pEdit],
  );
  productIds.push(pEdit);
  await d.pg.query(`insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,3,0)`, [d.A.id, pEdit]);
});

test.afterAll(async () => {
  if (!d) return;
  // Nhân sự thử giữ chi nhánh (staff_branches) — gỡ trước để donNenFixture xoá được chi nhánh.
  if (d.staff) await d.pg.query(`delete from staff_branches where staff_id = $1`, [d.staff.id]).catch(() => {});
  try {
    await donNenFixture(d.pg, {
      galleryIds: [d.A.id, d.B.id],
      branchIds: [d.branchId],
      productIds,
      staffIds: d.staff ? [d.staff.id] : [],
    });
  } finally {
    d.staff = undefined;
    await donBb345(d);
  }
});

/** Kho giả của route chọn tấm — giữ đúng luật của máy chủ (không vượt N, không trùng tim). */
function giaLapApi(page: Page, soSuat: number) {
  const daChon: string[] = [];
  page.route("**/api/g/gallery**", async (route: Route) => {
    const res = await route.fetch();
    const json = await res.json();
    if (json?.data) json.data.albumKhongChinh = { soSuat, photoIds: [...daChon] };
    await route.fulfill({ response: res, json });
  });
  page.route("**/api/g/album-khong-chinh", async (route: Route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { photoId: string };
    if (route.request().method() === "POST") {
      if (!daChon.includes(body.photoId)) {
        if (daChon.length >= soSuat) {
          return route.fulfill({ status: 409, json: { error: { code: "CONFLICT", message: "Ba mẹ đã chọn đủ số tấm cho album rồi ạ." } } });
        }
        daChon.push(body.photoId);
      }
    } else {
      const i = daChon.indexOf(body.photoId);
      if (i >= 0) daChon.splice(i, 1);
    }
    return route.fulfill({ json: { data: { soSuat, photoIds: [...daChon] } } });
  });
  return daChon;
}

async function moAnhDau(page: Page) {
  const the = page.getByTestId("the-anh").first();
  await the.waitFor({ state: "visible", timeout: 60_000 });
  await the.getByRole("button", { name: /Xem ảnh 1/ }).click();
}

test("1. Giao diện: câu Bean, đếm x/N riêng, chọn đủ N thì khoá, dấu trên lưới", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    const daChon = giaLapApi(page, SO_SUAT);
    await page.goto(`/g/${d.A.maBaMe}`, { waitUntil: "domcontentloaded" });

    const the = page.getByTestId("the-album-khong-chinh");
    await expect(the).toBeVisible({ timeout: 60_000 });
    await expect(the).toContainText(`Ba mẹ được chọn thêm ${SO_SUAT} tấm cho album, Bean giữ nguyên không chỉnh`);
    await expect(page.getByTestId("dem-the-album-khong-chinh")).toHaveText(`0/${SO_SUAT} tấm cho album`);
    await the.screenshot({ path: path.join(ANH_CHUP, "khach-the-loi-moi.png") });

    await moAnhDau(page);
    const dialog = page.getByRole("dialog");
    for (let i = 0; i < SO_SUAT; i++) {
      const nut = dialog.getByTestId("nut-album-khong-chinh");
      await expect(nut).toBeEnabled({ timeout: 30_000 });
      await expect(nut).toContainText("Chọn tấm này cho album");
      await nut.click();
      await expect(dialog.getByTestId("dem-album-khong-chinh")).toContainText(`${i + 1}/${SO_SUAT} tấm`);
      await expect(nut).toContainText("Cho album · không chỉnh sửa");
      if (i === 0) {
        await dialog.getByTestId("khoi-album-khong-chinh").screenshot({ path: path.join(ANH_CHUP, "xem-lon-da-chon.png") });
        await page.screenshot({ path: path.join(ANH_CHUP, "xem-lon-toan-man.png") });
      }
      await page.keyboard.press("ArrowRight");
    }
    // Tấm thứ N+1: đủ rồi — nút khoá, nói rõ.
    const nut6 = dialog.getByTestId("nut-album-khong-chinh");
    await expect(nut6).toBeDisabled();
    await expect(nut6).toContainText("Đã đủ tấm cho album");
    await dialog.getByTestId("khoi-album-khong-chinh").screenshot({ path: path.join(ANH_CHUP, "xem-lon-da-du.png") });
    expect(daChon).toHaveLength(SO_SUAT);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("dem-the-album-khong-chinh")).toHaveText(`${SO_SUAT}/${SO_SUAT} tấm cho album`);
    await expect(page.getByTestId("dau-album-khong-chinh")).toHaveCount(SO_SUAT);
    await page.getByTestId("dau-album-khong-chinh").first().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, -200);
    // Không tấm nào thành ảnh chỉnh sửa: không trái tim nào được bật.
    await expect(page.getByTestId("the-anh").getByRole("button", { name: "Bỏ chọn" })).toHaveCount(0);
    await page.screenshot({ path: path.join(ANH_CHUP, "khach-luoi-co-dau.png") });
  } finally {
    await ctx.close();
  }
});

test("1c. Điện thoại: mục ảnh album không chỉnh sửa trong tấm trượt 'Đặt in'", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  try {
    giaLapApi(page, SO_SUAT);
    await page.goto(`/g/${d.A.maBaMe}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("the-album-khong-chinh")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("the-album-khong-chinh").screenshot({ path: path.join(ANH_CHUP, "dien-thoai-the-loi-moi.png") });
    await moAnhDau(page);
    const dialog = page.getByRole("dialog");
    // Bảng sản phẩm dựng ở hai chỗ (cột phải máy tính đang ẩn + tấm trượt điện thoại): lấy bản đang hiện.
    const nut = dialog.locator('[data-testid="nut-album-khong-chinh"]:visible');
    // Điện thoại: mục này nằm trong tấm trượt "Đặt in" (thanh Tim · Ghi chú · Đặt in ở đáy).
    if (!(await nut.isVisible())) await dialog.locator('button:has-text("Đặt in"):visible').first().click();
    await expect(nut).toBeVisible({ timeout: 30_000 });
    await nut.click();
    await expect(dialog.locator('[data-testid="dem-album-khong-chinh"]:visible')).toContainText(`1/${SO_SUAT} tấm`);
    await page.screenshot({ path: path.join(ANH_CHUP, "dien-thoai-xem-lon.png") });
  } finally {
    await ctx.close();
  }
});

test("1b. Quản trị: khối 'Ảnh album không chỉnh sửa' tách khỏi ảnh chỉnh sửa", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    // Giả lập biên giới: thêm `albumKhongChinh` vào phản hồi thật của route quản trị.
    const anh = d.A.anh.slice(3, 5).map((a) => ({ photoId: a.id, fileName: a.fileName }));
    await page.route(`**/api/admin/galleries/${d.A.id}/items`, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const res = await route.fetch();
      const json = await res.json();
      if (json?.data) json.data.albumKhongChinh = { coBang: true, soSuat: SO_SUAT, anh };
      await route.fulfill({ response: res, json });
    });
    await dangNhapNhanVien(page, d.staff!.email, d.staff!.password);
    await page.goto(`/admin/galleries/${d.A.id}`, { waitUntil: "domcontentloaded" });
    const khoi = page.getByTestId("khoi-quan-tri-album-khong-chinh");
    await expect(khoi).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("dem-quan-tri-album-khong-chinh")).toContainText(`2/${SO_SUAT} tấm · KHÔNG chỉnh · 0 ₫`);
    await expect(page.getByTestId("nhan-anh-khong-chinh")).toHaveText(anh.map((a) => a.fileName));
    await khoi.screenshot({ path: path.join(ANH_CHUP, "quan-tri-khoi-khong-chinh-gia-lap.png") });
  } finally {
    await ctx.close();
  }
});

test("2. (sau 0092/0093) CSKH thêm 5 suất → khách chọn 5 tấm → 0 ₫ → xuất đánh dấu đúng", async ({ browser, baseURL }) => {
  test.skip(!coMigration, "Chưa áp migration 0092 + 0093 (enum album_unedited / bảng anh_album_khong_chinh)");
  // Sản phẩm thử loại album_unedited, ĐANG BÁN để hiện trong ô "Thêm sản phẩm" của CSKH.
  // Khách không mua được (sanPhamBanChoKhach chặn theo loại) — xem tests/security/bb-374-….
  const pKc = randomUUID();
  await d.pg.query(
    `insert into products (id, name, kind, list_price, is_active) values ($1,'Mẫu kiểm thử BB-374 Ảnh album không chỉnh sửa','album_unedited',0,true)`,
    [pKc],
  );
  productIds.push(pKc);

  const ctxQt = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const qt = await ctxQt.newPage();
  const ctxKh = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const kh = await ctxKh.newPage();
  try {
    // (a) CSKH thêm 5 suất.
    await dangNhapNhanVien(qt, d.staff!.email, d.staff!.password);
    await qt.goto(`/admin/galleries/${d.A.id}`, { waitUntil: "domcontentloaded" });
    // BB-375 — "Thêm sản phẩm" là OChonTim (BB-340): danh sách > 7 mục (bb-dev có ~127 sản phẩm
    // đang bán) thì vẽ ô tìm (combobox + input ẩn cùng `name`), không có <select> nào —
    // `select[name=productId]` vì vậy không bao giờ hiện. Chọn theo đúng loại ô đang vẽ.
    const tenSp = "Mẫu kiểm thử BB-374 Ảnh album không chỉnh sửa";
    const chon = qt.locator('[name="productId"]').first();
    await chon.waitFor({ state: "attached", timeout: 60_000 });
    if ((await chon.evaluate((el) => el.tagName)) === "SELECT") {
      await chon.selectOption({ label: tenSp });
    } else {
      const hop = qt.getByRole("combobox", { name: "Thêm sản phẩm" });
      await hop.click();
      await hop.fill("album không chỉnh");
      // Sản phẩm thật của 0093 có trong danh sách chọn của CSKH.
      await expect(qt.getByRole("option", { name: "Ảnh album không chỉnh sửa", exact: true })).toBeVisible();
      await qt.getByRole("option", { name: tenSp, exact: true }).click();
    }
    await expect(chon).toHaveValue(pKc);
    // BB-375 — ô "Số lượng" của khối THÊM, không phải `input[name=quantity]` đầu tiên: bộ đã có
    // dòng "Edit file ×3" (beforeAll) nên ô đầu tiên là ô sửa số của dòng đó ("Số ảnh trong gói").
    await qt.getByRole("spinbutton", { name: "Số lượng", exact: true }).fill(String(SO_SUAT));
    await qt.getByRole("button", { name: "Thêm", exact: true }).first().click();
    await expect.poll(async () => {
      const { rows } = await d.pg.query(`select coalesce(sum(quantity),0)::int n from gallery_items where gallery_id = $1 and product_id = $2`, [d.A.id, pKc]);
      return rows[0].n;
    }, { timeout: 30_000 }).toBe(SO_SUAT);
    const { rows: hm } = await d.pg.query(`select app.gallery_quota($1) q`, [d.A.id]);
    expect(hm[0].q).toBe(3); // suất không cộng vào hạn mức

    // (b) Khách chọn 5 tấm cho album.
    await kh.goto(`/g/${d.A.maBaMe}`, { waitUntil: "domcontentloaded" });
    await expect(kh.getByTestId("dem-the-album-khong-chinh")).toHaveText(`0/${SO_SUAT} tấm cho album`, { timeout: 60_000 });
    await moAnhDau(kh);
    const dialog = kh.getByRole("dialog");
    for (let i = 0; i < SO_SUAT; i++) {
      await dialog.getByTestId("nut-album-khong-chinh").click();
      await expect(dialog.getByTestId("dem-album-khong-chinh")).toContainText(`${i + 1}/${SO_SUAT} tấm`);
      await kh.keyboard.press("ArrowRight");
    }
    await expect(dialog.getByTestId("nut-album-khong-chinh")).toBeDisabled();
    await kh.keyboard.press("Escape");

    // (c) Tiền: 0 — không ảnh chọn nào, không vượt hạn mức, Phải thu 0.
    const tien = await kh.evaluate(async () => (await (await fetch("/api/g/gallery")).json()).data.selection);
    expect(tien.extraAmount).toBe(0);
    expect(tien.selectedCount).toBe(0);
    const { rows: kc } = await d.pg.query(`select count(*)::int n from anh_album_khong_chinh where gallery_id = $1`, [d.A.id]);
    expect(kc[0].n).toBe(SO_SUAT);

    // (d) Quản trị: khối riêng + xuất "Thông tin chi tiết" đánh dấu đúng 5 dòng.
    await qt.reload({ waitUntil: "domcontentloaded" });
    await expect(qt.getByTestId("dem-quan-tri-album-khong-chinh")).toContainText(`${SO_SUAT}/${SO_SUAT} tấm`, { timeout: 60_000 });
    await qt.getByTestId("khoi-quan-tri-album-khong-chinh").screenshot({ path: path.join(ANH_CHUP, "quan-tri-khoi-khong-chinh.png") });
    const xuat = await qt.evaluate(async (id) => (await fetch(`/api/admin/galleries/${id}/export?format=chi-tiet&hien=1`)).text(), d.A.id);
    const dong = xuat.split(/\r?\n/);
    expect(dong.filter((x) => x.endsWith("(Dùng cho: Không chỉnh — cho album)"))).toHaveLength(SO_SUAT);
    expect(dong).toContain(`Ảnh album không chỉnh sửa: ${SO_SUAT}/${SO_SUAT} tấm (KHÔNG chỉnh — chỉ in vào album, 0 ₫)`);
    const csv = await qt.evaluate(async (id) => (await fetch(`/api/admin/galleries/${id}/export?format=csv&hien=1`)).text(), d.A.id);
    expect(csv.split(/\r?\n/).filter((x) => x.endsWith('"Không chỉnh — cho album"'))).toHaveLength(SO_SUAT);
    // Dạng "Tên file" (cho thợ lọc ảnh CẦN CHỈNH) không nhận tấm không chỉnh.
    const txt = await qt.evaluate(async (id) => (await fetch(`/api/admin/galleries/${id}/export?format=txt&hien=1`)).text(), d.A.id);
    expect(txt.trim()).toBe("");
  } finally {
    await ctxQt.close();
    await ctxKh.close();
  }
});
