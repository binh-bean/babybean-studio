/**
 * BB-399 — dịch vụ "Làm ảnh nhanh" (anh chốt 08/10/2026: tiêu chuẩn 14 ngày, làm nhanh 5 ngày,
 * giá lấy từ Lark).
 *
 *   1. Khách chốt CÓ tích "Làm ảnh nhanh" → hộp chốt hiện giá + số ngày từ dữ liệu, tạm tính cộng
 *      giá; màn sau chốt nói "trong khoảng <nhanh> ngày"; DB có MỘT dòng `selection_addons`
 *      (đợt 1, không ảnh, giá sản phẩm); mua lần hai qua API → 409. Quản trị: tab "Khách gửi ảnh
 *      chọn" + chi tiết bộ ảnh có nhãn "Làm nhanh" + hạn trả dự kiến (ngày chốt + <nhanh>).
 *   2. Khách chốt KHÔNG tích → màn sau chốt nói "trong khoảng <tiêu chuẩn> ngày", không có dòng
 *      làm nhanh; bấm mua sau chốt trên thẻ → có dòng, câu đổi sang <nhanh> ngày.
 *   3. (vòng 3) Quản lý TẮT công tắc ở Việc cần xử lý › Ảnh chỉnh sửa → nhật ký ghi người đổi,
 *      khách không thấy ô làm nhanh; BẬT lại → thấy. Công tắc là cài đặt CHUNG: giá trị gốc chụp ở
 *      beforeAll và TRẢ LẠI ở afterAll (kể cả khi ca hỏng giữa chừng).
 *
 * Dữ liệu: nền Fixture riêng (chi nhánh + khách "Fixture BB-399 …"), sản phẩm THỬ "Fixture Làm
 * ảnh nhanh" (giá 123.000 — khác giá thật để thấy giá đọc từ dữ liệu) và GHIM theo CHI NHÁNH
 * Fixture (`settings.branch_id` = chi nhánh thử, khoá `dich_vu.lam_anh_nhanh_lark_id`) — không
 * đụng sản phẩm thật, không đụng cài đặt chung. Dọn theo id ở afterAll (`donNenFixture` xoá cả
 * cài đặt của chi nhánh Fixture). KHÔNG gọi Lark (`PHEP_THU_TRINH_DUYET=1`).
 *
 * Chạy: PW_PORT=3210 npx playwright test tests/e2e/bb-399-lam-anh-nhanh.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { tickHopChotDot1 } from "./helpers/tick-hop-chot-dot1";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ANH = "test-results/bb-399";
fs.mkdirSync(ANH, { recursive: true });
const GIA = 123_000;
const NGAY_MS = 24 * 60 * 60 * 1000;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

let pg: Client;
let nen: NenFixture;
let spId = "";
const staffIds: string[] = [];
let emailCs = "";
let emailQl = "";
/** Giá trị gốc của công tắc chung (null = chưa có dòng) — trả lại ở afterAll. */
let congTacGoc: { coDong: boolean; value: unknown } = { coDong: false, value: null };
const matKhau = "Password123!";
const bo: Record<"nhanh" | "thuong" | "congTac", { id: string; token: string }> = {
  nhanh: { id: "", token: "" },
  thuong: { id: "", token: "" },
  congTac: { id: "", token: "" },
};
/** Số ngày đang cài (chung) — đọc từ DB, thiếu thì mặc định 14 / 5. */
let soNgay = { tieuChuan: 14, nhanh: 5 };

const ddmmyyyy = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

async function taoBo(ten: "nhanh" | "thuong" | "congTac", anhChinhId: string) {
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                            included_quota, extra_photo_price, photo_count)
     values ($1,$2,$3,'in_review',$4,'https://example.com/x',10,50000,10) returning id`,
    [nen.branchId, nen.customerId, `Fixture BB-399-${nen.runId} ${ten}`, `SEED_FOLDER_ID_399_${nen.runId}_${ten}`],
  );
  const id = g[0].id as string;
  await pg.query(
    `insert into gallery_items (gallery_id, product_id, quantity, lark_contract_code, lark_record_id) values ($1,$2,10,null,$3)`,
    [id, anhChinhId, `fx399-goc-${nen.runId}-${ten}`],
  );
  const token = randomBytes(16).toString("hex");
  const { rows: sl } = await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'owner',$4,'active') returning id`,
    [id, createHash("sha256").update(token).digest("hex"), token.slice(0, 6), `Fixture BB-399-${nen.runId}`],
  );
  const { rows: sel } = await pg.query(
    `insert into selections (gallery_id, share_link_id, display_name, is_primary) values ($1,$2,'Fixture BB-399',true) returning id`,
    [id, sl[0].id],
  );
  // Chọn ĐỦ 10/10: hộp chốt không có khối "nhờ studio chọn", không có ảnh chọn thêm.
  for (let i = 0; i < 10; i++) {
    const { rows: ph } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
      [id, `bb399-${nen.runId}-${ten}-${i}`, `R01_${String(i + 1).padStart(4, "0")}.JPG`, i + 1],
    );
    await pg.query(
      `insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index) values ($1,$2,$3,'selected',$4)`,
      [sel[0].id, ph[0].id, id, i + 1],
    );
  }
  bo[ten] = { id, token };
}

test.beforeAll(async () => {
  pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  nen = await dungNenFixture(pg, "BB-399");
  const larkId = `FX399_LAM_NHANH_${nen.runId}`;
  const { rows: sp } = await pg.query(
    `insert into products (name, kind, list_price, is_active, lark_record_id) values ($1,'addon',$2,true,$3) returning id`,
    ["Fixture Làm ảnh nhanh", GIA, larkId],
  );
  spId = sp[0].id as string;
  // Ghim RIÊNG cho chi nhánh Fixture (cài đặt chi nhánh thắng cài đặt chung).
  await pg.query(`insert into settings (key, branch_id, value) values ('dich_vu.lam_anh_nhanh_lark_id', $1, $2::jsonb)`, [
    nen.branchId,
    JSON.stringify(larkId),
  ]);
  const { rows: cd } = await pg.query(
    `select key, value from settings where branch_id is null and key in ('hau_ky.so_ngay_tra_tieu_chuan','hau_ky.so_ngay_lam_nhanh')`,
  );
  const lay = (k: string, md: number) => {
    const v = cd.find((r: { key: string }) => r.key === k)?.value;
    return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 60 ? v : md;
  };
  soNgay = { tieuChuan: lay("hau_ky.so_ngay_tra_tieu_chuan", 14), nhanh: lay("hau_ky.so_ngay_lam_nhanh", 5) };

  const { rows: ac } = await pg.query(
    `select id from products where kind = 'edited_photo' and is_active order by (lark_record_id is null), created_at limit 1`,
  );
  if (!ac[0]) throw new Error("Danh mục chưa có sản phẩm ảnh chỉnh sửa");
  await taoBo("nhanh", ac[0].id as string);
  await taoBo("thuong", ac[0].id as string);
  await taoBo("congTac", ac[0].id as string);
  const { rows: ct } = await pg.query(`select value from settings where key = 'dich_vu.lam_anh_nhanh_bat' and branch_id is null`);
  congTacGoc = ct[0] ? { coDong: true, value: ct[0].value } : { coDong: false, value: null };

  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  emailCs = `fixture.bb399.cs.${nen.runId}@demo.babybean.vn`;
  const u = await supa.auth.admin.createUser({ email: emailCs, password: matKhau, email_confirm: true });
  if (u.error || !u.data.user) throw u.error ?? new Error("không tạo được tài khoản");
  staffIds.push(u.data.user.id);
  await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
    u.data.user.id,
    `Fixture BB-399 NV ${nen.runId}`,
    emailCs,
  ]);
  await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [u.data.user.id, nen.branchId]);
  // Quản lý chi nhánh (settings:branch:write) — người được bật/tắt công tắc làm nhanh.
  emailQl = `fixture.bb399.ql.${nen.runId}@demo.babybean.vn`;
  const q = await supa.auth.admin.createUser({ email: emailQl, password: matKhau, email_confirm: true });
  if (q.error || !q.data.user) throw q.error ?? new Error("không tạo được tài khoản");
  staffIds.push(q.data.user.id);
  await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'branch_manager')`, [
    q.data.user.id,
    `Fixture BB-399 QL ${nen.runId}`,
    emailQl,
  ]);
  await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [q.data.user.id, nen.branchId]);
});

test.afterAll(async () => {
  try {
    // Trả công tắc CHUNG về đúng giá trị gốc (khách thật không được kẹt ở "tạm ngưng").
    if (pg) {
      if (congTacGoc.coDong) {
        await pg.query(`update settings set value = $1::jsonb where key = 'dich_vu.lam_anh_nhanh_bat' and branch_id is null`, [
          JSON.stringify(congTacGoc.value),
        ]);
      } else {
        await pg.query(`delete from settings where key = 'dich_vu.lam_anh_nhanh_bat' and branch_id is null`);
      }
      await pg.query(`delete from activity_logs where actor_id = any($1::uuid[])`, [staffIds]).catch(() => {});
    }
    if (nen) {
      await donNenFixture(pg, {
        galleryIds: [bo.nhanh.id, bo.thuong.id, bo.congTac.id],
        customerIds: [nen.customerId],
        branchIds: [nen.branchId],
        productIds: [spId],
        staffIds,
      });
    }
  } finally {
    await pg?.end().catch(() => {});
  }
});

async function moHopChot(page: Page, token: string) {
  await chanLh3TrenTrinhDuyet(page);
  await page.goto(`/g/${token}`);
  // Bìa (bộ đã chọn 10/10) có "Tiếp tục chọn" đưa xuống lưới, nơi thanh đáy có "Chốt danh sách".
  // `isVisible({ timeout })` KHÔNG chờ (Playwright bỏ qua timeout) — phải `waitFor` thật.
  const tiepTuc = page.getByRole("button", { name: /Tiếp tục chọn/ }).first();
  await tiepTuc.waitFor({ state: "visible", timeout: 40_000 });
  await tiepTuc.click();
  await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
  await expect(page.getByTestId("hop-chot")).toBeVisible({ timeout: 30_000 });
}

async function dongLamNhanh(galleryId: string) {
  const { rows } = await pg.query(
    `select sa.unit_price::int gia, sa.quantity, sa.dot, sa.photo_id, sa.created_at
       from selection_addons sa join selections s on s.id = sa.selection_id
      where s.gallery_id = $1 and sa.product_id = $2`,
    [galleryId, spId],
  );
  return rows as { gia: number; quantity: number; dot: number; photo_id: string | null; created_at: Date }[];
}

test("1. Chốt có tích Làm ảnh nhanh: giá + ngày từ dữ liệu, tạm tính cộng giá, sau chốt ~nhanh ngày, quản trị thấy nhãn + hạn", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await moHopChot(page, bo.nhanh.token);

  const o = page.getByTestId("o-lam-anh-nhanh");
  await expect(o).toBeVisible({ timeout: 30_000 });
  await expect(o).toContainText("123.000");
  await expect(o).toContainText(`khoảng ${soNgay.nhanh} ngày thay vì ${soNgay.tieuChuan} ngày tiêu chuẩn`);
  // Không tích sẵn; chưa tích thì chưa có tạm tính (bộ đủ gói, không mua thêm gì).
  await expect(o.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByTestId("tam-tinh-hop-chot")).toHaveCount(0);
  await o.click();
  await expect(o.getByRole("checkbox")).toBeChecked();
  await expect(page.getByTestId("dong-lam-nhanh-hop-chot")).toContainText("123.000");
  await expect(page.getByTestId("tam-tinh-hop-chot")).toContainText("123.000");
  // Điện thoại 390: hộp chốt không tràn ngang.
  const tran = await page.getByTestId("hop-chot").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(tran).toBe(false);
  await page.screenshot({ path: path.join(ANH, "1-hop-chot-lam-nhanh.png") });

  await tickHopChotDot1(page);
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByTestId("cam-on-sau-chot")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("cau-han-tra")).toContainText(`Bean trả ảnh chỉnh trong khoảng ${soNgay.nhanh} ngày`, {
    timeout: 30_000,
  });
  await page.screenshot({ path: path.join(ANH, "1-cam-on-lam-nhanh.png") });

  const dong = await dongLamNhanh(bo.nhanh.id);
  expect(dong).toHaveLength(1);
  expect(dong[0]).toMatchObject({ gia: GIA, quantity: 1, dot: 1, photo_id: null });

  // Không bán lần hai.
  const lan2 = await page.request.post("/api/g/lam-anh-nhanh");
  expect(lan2.status()).toBe(409);
  expect(await dongLamNhanh(bo.nhanh.id)).toHaveLength(1);

  // Quản trị.
  const { rows: s } = await pg.query(`select submitted_at from selections where gallery_id = $1 and is_primary`, [bo.nhanh.id]);
  const han = ddmmyyyy(new Date(new Date(s[0].submitted_at).getTime() + soNgay.nhanh * NGAY_MS));
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  try {
    const p = await ctx.newPage();
    await dangNhapNhanVien(p, emailCs, matKhau);
    await p.goto("/admin/viec-can-xu-ly?tab=khach-mua-them");
    const dongViec = p.locator(`[data-testid="dong-khach-gui-anh-chon"][data-gallery-id="${bo.nhanh.id}"]`);
    await expect(dongViec.getByTestId("nhan-lam-nhanh")).toContainText(`Làm nhanh`, { timeout: 40_000 });
    await expect(dongViec.getByTestId("nhan-lam-nhanh")).toContainText(han);
    await p.screenshot({ path: path.join(ANH, "1-viec-can-xu-ly.png") });

    await p.goto(`/admin/galleries/${bo.nhanh.id}`);
    const khoi = p.getByTestId("khoi-han-tra");
    await expect(khoi).toHaveAttribute("data-lam-nhanh", "1", { timeout: 40_000 });
    await expect(khoi).toContainText(han);
    await expect(khoi.getByTestId("nhan-lam-nhanh")).toBeVisible();
    await p.screenshot({ path: path.join(ANH, "1-chi-tiet-bo-anh.png") });
  } finally {
    await ctx.close();
  }
});

test("2. Chốt không tích: sau chốt ~tiêu chuẩn ngày; mua sau chốt trên thẻ → ~nhanh ngày", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await moHopChot(page, bo.thuong.token);
  await expect(page.getByTestId("o-lam-anh-nhanh")).toBeVisible({ timeout: 30_000 });
  await tickHopChotDot1(page);
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByTestId("cam-on-sau-chot")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("cau-han-tra")).toContainText(`Bean trả ảnh chỉnh trong khoảng ${soNgay.tieuChuan} ngày`, {
    timeout: 30_000,
  });
  expect(await dongLamNhanh(bo.thuong.id)).toHaveLength(0);
  await page.screenshot({ path: path.join(ANH, "2-cam-on-tieu-chuan.png") });

  // Mua sau chốt (thẻ trên màn cảm ơn).
  const nut = page.getByTestId("nut-mua-lam-anh-nhanh");
  await expect(nut).toContainText("123.000", { timeout: 30_000 });
  await nut.click();
  await expect(page.getByTestId("cau-han-tra")).toContainText(`khoảng ${soNgay.nhanh} ngày`, { timeout: 30_000 });
  await expect(page.getByTestId("nut-mua-lam-anh-nhanh")).toHaveCount(0);
  const dong = await dongLamNhanh(bo.thuong.id);
  expect(dong).toHaveLength(1);
  expect(dong[0]).toMatchObject({ gia: GIA, dot: 1, photo_id: null });
  await page.screenshot({ path: path.join(ANH, "2-mua-sau-chot.png") });
});

test("3. (vòng 3) Quản lý tắt công tắc → nhật ký ghi người đổi, khách không thấy ô; bật lại → thấy", async ({ page, browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const ql = await ctx.newPage();
  try {
    await dangNhapNhanVien(ql, emailQl, matKhau);
    await ql.goto("/admin/viec-can-xu-ly?tab=anh-chinh-sua");
    const khoi = ql.getByTestId("khoi-cong-tac-lam-nhanh");
    await expect(khoi).toBeVisible({ timeout: 40_000 });
    const congTac = khoi.getByTestId("cong-tac-lam-nhanh");
    // Ô tick đổi LẠC QUAN (trước khi máy chủ trả lời) — chờ ĐÚNG phản hồi PATCH, không chỉ chờ
    // `data-bat`: không thì ca đi tiếp (hoặc afterAll trả giá trị gốc) trong lúc PATCH còn bay, và
    // PATCH tới SAU ghi đè lại công tắc chung (đã xảy ra ở lượt chạy 08/10 — công tắc kẹt "tắt").
    const doi = async (bat: boolean) => {
      const [res] = await Promise.all([
        ql.waitForResponse((r) => r.url().includes("/api/admin/lam-anh-nhanh") && r.request().method() === "PATCH"),
        congTac.setChecked(bat, { force: true }),
      ]);
      expect(res.status()).toBe(200);
      await expect(khoi).toHaveAttribute("data-bat", bat ? "1" : "0", { timeout: 20_000 });
    };
    // Đưa về BẬT trước (môi trường có thể đang tắt), rồi TẮT.
    if (!(await congTac.isChecked())) await doi(true);
    await doi(false);
    await expect(khoi).toContainText("Đang tạm ngưng nhận làm ảnh nhanh");
    await ql.screenshot({ path: path.join(ANH, "3-cong-tac-tat.png") });
    const { rows: nk } = await pg.query(
      `select metadata from activity_logs where actor_id = $1 and action = 'settings.update' order by created_at desc limit 1`,
      [staffIds[1]],
    );
    expect(nk[0]?.metadata).toMatchObject({ key: "dich_vu.lam_anh_nhanh_bat", moi: false });

    // Khách: không thấy ô (API từ chối khi tắt — phép thử thuần bb-399 vòng 3 canh).
    await page.setViewportSize({ width: 390, height: 844 });
    await moHopChot(page, bo.congTac.token);
    await page.locator('[data-da-doc-dot1]').first().waitFor({ state: "attached", timeout: 30_000 });
    await expect(page.getByTestId("o-lam-anh-nhanh")).toHaveCount(0);
    await page.screenshot({ path: path.join(ANH, "3-khach-khong-thay-o.png") });

    // Bật lại → khách tải lại thấy ô.
    await doi(true);
    await moHopChot(page, bo.congTac.token);
    await expect(page.getByTestId("o-lam-anh-nhanh")).toBeVisible({ timeout: 30_000 });
  } finally {
    await ctx.close();
  }
});

test("4. (vòng 3) Bộ làm nhanh đã chốt hiện 'Ưu tiên · Làm nhanh' và đứng ĐẦU kanban/danh sách", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  try {
    const p = await ctx.newPage();
    await dangNhapNhanVien(p, emailCs, matKhau);
    // Ca 1 + ca 2 đều để lại một bộ `submitted` đã mua làm nhanh → hai dòng ĐẦU của trang đầu đều là
    // bộ ưu tiên (lọc theo chi nhánh Fixture), và có bộ "nhanh".
    const r = await p.request.get(`/api/admin/galleries?branchId=${nen.branchId}&status=submitted&limit=20`);
    expect(r.status()).toBe(200);
    const items = (await r.json()).data.items as { id: string; uuTien?: boolean }[];
    const dau = items.slice(0, 2);
    expect(dau.every((i) => i.uuTien === true)).toBe(true);
    expect(dau.map((i) => i.id)).toContain(bo.nhanh.id);
    await p.goto(`/admin/galleries/${bo.nhanh.id}`);
    await expect(p.getByTestId("khoi-han-tra").getByTestId("nhan-lam-nhanh")).toHaveText("Ưu tiên · Làm nhanh", { timeout: 40_000 });
    await p.screenshot({ path: path.join(ANH, "4-dai-uu-tien.png") });
  } finally {
    await ctx.close();
  }
});
