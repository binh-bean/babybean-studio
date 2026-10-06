/**
 * BB-326 — chi tiết bộ ảnh: nút thao tác nằm ngay tại thẻ, bộ lỗi "Kiểm tra
 * lại" được, lưới chọn bìa theo tỉ lệ thật, khung điện thoại khớp khách.
 *
 * Dữ liệu Fixture riêng (chi nhánh riêng), dọn theo id kể cả chi nhánh.
 * Drive giả lập bằng tests/fixtures/mock-drive-network.cjs (playwright.config).
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-326 ${runId}`;
const email = `test_bb326_${runId}@demo.babybean.vn`;
const password = "Password123!";
const LY_DO = "Thư mục chưa được chia sẻ công khai";

test.describe("BB-326: bộ ảnh lỗi, nút tại thẻ, lưới chọn bìa", () => {
  let pg: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galLoi = "";
  let galAnh = "";
  let anhNgang = "";

  const quanTri = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const { rows: br } = await pg.query(
      `insert into branches (code, name) values ($1,$2) returning id`,
      [`FX326E${runId}`.slice(0, 20), `${NHAN} Chi nhánh`],
    );
    branchId = br[0].id;

    const { data, error } = await quanTri().auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      userId,
      `${NHAN} NV`,
      email,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [
      userId,
      branchId,
    ]);
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: gA } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, sync_error, photo_count)
       values ($1,$2,$3,'sync_error',$4,$5,$6,0) returning id`,
      [
        branchId,
        customerId,
        `${NHAN} Bộ lỗi`,
        `SEED_FOLDER_ID_BB326-loi-${runId}`,
        `https://drive.google.com/drive/folders/SEED_FOLDER_ID_BB326-loi-${runId}`,
        LY_DO,
      ],
    );
    galLoi = gA[0].id;

    const { rows: gB } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'ready',$4,$5,2) returning id`,
      [
        branchId,
        customerId,
        `${NHAN} Bộ có ảnh`,
        `SEED_FOLDER_ID_BB326-anh-${runId}`,
        `https://drive.google.com/drive/folders/SEED_FOLDER_ID_BB326-anh-${runId}`,
      ],
    );
    galAnh = gB[0].id;
    const { rows: p } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, width, height, sort_index, status)
       values ($1,$2,'BB_001.jpg','image/jpeg',1600,1000,1,'active'),
              ($1,$3,'BB_002.jpg','image/jpeg',1000,1500,2,'active')
       returning id, file_name`,
      [galAnh, `fixture-bb326-ngang-${runId}`, `fixture-bb326-doc-${runId}`],
    );
    anhNgang = p.find((r) => r.file_name === "BB_001.jpg")!.id;
  });

  test.afterAll(async () => {
    if (pg) {
      const ids = [galLoi, galAnh].filter(Boolean);
      if (ids.length) {
        await pg.query("delete from activity_logs where entity_id = any($1)", [ids]);
        await pg.query("update galleries set cover_photo_id = null where id = any($1)", [ids]);
        await pg.query("delete from photos where gallery_id = any($1)", [ids]);
        await pg.query("delete from galleries where id = any($1)", [ids]);
      }
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
      if (userId) await pg.query("delete from staff_branches where staff_id = $1", [userId]);
      if (userId) await pg.query("delete from staff_profiles where id = $1", [userId]);
      if (branchId) await pg.query("delete from branches where id = $1", [branchId]);
      await pg.end();
    }
    if (userId) await quanTri().auth.admin.deleteUser(userId);
  });

  test("Bộ lỗi 0 ảnh: nút Kiểm tra lại nằm ngay ở thẻ thư mục, bấm là có kết quả thật", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapNhanVien(page, email, password);
    await page.goto(`/admin/galleries/${galLoi}`, { waitUntil: "domcontentloaded" });

    const nut = page.getByTestId("nut-dong-bo-drive");
    await expect(nut).toBeVisible({ timeout: 20_000 });
    await expect(nut).toHaveText("Kiểm tra lại");
    await nut.click();
    // Thư mục giả không đọc được → báo đúng lý do, không im lặng.
    await expect(page.getByText(/Vẫn chưa đọc được thư mục: Thư mục chưa được chia sẻ công khai/)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("Bộ có ảnh: nút Tạo link app ngay tại thẻ; lưới bìa theo tỉ lệ thật; khung điện thoại cắt ảnh như khách", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapNhanVien(page, email, password);
    await page.goto(`/admin/galleries/${galAnh}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("nut-tao-link-app")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("nut-dong-bo-drive")).toHaveText("Đồng bộ lại");

    await page.getByRole("button", { name: "Mở trình thiết kế bìa" }).click();
    const hop = page.getByRole("dialog", { name: "Thiết kế bìa bộ ảnh" });
    const oNgang = hop.getByRole("button", { name: "Chọn BB_001.jpg làm bìa" });
    const oDoc = hop.getByRole("button", { name: "Chọn BB_002.jpg làm bìa" });
    await expect(oNgang).toBeVisible({ timeout: 20_000 });
    const hNgang = (await oNgang.boundingBox())!;
    const hDoc = (await oDoc.boundingBox())!;
    // Ảnh ngang 16:10 → ô ngang; ảnh dọc 2:3 → ô dọc.
    expect(hNgang.width / hNgang.height).toBeGreaterThan(1.4);
    expect(hDoc.width / hDoc.height).toBeLessThan(0.8);

    await oNgang.click();
    await hop.getByRole("button", { name: "Điện thoại" }).click();
    const anhXemTruoc = page.locator(`[style*='container-type'] img[src*='${anhNgang}']`).first();
    await expect(anhXemTruoc).toBeVisible();
    // Màn quản trị 1440px nhưng khung là điện thoại 390px: phải cắt như máy
    // khách (50% 30%), không phải `object-center` của máy tính.
    const viTri = await anhXemTruoc.evaluate((el) => getComputedStyle(el).objectPosition);
    expect(viTri).toBe("50% 30%");
  });
});
