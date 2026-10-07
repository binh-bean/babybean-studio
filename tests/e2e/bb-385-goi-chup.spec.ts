/**
 * BB-385 — màn "Gói chụp" (BB-062) + giá ảnh chọn thêm theo gói.
 *
 * Nền Fixture riêng: chi nhánh + hai nhân sự "Fixture BB-385 …" (Admin = owner, CSKH = cs)
 * và MỘT sản phẩm gói thử `is_active = false` tên "Mẫu kiểm thử BB-385 <runId>" (quy ước
 * BB-352). Dọn theo id; dòng giá riêng của gói thử xoá theo mã gói trong afterAll.
 *
 * KHÔNG đổi giá chung (dòng `settings` thật của studio) — chỉ đọc để đối chiếu.
 * Ca 2 cần migration 0100 đã áp; chưa áp thì ca 2 tự bỏ qua (màn hiện nhắc "chưa áp").
 *
 * Chạy: `PW_PORT=3385 npx playwright test tests/e2e/bb-385-goi-chup.spec.ts --workers=1`.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { dungNenFixture, donNenFixture } from "../fixtures/nen-fixture";
import { thuMucAnh } from "./helpers/thu-muc-anh";
import { maGoiLark } from "../../src/lib/gallery/goi-chup-lark";

const ANH = thuMucAnh("dot19", "bb385");
const password = "Password123!";
const supa = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

interface GoiApi {
  maGoi: string;
  ten: string;
  giaAnhThemRieng: number | null;
  giaAnhThemApDung: number;
}

test.describe("BB-385: Gói chụp và giá ảnh chọn thêm", () => {
  test.describe.configure({ timeout: 240_000 });
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let productId = "";
  let tenGoi = "";
  const staffIds: string[] = [];
  const email: Record<"owner" | "cs", string> = { owner: "", cs: "" };

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const nen = await dungNenFixture(pg, "BB-385");
    branchId = nen.branchId;
    customerId = nen.customerId;
    tenGoi = `Mẫu kiểm thử BB-385 ${nen.runId}`;
    const { rows: sp } = await pg.query(
      `insert into products (name, kind, list_price, is_active) values ($1, 'shoot_package', 1234000, false) returning id`,
      [tenGoi],
    );
    productId = sp[0].id;

    for (const vai of ["owner", "cs"] as const) {
      const e = `test_bb385_${vai}_${nen.runId}@demo.babybean.vn`;
      email[vai] = e;
      const r = await supa().auth.admin.createUser({ email: e, password, email_confirm: true });
      let id = r.data.user?.id ?? "";
      if (r.error) {
        const { rows } = await pg.query(`select id from auth.users where email = $1`, [e]);
        if (!rows[0]) throw r.error;
        id = rows[0].id;
      }
      staffIds.push(id);
      await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,$4)`, [
        id,
        `Fixture BB-385 ${vai} ${nen.runId}`,
        e,
        vai,
      ]);
      await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [id, branchId]);
    }
  });

  test.afterAll(async () => {
    try {
      // Bảng có thể chưa có (0100 chưa áp) — bỏ qua lỗi đó.
      await pg.query(`delete from goi_chup_gia_anh_them where ma_goi = $1`, [maGoiLark(tenGoi)]).catch(() => {});
      await pg.query(`delete from activity_logs where actor_id = any($1::uuid[])`, [staffIds]).catch(() => {});
      await pg.query(`delete from staff_branches where staff_id = any($1::uuid[])`, [staffIds]);
      await donNenFixture(pg, { customerIds: [customerId], branchIds: [branchId], staffIds, productIds: [productId] });
    } finally {
      await pg.end();
    }
  });

  test("1. CSKH xem được danh sách, giá chung, không có ô sửa", async ({ page }) => {
    await dangNhapNhanVien(page, email.cs, password);
    const phanHoi = page.waitForResponse((r) => r.url().endsWith("/api/admin/goi-chup"), { timeout: 120_000 });
    await page.goto("/admin/goi-chup");
    const res = await phanHoi;
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data: { goi: GoiApi[]; giaChung: number; coTheSuaGia: boolean } };
    expect(body.data.coTheSuaGia).toBe(false);
    expect(body.data.goi.some((g) => g.ten === tenGoi)).toBe(true);

    await expect(page.getByRole("heading", { name: "Gói chụp" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Chỉ Admin sửa được giá.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sửa giá" })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Tìm gói" }).fill(tenGoi);
    await expect(page.getByText(tenGoi)).toBeVisible();
    await expect(page.getByText("lấy từ Lark").first()).toBeVisible();
  });

  test("2. Admin đặt giá riêng 70.000 cho gói thử rồi đưa về giá chung", async ({ page }) => {
    await dangNhapNhanVien(page, email.owner, password);
    const phanHoi = page.waitForResponse((r) => r.url().endsWith("/api/admin/goi-chup"), { timeout: 120_000 });
    await page.goto("/admin/goi-chup");
    const body = (await (await phanHoi).json()) as { data: { chuaApMigration: boolean; giaChung: number } };
    test.skip(body.data.chuaApMigration, "Migration 0100 chưa áp — không đặt được giá riêng.");

    await page.getByRole("textbox", { name: "Tìm gói" }).fill(tenGoi);
    const hang = page.getByRole("row").filter({ hasText: tenGoi });
    await hang.getByRole("button", { name: "Sửa giá" }).click();
    const o = hang.getByRole("textbox", { name: `Giá ảnh chọn thêm ${tenGoi}` });
    await o.fill("70000");
    const luu = page.waitForResponse((r) => r.url().endsWith("/api/admin/goi-chup") && r.request().method() === "PUT");
    await hang.getByRole("button", { name: "Lưu" }).click();
    expect((await luu).status()).toBe(200);
    await expect(hang.getByText("70.000 ₫")).toBeVisible({ timeout: 60_000 });
    await expect(hang.getByText("Giá riêng")).toBeVisible();

    const { rows } = await pg.query(`select gia_anh_them from goi_chup_gia_anh_them where ma_goi = $1`, [maGoiLark(tenGoi)]);
    expect(Number(rows[0]?.gia_anh_them)).toBe(70_000);

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.screenshot({ path: `${ANH}/goi-chup-admin-may-tinh.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${ANH}/goi-chup-admin-dien-thoai.png`, fullPage: true });
    await page.setViewportSize({ width: 1366, height: 900 });

    await hang.getByRole("button", { name: "Sửa giá" }).click();
    const ve = page.waitForResponse((r) => r.url().endsWith("/api/admin/goi-chup") && r.request().method() === "PUT");
    await hang.getByRole("button", { name: "Về giá chung" }).click();
    expect((await ve).status()).toBe(200);
    await expect(hang.getByText("Giá chung")).toBeVisible({ timeout: 60_000 });
    const { rows: con } = await pg.query(`select 1 from goi_chup_gia_anh_them where ma_goi = $1`, [maGoiLark(tenGoi)]);
    expect(con.length).toBe(0);
  });
});
