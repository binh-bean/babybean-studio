/**
 * BB-380 — Bàn làm việc hiện "Sáu con số điều hành", bấm một số ra báo cáo chi tiết.
 *
 * Nền Fixture riêng (chi nhánh + quản lý chi nhánh "Fixture BB-380 …"), dọn theo id.
 * Ca 1 chạy API THẬT (chi nhánh Fixture không có bộ thật → số là 0/"—").
 * Ca 2 chụp ảnh bố cục với SỐ GIẢ LẬP Ở TRÌNH DUYỆT (page.route) — tên tệp có "gia-lap".
 *
 * Chạy: `PW_PORT=3380 npx playwright test tests/e2e/bb-380-sau-con-so.spec.ts --workers=1`.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { dungNenFixture, donNenFixture } from "../fixtures/nen-fixture";
import { thuMucAnh } from "./helpers/thu-muc-anh";

const ANH = thuMucAnh("dot17", "bb380");
const password = "Password123!";
const supa = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

const SO_GIA_LAP = [
  { nhan: "Tỉ lệ mở link", giaTri: 86.4, donVi: "%", kyTruoc: 78.1, chenhLechPhanTram: 10.6, tangLaTot: true, maChiTiet: "pheu-khach" },
  { nhan: "Gửi link đến chốt", giaTri: 3.5, donVi: "ngày", kyTruoc: 4.2, chenhLechPhanTram: -16.7, tangLaTot: false, maChiTiet: "pheu-khach" },
  { nhan: "Chốt trong 7 ngày", giaTri: 71.2, donVi: "%", kyTruoc: 65, chenhLechPhanTram: 9.5, tangLaTot: true, maChiTiet: "pheu-khach" },
  { nhan: "Ảnh chọn thêm mỗi bộ", giaTri: 4.3, donVi: "ảnh", kyTruoc: 3.8, chenhLechPhanTram: 13.2, tangLaTot: true, maChiTiet: "sales-mua-them" },
  { nhan: "Mua thêm mỗi bộ", giaTri: 1250000, donVi: "đ", kyTruoc: 1400000, chenhLechPhanTram: -10.7, tangLaTot: true, maChiTiet: "doanh-thu-mua-them" },
  { nhan: "Tải ảnh trước khi chốt", giaTri: 42.5, donVi: "%", kyTruoc: 40, chenhLechPhanTram: 6.3, tangLaTot: true, maChiTiet: "pheu-khach" },
];

async function giaLapSauSo(page: Page) {
  await page.route("**/api/admin/bao-cao/sau-con-so**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { ketQua: { theSo: SO_GIA_LAP } } }),
    }),
  );
}

test.describe("BB-380: Sáu con số điều hành", () => {
  test.describe.configure({ timeout: 240_000 });
  let pg: Client;
  let branchId = "";
  let customerId = "";
  const staffIds: string[] = [];
  let email = "";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const nen = await dungNenFixture(pg, "BB-380");
    branchId = nen.branchId;
    customerId = nen.customerId;
    email = `test_bb380_${nen.runId}@demo.babybean.vn`;
    const r = await supa().auth.admin.createUser({ email, password, email_confirm: true });
    let id = r.data.user?.id ?? "";
    if (r.error) {
      const { rows } = await pg.query(`select id from auth.users where email = $1`, [email]);
      if (!rows[0]) throw r.error;
      id = rows[0].id;
    }
    staffIds.push(id);
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'branch_manager')`, [
      id,
      `Fixture BB-380 Quản lý ${nen.runId}`,
      email,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [id, branchId]);
  });

  test.afterAll(async () => {
    try {
      await pg.query(`delete from staff_branches where staff_id = any($1::uuid[])`, [staffIds]);
      await donNenFixture(pg, { customerIds: [customerId], branchIds: [branchId], staffIds });
    } finally {
      await pg.end();
    }
  });

  test("1. Bàn làm việc hiện 6 số (API thật, chi nhánh của mình), bấm một số ra báo cáo", async ({ page }) => {
    await dangNhapNhanVien(page, email, password);
    const phanHoi = page.waitForResponse((r) => r.url().includes("/api/admin/bao-cao/sau-con-so"), { timeout: 120_000 });
    await page.goto("/admin");
    const res = await phanHoi;
    expect(res.status()).toBe(200);
    // Quản lý một chi nhánh: route tự giới hạn về chi nhánh của mình — không xin chi nhánh khác.
    expect(res.url()).not.toContain("chiNhanh=");

    const dai = page.getByTestId("dai-sau-con-so");
    await expect(dai).toBeVisible({ timeout: 60_000 });
    const so = dai.getByTestId("so-dieu-hanh");
    await expect(so).toHaveCount(6, { timeout: 60_000 });
    await expect(dai.getByText("Tỉ lệ mở link")).toBeVisible();
    await expect(dai.getByText("Tải ảnh trước khi chốt")).toBeVisible();

    await dai.getByRole("link", { name: /Tỉ lệ mở link/ }).click();
    await page.waitForURL(/\/admin\/bao-cao\?.*ma=pheu-khach/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Phễu khách" })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("table").first()).toBeVisible({ timeout: 90_000 });
  });

  test("2. Chụp bố cục (SỐ GIẢ LẬP ở trình duyệt) — máy tính và điện thoại", async ({ page }) => {
    await giaLapSauSo(page);
    await dangNhapNhanVien(page, email, password);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/admin");
    const dai = page.getByTestId("dai-sau-con-so");
    await expect(dai.getByTestId("so-dieu-hanh")).toHaveCount(6, { timeout: 90_000 });
    await dai.scrollIntoViewIfNeeded();
    await dai.screenshot({ path: `${ANH}/gia-lap-sau-con-so-may-tinh.png` });
    await page.screenshot({ path: `${ANH}/gia-lap-ban-lam-viec-may-tinh.png`, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dai.getByTestId("so-dieu-hanh")).toHaveCount(6);
    await dai.scrollIntoViewIfNeeded();
    await dai.screenshot({ path: `${ANH}/gia-lap-sau-con-so-dien-thoai.png` });
  });

  test("3. Chụp các báo cáo mới (API thật, chi nhánh Fixture → số 0)", async ({ page }) => {
    await dangNhapNhanVien(page, email, password);
    await page.setViewportSize({ width: 1366, height: 900 });
    for (const [ma, ten] of [
      ["pheu-khach", "Phễu khách"],
      ["sales-mua-them", "Sales — mua thêm"],
      ["doanh-thu-mua-them", "Doanh thu mua thêm"],
      ["van-hanh-chinh-sua", "Vận hành chỉnh sửa"],
    ] as const) {
      await page.goto(`/admin/bao-cao?ma=${ma}&kyPreset=30-ngay`);
      await expect(page.getByRole("heading", { name: ten })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Đang tải báo cáo…")).toHaveCount(0, { timeout: 90_000 });
      await page.screenshot({ path: `${ANH}/bao-cao-${ma}.png`, fullPage: true });
    }
  });
});
