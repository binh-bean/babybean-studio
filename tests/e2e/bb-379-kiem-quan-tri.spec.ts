/**
 * BB-379 — hai việc CSKH hay chạm:
 *
 *   1. Hộp "Chốt danh sách" (chủ studio 22/09/2026: "tên người xác nhận là tên khách hàng trong
 *      bộ; dấu tích ghi xác nhận đúng thông tin"): ô tên điền sẵn tên khách của bộ, nút Xác nhận
 *      KHOÁ tới khi tích, chốt xong tên + giờ lưu và HIỆN ở thẻ "Chốt lúc" của quản trị.
 *   2. Bộ chưa có tên bé: bộ lọc "Chưa có tên bé" ở Quản lý bộ ảnh, khối điền tên bé ở chi tiết;
 *      lưu xong bộ rời khỏi bộ lọc và bìa khách đổi sang tên bé.
 *
 * Dữ liệu: chi nhánh/khách/nhân sự "Fixture BB-379 …" riêng (tests/fixtures/nen-fixture.ts), dọn
 * theo id ở afterAll. Không gọi Lark (PHEP_THU_TRINH_DUYET), ảnh lh3 bị chặn ở trình duyệt.
 * Ảnh chụp: babybean-assets/dot17/bb379/.
 *
 * Chạy: PW_PORT=3379 npx playwright test tests/e2e/bb-379-kiem-quan-tri.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const runId = Math.random().toString(36).slice(2, 8);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const email = `fixture.bb379.cs.${runId}@demo.babybean.vn`;
const matKhau = `Bb379!${randomBytes(6).toString("hex")}`;
const ANH = "C:/Users/binh/Downloads/claude code/babybean-assets/dot17/bb379";
fs.mkdirSync(ANH, { recursive: true });
const TEN_BE = "Nguyễn Bảo An Fixture";

test.describe.serial("BB-379: hộp chốt + tên bé", () => {
  let pg: Client;
  let nen: NenFixture;
  let userId = "";
  let galleryId = "";
  let token = "";

  const supa = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    nen = await dungNenFixture(pg, "BB-379", { tenKhach: `Fixture BB-379 Mẹ Lan ${runId}` });

    const u = await supa().auth.admin.createUser({ email, password: matKhau, email_confirm: true });
    if (u.error) throw u.error;
    userId = u.data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [userId, `Fixture BB-379 NV ${runId}`, email]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [userId, nen.branchId]);
    await pg.query(`update customers set phone = '0901000379' where id = $1`, [nen.customerId]);

    const editFile = (await pg.query(`select id from products where is_active and kind = 'edited_photo' and name = 'Edit file' limit 1`)).rows[0]?.id;
    if (!editFile) throw new Error("Thiếu sản phẩm 'Edit file' trong danh mục bb-dev");

    // Bộ ảnh KHÔNG có bé (baby_id null), hạn mức 5, khách đã chọn đúng 5 tấm.
    galleryId = (
      await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                                photo_count, extra_photo_price, download_enabled)
         values ($1,$2,$3,'in_review',$4,'https://example.com/x',10,50000,false) returning id`,
        [nen.branchId, nen.customerId, `Fixture BB-379 Bộ ${runId}`, `SEED_FOLDER_ID_379_${runId}`],
      )
    ).rows[0].id;
    await pg.query(`insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,5,250000)`, [galleryId, editFile]);
    token = randomBytes(32).toString("base64url");
    const lk = (
      await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, status) values ($1,$2,$3,'owner','active') returning id`,
        [galleryId, sha256(token), token.slice(0, 6)],
      )
    ).rows[0].id;
    const sel = (await pg.query(`insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`, [galleryId, lk])).rows[0].id;
    for (let i = 1; i <= 10; i++) {
      const ph = (
        await pg.query(
          `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, width, height, status)
           values ($1,$2,$3,'image/jpeg',$4,3000,2000,'active') returning id`,
          [galleryId, `bb379-${runId}-${i}`, `R01_00${String(i).padStart(2, "0")}.JPG`, i],
        )
      ).rows[0].id;
      if (i <= 5) {
        await pg.query(`insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index) values ($1,$2,$3,'selected',$4)`, [sel, ph, galleryId, i]);
      }
    }
  });

  test.afterAll(async () => {
    try {
      if (galleryId) {
        for (const sql of [
          "delete from thong_bao_khach where gallery_id = $1",
          "delete from push_dang_ky where gallery_id = $1",
          "delete from selection_addons where selection_id in (select id from selections where gallery_id = $1)",
          "delete from selection_items where gallery_id = $1",
          "delete from selections where gallery_id = $1",
          "delete from share_links where gallery_id = $1",
          "delete from gallery_items where gallery_id = $1",
          "delete from photos where gallery_id = $1",
        ]) await pg.query(sql, [galleryId]).catch(() => {});
      }
      await pg.query("delete from babies where customer_id = $1", [nen.customerId]).catch(() => {});
      // donNenFixture xoá bộ ảnh → khách → nhân sự → chi nhánh theo id, rồi ta đọc lại.
      await pg.query("update galleries set baby_id = null where customer_id = $1", [nen.customerId]).catch(() => {});
      await pg.query("delete from babies where customer_id = $1", [nen.customerId]).catch(() => {});
      await donNenFixture(pg, { galleryIds: [galleryId], customerIds: [nen.customerId], branchIds: [nen.branchId], staffIds: [userId] });
      const con = (await pg.query(`select count(*)::int n from branches where id = $1`, [nen.branchId])).rows[0].n;
      expect(con, "chi nhánh Fixture còn sót").toBe(0);
    } finally {
      await pg.end();
    }
  });

  test("1. hộp chốt: tên khách điền sẵn, chưa tích thì khoá, chốt xong tên + giờ lưu", async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${token}`);
    // Bìa đã có 5/5 tấm: "Tiếp tục chọn" đưa xuống lưới, nơi thanh đáy có nút "Chốt danh sách".
    await page.getByRole("button", { name: /Tiếp tục chọn/ }).first().click();
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();

    const oTen = page.locator("#confirm-name-input");
    await expect(oTen).toHaveValue(nen.tenKhach, { timeout: 30_000 });
    const nutXacNhan = page.getByRole("button", { name: "Xác nhận", exact: true });
    // Chưa tích "Tôi xác nhận các thông tin trên là đúng" → khoá.
    await page.locator('[data-da-doc-dot1="1"]').waitFor({ state: "attached", timeout: 30_000 });
    await expect(nutXacNhan).toBeDisabled();
    await page.screenshot({ path: path.join(ANH, "1-hop-chot-chua-tich.png") });

    const oTick = page.getByTestId("o-xac-nhan-chot");
    await oTick.setChecked(true, { force: true });
    await expect(nutXacNhan).toBeEnabled();
    // Xoá tên → khoá lại (tên người xác nhận bắt buộc).
    await oTen.fill("");
    await expect(nutXacNhan).toBeDisabled();
    await oTen.fill(nen.tenKhach);
    await expect(nutXacNhan).toBeEnabled();
    await page.screenshot({ path: path.join(ANH, "2-hop-chot-da-tich.png") });

    await nutXacNhan.click();
    await expect
      .poll(async () => (await pg.query("select status::text s from galleries where id=$1", [galleryId])).rows[0]?.s, { timeout: 30_000 })
      .toBe("submitted");
    const { rows } = await pg.query(`select submitted_by_name n, submitted_at from selections where gallery_id = $1 and is_primary`, [galleryId]);
    expect(rows[0].n).toBe(nen.tenKhach);
    expect(rows[0].submitted_at).not.toBeNull();
  });

  test("2. quản trị: 'Chốt lúc' có tên người xác nhận; bộ chưa có tên bé hiện khối điền + bộ lọc", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await dangNhapNhanVien(page, email, matKhau);

    // Bộ lọc "Chưa có tên bé" ở danh sách (thu hẹp bằng ô tìm theo tên khách Fixture).
    await page.goto("/admin/galleries");
    await page.locator('input[name="search"]').first().fill(nen.tenKhach);
    await expect(page.getByText(nen.tenKhach).first()).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("loc-chua-ten-be").click();
    await expect(page.getByTestId("loc-chua-ten-be")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(nen.tenKhach).first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(ANH, "3-danh-sach-loc-chua-ten-be.png") });

    // Chi tiết.
    await page.goto(`/admin/galleries/${galleryId}`);
    const theChot = page.getByTestId("the-chot-luc");
    await expect(theChot).toContainText(nen.tenKhach, { timeout: 30_000 });
    const khoi = page.getByTestId("khoi-ten-be");
    await expect(khoi).toBeVisible();
    await page.screenshot({ path: path.join(ANH, "4-chi-tiet-chua-ten-be.png") });

    // Điền tên bé.
    await page.getByTestId("o-ten-be").fill(TEN_BE);
    await page.getByTestId("nut-luu-ten-be").click();
    await expect(khoi).toHaveCount(0, { timeout: 30_000 });
    const { rows } = await pg.query(
      `select b.full_name n, b.customer_id from galleries g join babies b on b.id = g.baby_id where g.id = $1`,
      [galleryId],
    );
    expect(rows[0].n).toBe(TEN_BE);
    expect(rows[0].customer_id).toBe(nen.customerId);
    await expect(page.getByText(TEN_BE).first()).toBeVisible();
    await page.screenshot({ path: path.join(ANH, "5-chi-tiet-da-co-ten-be.png") });

    // Rời khỏi bộ lọc.
    await page.goto("/admin/galleries");
    await page.locator('input[name="search"]').first().fill(nen.tenKhach);
    await page.getByTestId("loc-chua-ten-be").click();
    await page.waitForTimeout(2500);
    await expect(page.getByText(nen.tenKhach)).toHaveCount(0);
    await page.screenshot({ path: path.join(ANH, "6-danh-sach-het-bo-chua-ten-be.png") });
  });

  test("3. bìa khách đổi sang tên bé", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${token}`);
    await expect(page.getByText(TEN_BE).first()).toBeVisible({ timeout: 45_000 });
    await page.screenshot({ path: path.join(ANH, "7-bia-khach-ten-be.png") });
  });
});
