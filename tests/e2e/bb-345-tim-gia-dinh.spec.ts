/**
 * BB-345 — tim gia đình → doanh thu chỉnh sửa, đi trọn một vòng:
 *
 *   1. Người được mời (link "Mời gia đình") thả tim 3 tấm → máy chủ lưu 3 dòng.
 *   2. Xoá bộ nhớ trình duyệt rồi tải lại → vẫn 3 tim (đọc từ máy chủ, không phải localStorage).
 *   3. Bấm "Đặt chỉnh sửa" → điền tên/SĐT → "Bean đã nhận yêu cầu chỉnh sửa 3 tấm của gia đình ạ!"
 *      → đúng MỘT yêu cầu 'chinh_sua' 3 tấm, tạm tính 3 × giá ảnh thêm.
 *   4. Ba mẹ thấy chip "Gia đình thích" 3 tấm, lọc ra đúng 3 ảnh có dấu "Gia đình";
 *      danh sách trong gói của ba mẹ KHÔNG đổi.
 *   5. CSKH thấy dòng ở Việc cần xử lý → "Khách gửi ảnh chọn", và khối
 *      "Gia đình thả tim: 3 tấm" ở chi tiết bộ ảnh.
 *
 * CHỈ CHẠY SAU KHI ÁP 0083 — chưa có bảng `tim_gia_dinh` thì tự bỏ qua, ghi rõ lý do.
 * Dữ liệu: "Fixture BB-345-…" (chi nhánh riêng + tài khoản thử), dọn theo id ở afterAll.
 *
 * Chạy: PW_PORT=3211 npx playwright test tests/e2e/bb-345-tim-gia-dinh.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";
import { taoBb345, donBb345, type DuLieuBb345 } from "../fixtures/bb-345";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const CHO_ANH = 30_000;
const THU_MUC = "test-results/bb-345";
fs.mkdirSync(THU_MUC, { recursive: true });

let d: DuLieuBb345 | null = null;
let coBang = false;

test.setTimeout(300_000);

test.beforeAll(async () => {
  const pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  const { rows } = await pg.query(`select to_regclass('public.tim_gia_dinh')::text as t`);
  coBang = !!rows[0]?.t;
  await pg.end();
  if (coBang) d = await taoBb345({ taoNhanVien: true });
});

test.afterAll(async () => {
  if (d) await donBb345(d);
});

test("gia đình thả tim 3 tấm → đặt chỉnh sửa → ba mẹ thấy 'Gia đình thích' → CSKH thấy việc", async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(!coBang, "Chưa áp migration 0083 (bảng tim_gia_dinh) — chạy lại sau khi giám đốc áp.");
  const du = d!;
  await page.setViewportSize({ width: 390, height: 844 });

  // 1. Người được mời thả tim 3 tấm.
  const choTaiTim = page.waitForResponse((r) => r.url().includes("/api/g/tim-gia-dinh") && r.request().method() === "GET");
  await page.goto(`/g/${du.A.maGiaDinh}`);
  await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_ANH });
  await choTaiTim;

  for (let i = 0; i < 3; i++) {
    const the = page.getByTestId("the-anh").nth(i);
    await the.scrollIntoViewIfNeeded();
    const tim = the.getByRole("button", { name: /^(Chọn ảnh này|Bỏ chọn)$/ });
    const choGhi = page.waitForResponse(
      (r) => r.url().endsWith("/api/g/tim-gia-dinh") && r.request().method() === "POST",
    );
    await tim.click();
    expect((await choGhi).status()).toBe(200);
    await expect(tim).toHaveAttribute("aria-pressed", "true");
  }
  const thanh = page.getByTestId("thanh-dat-chinh-sua");
  await expect(thanh).toContainText("Gia đình đã thả tim 3 tấm");
  const { rows: tim } = await du.pg.query(`select count(*)::int n from tim_gia_dinh where share_link_id = $1`, [
    du.A.viewerLinkId,
  ]);
  expect(tim[0].n).toBe(3);

  // 2. Xoá bộ nhớ trình duyệt, tải lại — tim vẫn còn (từ máy chủ).
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_ANH });
  await expect(thanh).toContainText("Gia đình đã thả tim 3 tấm");

  // 3. Đặt chỉnh sửa.
  await page.getByTestId("nut-dat-chinh-sua").click();
  const hop = page.getByRole("dialog");
  await expect(hop.getByTestId("tam-tinh-chinh-sua")).toContainText("150.000");
  await hop.locator('input[name="tenNguoiDat"]').fill("Fixture BB-345 Bà nội");
  await hop.locator('input[name="sdtNguoiDat"]').fill("0901000001");
  await page.screenshot({ path: path.join(THU_MUC, "1-hop-dat-chinh-sua-390.png") });
  await hop.getByTestId("nut-gui-dat-chinh-sua").click();
  await expect(page.getByTestId("cau-da-nhan-chinh-sua")).toHaveText(
    "Bean đã nhận yêu cầu chỉnh sửa 3 tấm của gia đình ạ!",
  );
  await page.screenshot({ path: path.join(THU_MUC, "2-da-nhan-390.png") });

  const { rows: yc } = await du.pg.query(
    `select loai, so_luong, cardinality(anh_ids)::int so_anh, tam_tinh, trang_thai
       from yeu_cau_mua_them where gallery_id = $1`,
    [du.A.id],
  );
  expect(yc).toHaveLength(1);
  expect(yc[0]).toMatchObject({ loai: "chinh_sua", so_luong: 3, so_anh: 3, trang_thai: "moi" });
  expect(Number(yc[0].tam_tinh)).toBe(3 * du.giaMoiAnh);

  // 4. Ba mẹ: chip "Gia đình thích" 3 tấm, lọc ra 3 ảnh có dấu; danh sách trong gói không đổi.
  const ctxBaMe = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
  const baMe = await ctxBaMe.newPage();
  try {
    await baMe.goto(`/g/${du.A.maBaMe}`);
    await baMe.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_ANH });
    const chip = baMe.getByRole("button", { name: /^Gia đình thích/ });
    await expect(chip).toContainText("3");
    await chip.click();
    await expect(baMe.getByTestId("the-anh")).toHaveCount(3);
    await expect(baMe.getByTestId("dau-gia-dinh-thich")).toHaveCount(3);
    await baMe.screenshot({ path: path.join(THU_MUC, "3-ba-me-gia-dinh-thich.png") });
    const { rows: chon } = await du.pg.query(`select count(*)::int n from selection_items where gallery_id = $1`, [du.A.id]);
    expect(chon[0].n).toBe(0);
  } finally {
    await ctxBaMe.close();
  }

  // 5. CSKH: Việc cần xử lý → "Khách gửi ảnh chọn" + khối tim ở chi tiết bộ ảnh.
  const ctxNv = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const nv = await ctxNv.newPage();
  try {
    await dangNhapNhanVien(nv, du.staff!.email, du.staff!.password);
    await nv.goto("/admin/viec-can-xu-ly?tab=khach-mua-them", { waitUntil: "domcontentloaded" });
    const dong = nv.locator(`[data-testid="dong-khach-gui-anh-chon"][data-gallery-id="${du.A.id}"]`);
    await expect(dong).toHaveCount(1, { timeout: 30_000 });
    await expect(dong.getByTestId("cac-viec-cua-dong")).toContainText("Gia đình đặt chỉnh sửa 3 tấm");
    await dong.getByTestId("nut-xu-ly-viec").click();
    await expect(dong.getByTestId("khoi-dat-chinh-sua")).toContainText("150.000");
    await dong.screenshot({ path: path.join(THU_MUC, "4-cskh-khach-gui-anh-chon.png") });

    // Khối tim chỉ dựng SAU khi trang chi tiết tải xong `/items` rồi mới gọi route tim của nó.
    // Máy chủ dev lạnh: biên dịch `/items` + route tim mất tới ~35 giây (log 01/10 của giám đốc:
    // `/items` 19,8 s + biên dịch 15 s) — chờ ĐÚNG phản hồi của route tim, không đoán bằng 30 s cứng.
    const choTimCskh = nv.waitForResponse(
      (r) => /\/api\/admin\/galleries\/[^/]+\/tim-gia-dinh$/.test(new URL(r.url()).pathname) && r.status() === 200,
      { timeout: 150_000 },
    );
    await nv.goto(`/admin/galleries/${du.A.id}`, { waitUntil: "domcontentloaded" });
    const timCskh = await (await choTimCskh).json();
    expect(timCskh.data.chuaApMigration).toBe(false);
    expect(timCskh.data.soAnh).toBe(3);
    const khoi = nv.getByTestId("khoi-tim-gia-dinh");
    await expect(khoi).toContainText("Gia đình thả tim: 3 tấm", { timeout: 30_000 });
    await expect(khoi.getByTestId("ds-tim-gia-dinh")).toContainText("BB345A_0001.jpg");
    await expect(nv.getByTestId("dong-dat-chinh-sua")).toContainText("Đặt chỉnh sửa 3 tấm");
    await khoi.screenshot({ path: path.join(THU_MUC, "5-cskh-khoi-tim.png") });
  } finally {
    await ctxNv.close();
  }
});
