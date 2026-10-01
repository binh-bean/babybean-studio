/**
 * BB-349 — ca thật HD_20260926#5299 dựng lại bằng dữ liệu giả: khách đã chốt, CSKH mở lại,
 * khách đang sửa dở (chưa gửi lại) → CSKH ghi thu kèm "xác nhận danh sách và khoá".
 *
 *   1. CSKH thấy cảnh báo "Khách đang sửa lại danh sách…", ô khoá tick sẵn, nút "Ghi nhận
 *      đã thu" KHOÁ cho tới khi tick "Tôi chắc chắn muốn xác nhận".
 *   2. Bấm ghi → màn khách (đang mở sẵn ở trình duyệt thứ hai) khoá ngay — tim bị khoá,
 *      thanh đáy thành "Yêu cầu sửa lại" — KHÔNG tải lại (dấu trên `window` còn nguyên).
 *
 * Dữ liệu: chi nhánh/nhân viên/khách/bộ ảnh "Fixture BB-349-…" riêng, dọn theo id ở afterAll.
 * Không gọi Lark (PHEP_THU_TRINH_DUYET), ảnh lh3 bị chặn ở trình duyệt.
 *
 * Chạy: PW_PORT=3220 npx playwright test tests/e2e/bb-349-thu-tien-kem-khoa.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 8);
const NHAN = `Fixture BB-349-${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const email = `fixture.bb349.cs.${runId}@demo.babybean.vn`;
const matKhau = `Bb349!${randomBytes(6).toString("hex")}`;
const THU_MUC = "test-results/bb-349";
fs.mkdirSync(THU_MUC, { recursive: true });

test.describe.serial("BB-349: thu tiền kèm xác nhận + khoá", () => {
  let pg: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  const supa = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    branchId = (await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [`FXBB349-${runId}`, `${NHAN} Chi nhánh`])).rows[0].id;
    const u = await supa().auth.admin.createUser({ email, password: matKhau, email_confirm: true });
    if (u.error) throw u.error;
    userId = u.data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [userId, `${NHAN} NV`, email]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [userId, branchId]);
    customerId = (await pg.query(`insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000349') returning id`, [branchId, `${NHAN} Khách`])).rows[0].id;

    // Khách chốt 8 ảnh (hạn mức 5, vượt 3 × 50.000) 2 giờ trước; CSKH mở lại 1 giờ trước; khách đang sửa (giờ 9 ảnh).
    galleryId = (
      await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                                photo_count, included_quota, extra_photo_price, download_enabled,
                                submitted_at, reopened_at, reopen_reason)
         values ($1,$2,$3,'in_review',$4,'https://example.com/x',10,5,50000,false,
                 now() - interval '2 hours', now() - interval '1 hour', 'Khách xin sửa') returning id`,
        [branchId, customerId, `${NHAN} Bộ ảnh`, `SEED_FOLDER_ID_349_${runId}`],
      )
    ).rows[0].id;
    maLink = randomBytes(32).toString("base64url");
    const lk = (
      await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, status) values ($1,$2,$3,'owner','active') returning id`,
        [galleryId, sha256(maLink), maLink.slice(0, 6)],
      )
    ).rows[0].id;
    const sel = (
      await pg.query(
        `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, submitted_by_name,
                                 snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount)
         values ($1,$2,true, now() - interval '2 hours','Mẹ Fixture',8,3,150000) returning id`,
        [galleryId, lk],
      )
    ).rows[0].id;
    for (let i = 1; i <= 10; i++) {
      const ph = (
        await pg.query(
          `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, width, height, status)
           values ($1,$2,$3,'image/jpeg',$4,3000,2000,'active') returning id`,
          [galleryId, `bb349-${runId}-${i}`, `R01_00${String(i).padStart(2, "0")}.JPG`, i],
        )
      ).rows[0].id;
      if (i <= 9) {
        await pg.query(`insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index) values ($1,$2,$3,'selected',$4)`, [
          sel,
          ph,
          galleryId,
          i,
        ]);
      }
    }
  });

  test.afterAll(async () => {
    if (pg) {
      if (galleryId) {
        for (const sql of [
          "delete from thong_bao_khach where gallery_id = $1",
          "delete from push_dang_ky where gallery_id = $1",
          "delete from activity_logs where entity_id = $1 or gallery_id = $1",
          "delete from gallery_payments where gallery_id = $1",
          "delete from gallery_items where gallery_id = $1",
          "delete from selection_items where gallery_id = $1",
          "delete from selections where gallery_id = $1",
          "delete from share_links where gallery_id = $1",
          "delete from photos where gallery_id = $1",
          "delete from galleries where id = $1",
        ]) await pg.query(sql, [galleryId]);
      }
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
      if (userId) {
        await pg.query("delete from activity_logs where actor_id = $1", [userId]).catch(() => {});
        await pg.query("delete from staff_branches where staff_id = $1", [userId]);
        await pg.query("delete from staff_profiles where id = $1", [userId]);
      }
      if (branchId) {
        await pg.query("delete from activity_logs where branch_id = $1", [branchId]).catch(() => {});
        await pg.query("delete from notifications where branch_id = $1", [branchId]).catch(() => {});
        await pg.query("delete from branches where id = $1", [branchId]);
      }
      const con = (await pg.query(`select count(*)::int n from branches where name like $1`, [`${NHAN}%`])).rows[0].n;
      expect(con).toBe(0);
      await pg.end();
    }
    if (userId) await supa().auth.admin.deleteUser(userId);
  });

  test("cảnh báo + ô 'chắc chắn' bắt buộc; ghi thu xong màn khách khoá ngay, không F5", async ({ page, browser }) => {
    test.setTimeout(180_000);

    // Màn khách mở sẵn, đang sửa được.
    const ctxKhach = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const khach = await ctxKhach.newPage();
    try {
      await chanLh3TrenTrinhDuyet(khach);
      await khach.goto(`/g/${maLink}`);
      const nutTim = khach.locator('button[aria-label="Bỏ chọn ảnh này"], button[aria-label="Chọn ảnh này"]');
      await expect(nutTim.first()).toBeEnabled({ timeout: 40_000 });
      await khach.evaluate(() => ((window as unknown as { __bb349: string }).__bb349 = "chua-tai-lai"));

      // CSKH mở chi tiết bộ ảnh.
      await dangNhapNhanVien(page, email, matKhau);
      await page.goto(`/admin/galleries/${galleryId}`, { waitUntil: "domcontentloaded" });
      const canhBao = page.getByTestId("canh-bao-xac-nhan");
      await expect(canhBao).toBeVisible({ timeout: 40_000 });
      await expect(canhBao).toContainText("Khách đang sửa lại danh sách, chưa gửi lại");
      await expect(page.locator('input[name="khoaBoAnh"]')).toBeChecked();
      const nut = page.getByRole("button", { name: "Ghi nhận đã thu" });
      await expect(nut).toBeDisabled();
      await canhBao.screenshot({ path: `${THU_MUC}/canh-bao-chua-tick.png` });

      await page.locator('input[name="chacChan"]').check();
      await expect(nut).toBeEnabled();

      const cho = page.waitForResponse((r) => r.url().includes(`/api/admin/galleries/${galleryId}/payments`) && r.request().method() === "POST");
      await nut.click();
      const res = await cho;
      expect(res.status()).toBe(200);
      expect((await res.json()).data.daKhoa).toBe(true);
      await expect(page.getByText("Đã xác nhận danh sách và khoá bộ ảnh.")).toBeVisible({ timeout: 20_000 });

      // Màn khách: khoá trong vài giây, không tải lại.
      await expect(khach.locator("text=Yêu cầu sửa lại").first()).toBeVisible({ timeout: 10_000 });
      // Khoá thì nút tim hoặc bị ẩn hoặc bị vô hiệu (cùng luật e7-bo-da-khoa): không còn nút nào bấm được.
      await expect(
        khach.locator('button[aria-label="Bỏ chọn ảnh này"]:enabled, button[aria-label="Chọn ảnh này"]:enabled'),
      ).toHaveCount(0);
      expect(await khach.evaluate(() => (window as unknown as { __bb349?: string }).__bb349)).toBe("chua-tai-lai");
      await khach.screenshot({ path: `${THU_MUC}/man-khach-da-khoa.png` });

      const { rows } = await pg.query(`select status from galleries where id = $1`, [galleryId]);
      expect(rows[0].status).toBe("in_retouch");
    } finally {
      await ctxKhach.close();
    }
  });
});
