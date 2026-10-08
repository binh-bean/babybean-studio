/**
 * BB-320 — trên trình duyệt thật, dữ liệu Fixture:
 *
 *  A. Bộ ảnh khách ĐÃ CHỐT (submitted, chọn 17 ảnh, hạn mức 15, phải thu 100.000 chụp lúc
 *     chốt): CSKH tăng "Số ảnh trong gói" 15 → 17 được; màn hình hiện số vượt/tiền theo
 *     hạn mức MỚI, và số 100.000 khách đã nhìn thấy lúc chốt KHÔNG đổi (kiểm cả trong DB).
 *     Bộ ARCHIVED thì không còn ô sửa số lượng.
 *  B. Ô "Giảm giá %": nhập 10 → hiện "Giảm 10% = −10.000 ₫ · khách trả 90.000 ₫", số tiền
 *     gợi ý 90.000, ghi → còn thiếu về 0, sổ có dòng giảm giá riêng (người ghi + lý do).
 *
 * Chạy: PW_PORT=3180 npx playwright test tests/e2e/bb-320-dong-hang-giam-gia.spec.ts --workers=1
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const email = `test_bb320dh_${runId}@demo.babybean.vn`;
const password = "Password123!";
const NHAN = `Fixture BB-320 dong hang ${runId}`;

function adminAuth() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe("BB-320: sửa hạn mức bộ đã chốt + giảm giá %", () => {
  let pg: Client;
  let userId = "";
  let branchId = "";
  const khachIds: string[] = [];
  const boIds: string[] = [];
  let boChot = "";
  let boLuuTru = "";

  async function taoBo(khoa: string, status: string, photoCount: number, chon: number) {
    const { rows: cu } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} ${khoa}`, `09014${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`],
    );
    khachIds.push(cu[0].id);
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price)
       values ($1,$2,$3,$4,$5,'https://example.com/x',$6,15,50000) returning id`,
      [branchId, cu[0].id, `${NHAN} ${khoa}`, status, `fx-bb320dh-${khoa}-${Date.now()}`, photoCount],
    );
    const id = g[0].id as string;
    boIds.push(id);
    const { rows: sl } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role) values ($1,$2,'bb320d','owner') returning id`,
      [id, `fixture-bb320dh-${khoa}-${Date.now()}-${Math.random()}`],
    );
    const { rows: sel } = await pg.query(
      `insert into selections (gallery_id, share_link_id, is_primary, snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount, submitted_at)
       values ($1,$2,true,$3,2,100000, now()) returning id`,
      [id, sl[0].id, chon],
    );
    const { rows: ph } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index)
       select $1, 'bb320dh-'||i||'-'||random(), 'p'||i||'.jpg', 'image/jpeg', i from generate_series(1,$2) i returning id`,
      [id, photoCount],
    );
    for (const p of ph.slice(0, chon)) {
      await pg.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`,
        [sel[0].id, p.id, id],
      );
    }
    // Dòng "Edit file ×15" = hạn mức 15.
    const { rows: prod } = await pg.query("select id from products where kind = 'edited_photo' limit 1");
    await pg.query(`insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,15,null)`, [
      id,
      prod[0].id,
    ]);
    return id;
  }

  test.beforeAll(async () => {
    const { data, error } = await adminAuth().auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
      userId,
      `Test BB320dh ${runId}`,
      email,
    ]);
    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    boChot = await taoBo("chot", "submitted", 20, 17);
    boLuuTru = await taoBo("luutru", "archived", 20, 17);
  });

  test.afterAll(async () => {
    for (const id of boIds) {
      await pg.query("delete from gallery_payments where gallery_id = $1", [id]);
      await pg.query("delete from activity_logs where entity_id = $1", [id]).catch(() => {});
      await pg.query("delete from selection_items where gallery_id = $1", [id]);
      await pg.query("delete from selections where gallery_id = $1", [id]);
      await pg.query("delete from share_links where gallery_id = $1", [id]);
      await pg.query("delete from gallery_items where gallery_id = $1", [id]);
      await pg.query("delete from photos where gallery_id = $1", [id]);
      await pg.query("delete from galleries where id = $1", [id]);
    }
    for (const id of khachIds) await pg.query("delete from customers where id = $1", [id]);
    if (userId) {
      await adminAuth().auth.admin.deleteUser(userId);
      await pg.query("delete from staff_profiles where id = $1", [userId]);
    }
    await pg.end();
  });

  test("A. bộ đã chốt: tăng hạn mức 15 → 17 được, số theo hạn mức mới hiện ra, số lúc chốt giữ nguyên", async ({ page }) => {
    test.setTimeout(150_000);
    await dangNhapNhanVien(page, email, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/galleries/${boChot}`);

    const dong = page.getByTestId("phat-sinh-theo-han-muc");
    await expect(dong).toBeVisible({ timeout: 30_000 });
    await expect(dong).toContainText("vượt 2 ảnh");
    await expect(dong).toContainText("100.000");

    // Bộ ĐÃ CHỐT vẫn có ô sửa số lượng (luật cũ chặn đúng chỗ này).
    const o = page.getByLabel("Số ảnh trong gói").first();
    await expect(o).toBeVisible();
    await o.fill("17");
    await page.getByRole("button", { name: "lưu", exact: true }).click();

    // Hạn mức đã đổi thật, và câu báo nói theo hạn mức mới + nhắc số lúc chốt giữ nguyên.
    await expect(page.getByText(/Hạn mức đã đổi: 15 → 17 ảnh/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/không còn vượt hạn mức/).first()).toBeVisible();
    await expect(page.getByText(/giữ nguyên/).first()).toBeVisible();
    // Số theo hạn mức mới hiện SAU khi màn hình tải lại chi tiết (thông báo hiện trước) — cho hẳn 60s, máy chạy chung với việc khác.
    await expect(dong).toContainText("không vượt hạn mức", { timeout: 60_000 });

    const { rows } = await pg.query(
      `select s.snapshot_extra_amount::int as tien,
              (select coalesce(sum(quantity),0)::int from gallery_items where gallery_id = $1) as han_muc
         from selections s where s.gallery_id = $1 and s.is_primary`,
      [boChot],
    );
    expect(rows[0].han_muc).toBe(17);
    expect(rows[0].tien, "số khách đã nhìn thấy lúc chốt KHÔNG được đổi").toBe(100_000);
    await page.screenshot({ path: "test-results/bb-320/dong-hang-da-chot.png", fullPage: true });
  });

  test("A'. bộ ĐÃ LƯU TRỮ: không còn ô sửa số lượng", async ({ page }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, email, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/galleries/${boLuuTru}`);
    await expect(page.getByRole("heading", { name: "Thành phần hợp đồng" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Số ảnh trong gói")).toHaveCount(0);
  });

  test("B. giảm giá 10%: hiện rõ phần giảm, gợi ý số tiền, ghi xong còn thiếu về 0, sổ có dòng giảm giá riêng", async ({ page }) => {
    test.setTimeout(90_000);
    await dangNhapNhanVien(page, email, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/galleries/${boChot}`);
    // BB-395: form nhập tay (chủ studio) nằm trong mục dự phòng của khối mã hoá đơn.
    await page.getByTestId("nhap-tay-du-phong").locator("summary").click({ timeout: 30_000 });
    const oGiam = page.getByLabel("Giảm giá %");
    await expect(oGiam).toBeVisible({ timeout: 30_000 });

    await oGiam.fill("10");
    await expect(page.getByTestId("dong-giam-gia")).toContainText("Giảm 10%");
    await expect(page.getByTestId("dong-giam-gia")).toContainText("10.000");
    await expect(page.getByTestId("dong-giam-gia")).toContainText("90.000");
    // Số tiền gợi ý = còn thiếu × 0,9 làm tròn nghìn.
    await expect(page.locator('input[name="amount"]')).toHaveValue("90000");

    // Chưa có lý do thì chưa bấm được.
    const nutGhi = page.getByRole("button", { name: "Ghi giảm giá và thu" });
    await expect(nutGhi).toBeDisabled();
    await page.locator('input[name="note"]').fill("Khách quen");
    // Lỗi thời từ BB-349 (không do BB-395): bộ `submitted` → ô "Đồng thời xác nhận danh sách và khoá"
    // tick sẵn và nút chờ tick "chắc chắn". Ca này thử phần GIẢM GIÁ nên bỏ tick khoá (cùng cách
    // bb-344 ca 2) — luật khoá kèm thu đã có bb-349 canh.
    await page.locator('input[name="khoaBoAnh"]').uncheck();
    await expect(nutGhi).toBeEnabled();
    await nutGhi.click();

    await expect(page.getByText(/Khách đã trả đủ/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("tong-giam-gia")).toContainText("10.000");

    const { rows } = await pg.query(
      `select payment_method, amount::int as amount, note, confirmed_by from gallery_payments where gallery_id = $1 order by amount`,
      [boChot],
    );
    expect(rows).toHaveLength(2);
    const giam = rows.find((r) => r.payment_method === "giam_gia")!;
    expect(giam.amount).toBe(10_000);
    expect(giam.confirmed_by).toBe(userId);
    expect(giam.note).toContain("Khách quen");
    expect(rows.find((r) => r.payment_method === "tien_mat")!.amount).toBe(90_000);
    await page.screenshot({ path: "test-results/bb-320/giam-gia.png", fullPage: true });
  });
});
