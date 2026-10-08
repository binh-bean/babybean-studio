/**
 * BB-404 — nút "Nhắn khách" (link chat RIÊNG của từng khách, từ Lark) trên các màn làm việc.
 *
 * Nền Fixture riêng: một chi nhánh Fixture, khách A CÓ link chat
 * `https://business.facebook.com/fixture-404`, khách B KHÔNG có link. Mỗi khách một bộ ảnh,
 * mỗi bộ một "yêu cầu mở lại" chờ xử lý (để hiện trong Việc cần xử lý). Nhân viên CSKH thử
 * chỉ thuộc chi nhánh Fixture → mọi danh sách chỉ thấy dữ liệu Fixture.
 *
 * Kiểm:
 *   1. Chi tiết bộ: A → <a "Nhắn khách" target=_blank rel=noopener noreferrer href=link>
 *      (+ mục trong menu ⋯); B → nút xám "Chưa có link chat" + gợi ý "Đồng bộ từ Lark".
 *   2. Trang khách: A có nút, B xám.
 *   3. Danh sách khách: icon trên từng dòng (A link, B xám).
 *   4. Danh sách bộ ảnh (bảng): icon trên từng dòng.
 *   5. Việc cần xử lý → Yêu cầu mở lại: icon trên từng dòng.
 *   6. Ảnh chụp 1440×900 + 390×844 (không tràn ngang).
 *
 * Không gọi Lark: chỉ đọc màn quản trị. Dữ liệu dọn theo id ở afterAll.
 * Chạy: PW_PORT=3404 npx playwright test tests/e2e/bb-404-nhan-khach.spec.ts --workers=1
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import path from "node:path";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";

const password = "Password123!";
const LINK = "https://business.facebook.com/fixture-404";

function thuMucAnh(): string {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const thu = path.join(d, "babybean-assets");
    if (fs.existsSync(thu)) return path.join(thu, "BB-404");
    d = path.dirname(d);
  }
  return path.resolve(__dirname, "../../test-results", "BB-404");
}
const THU_MUC_ANH = thuMucAnh();

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.describe("BB-404: nút Nhắn khách trên các màn làm việc", () => {
  let pg: Client;
  let nen: NenFixture;
  let khachB = "";
  let boA = "";
  let boB = "";
  let emailCs = "";
  let staffId = "";

  const admin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  async function taoBo(customerId: string, ten: string): Promise<string> {
    const { rows } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price, download_enabled)
       values ($1,$2,$3,'in_review',$4,'https://example.com/bb404',0,5,50000,false) returning id`,
      [nen.branchId, customerId, `Fixture BB-404 ${nen.runId} ${ten}`, `SEED_FOLDER_ID_BB404_${nen.runId}_${ten}`],
    );
    const id = rows[0].id as string;
    // "Yêu cầu mở lại" chờ xử lý → bộ hiện ở tab Yêu cầu mở lại của Việc cần xử lý.
    await pg.query(
      `insert into activity_logs (actor_type, actor_label, action, entity_type, entity_id, gallery_id, branch_id, metadata)
       values ('customer','khách','gallery.reopen_requested','gallery',$1,$1,$2,$3)`,
      [id, nen.branchId, JSON.stringify({ lyDo: "Fixture BB-404 xin mở lại", trangThaiLucXin: "in_review" })],
    );
    return id;
  }

  /** Nút có link: đúng href, mở tab mới, rel an toàn. */
  async function kiemNutCoLink(phamVi: ReturnType<Page["locator"]>) {
    const nut = phamVi.getByTestId("nut-nhan-khach").first();
    await expect(nut).toBeVisible({ timeout: 60_000 });
    await expect(nut).toHaveAttribute("href", LINK);
    await expect(nut).toHaveAttribute("target", "_blank");
    await expect(nut).toHaveAttribute("rel", "noopener noreferrer");
  }

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    nen = await dungNenFixture(pg, "BB-404", { tenKhach: `Fixture BB-404 Khách A ${Date.now().toString(36)}` });
    await pg.query(`update customers set facebook = $1 where id = $2`, [LINK, nen.customerId]);
    const { rows: kb } = await pg.query(
      `insert into customers (branch_id, full_name, facebook) values ($1,$2,null) returning id`,
      [nen.branchId, `Fixture BB-404 Khách B ${nen.runId}`],
    );
    khachB = kb[0].id as string;
    boA = await taoBo(nen.customerId, "BoA");
    boB = await taoBo(khachB, "BoB");

    emailCs = `test_bb404_cs_${nen.runId}@demo.babybean.vn`;
    const { data, error } = await admin().auth.admin.createUser({ email: emailCs, password, email_confirm: true });
    if (error) throw error;
    staffId = data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      staffId,
      `Fixture BB-404 ${nen.runId} CSKH`,
      emailCs,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [staffId, nen.branchId]);
  });

  test.afterAll(async () => {
    test.setTimeout(90_000);
    const loi: string[] = [];
    if (pg) {
      try {
        if (staffId) await pg.query(`delete from staff_branches where staff_id = $1`, [staffId]).catch((e: Error) => loi.push(e.message));
        if (nen) {
          await donNenFixture(pg, {
            galleryIds: [boA, boB],
            customerIds: [nen.customerId, khachB],
            branchIds: [nen.branchId],
            staffIds: [staffId],
          }).catch((e: Error) => loi.push(e.message));
        }
      } finally {
        await pg.end();
      }
    }
    if (loi.length) throw new Error(`Dọn Fixture BB-404 THẤT BẠI: ${loi.join(" | ")}`);
  });

  test("1. chi tiết bộ: khách có link → Nhắn khách (tab mới, rel an toàn, cả menu ⋯); khách không link → xám", async ({ page }) => {
    fs.mkdirSync(THU_MUC_ANH, { recursive: true });
    await dangNhapNhanVien(page, emailCs, password);
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`/admin/galleries/${boA}`);
    await kiemNutCoLink(page.locator("body"));
    await page.screenshot({ path: path.join(THU_MUC_ANH, "404-chi-tiet-co-link-1440x900.png") });
    await page.getByRole("button", { name: "Thao tác khác" }).click();
    const mucMenu = page.getByTestId("menu-nhan-khach");
    await expect(mucMenu).toHaveAttribute("href", LINK);
    await expect(mucMenu).toHaveAttribute("rel", "noopener noreferrer");
    await page.keyboard.press("Escape");

    await page.goto(`/admin/galleries/${boB}`);
    const xam = page.getByTestId("nut-nhan-khach-trong").first();
    await expect(xam).toBeVisible({ timeout: 60_000 });
    await expect(xam).toContainText("Chưa có link chat");
    await expect(page.getByTestId("goi-y-dong-bo-lark").first()).toContainText("Đồng bộ từ Lark");
    await expect(page.getByTestId("nut-nhan-khach")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/galleries/${boA}`);
    await kiemNutCoLink(page.locator("body"));
    await page.screenshot({ path: path.join(THU_MUC_ANH, "404-chi-tiet-co-link-390x844.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test("2. trang khách: A có Nhắn khách, B xám", async ({ page }) => {
    await dangNhapNhanVien(page, emailCs, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/customers/${nen.customerId}`);
    await expect(page.getByTestId("trang-khach-hang")).toBeVisible({ timeout: 60_000 });
    await kiemNutCoLink(page.getByTestId("trang-khach-hang"));
    await page.screenshot({ path: path.join(THU_MUC_ANH, "404-trang-khach-1440x900.png") });

    await page.goto(`/admin/customers/${khachB}`);
    await expect(page.getByTestId("trang-khach-hang")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("nut-nhan-khach-trong").first()).toContainText("Chưa có link chat");
    await expect(page.getByTestId("nut-nhan-khach")).toHaveCount(0);
  });

  test("3. danh sách khách: icon Nhắn khách trên từng dòng (A link, B xám)", async ({ page }) => {
    await dangNhapNhanVien(page, emailCs, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/customers");
    const hangA = page.locator("tr", { hasText: "Fixture BB-404 Khách A" });
    const hangB = page.locator("tr", { hasText: `Fixture BB-404 Khách B ${nen.runId}` });
    await expect(hangA).toBeVisible({ timeout: 60_000 });
    await kiemNutCoLink(hangA);
    await expect(hangB.getByTestId("nut-nhan-khach-trong")).toBeVisible();
    await expect(hangB.getByTestId("nut-nhan-khach")).toHaveCount(0);
    await page.screenshot({ path: path.join(THU_MUC_ANH, "404-danh-sach-khach-1440x900.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/customers");
    const theA = page.locator("li", { hasText: "Fixture BB-404 Khách A" });
    await kiemNutCoLink(theA);
    await page.screenshot({ path: path.join(THU_MUC_ANH, "404-danh-sach-khach-390x844.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test("4. danh sách bộ ảnh: icon Nhắn khách trên từng dòng", async ({ page }) => {
    await dangNhapNhanVien(page, emailCs, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/galleries");
    const hangA = page.locator("tr", { has: page.locator(`a[href*="${boA}"]`) });
    const hangB = page.locator("tr", { has: page.locator(`a[href*="${boB}"]`) });
    await expect(hangA.first()).toBeVisible({ timeout: 60_000 });
    await kiemNutCoLink(hangA.first());
    await expect(hangB.first().getByTestId("nut-nhan-khach-trong")).toBeVisible();
    await page.screenshot({ path: path.join(THU_MUC_ANH, "404-danh-sach-bo-1440x900.png") });
  });

  test("5. Việc cần xử lý → Yêu cầu mở lại: icon Nhắn khách trên từng dòng", async ({ page }) => {
    await dangNhapNhanVien(page, emailCs, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/viec-can-xu-ly?tab=yeu-cau-mo-lai");
    const dongA = page.getByTestId("dong-yeu-cau-mo-lai").filter({ has: page.locator(`a[href*="${boA}"]`) });
    const dongB = page.getByTestId("dong-yeu-cau-mo-lai").filter({ has: page.locator(`a[href*="${boB}"]`) });
    await expect(dongA).toBeVisible({ timeout: 60_000 });
    await kiemNutCoLink(dongA);
    await expect(dongB.getByTestId("nut-nhan-khach-trong")).toBeVisible();
    await expect(dongB.getByTestId("nut-nhan-khach")).toHaveCount(0);
    await page.screenshot({ path: path.join(THU_MUC_ANH, "404-viec-can-xu-ly-1440x900.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/viec-can-xu-ly?tab=yeu-cau-mo-lai");
    await kiemNutCoLink(page.getByTestId("dong-yeu-cau-mo-lai").filter({ has: page.locator(`a[href*="${boA}"]`) }));
    await page.screenshot({ path: path.join(THU_MUC_ANH, "404-viec-can-xu-ly-390x844.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
});
