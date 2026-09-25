/**
 * BB-200 (3/3) — nhãn trạng thái hậu kỳ đọc từ Lark, hiện trên cả ba màn.
 *
 * OWNER: DEV-FE. Task BB-200.
 * Spec: docs/21 "Luồng hiển thị", docs/19 mục 3.
 *
 * (a) Bộ Fixture `in_retouch` + `lark_trang_thai='optl5DyKLx'` (giai đoạn 2,
 *     "Đã chọn hình" — bộ XẾP HÀNG, chưa ai chỉnh): màn khách thấy "Bộ ảnh đã
 *     được ghi nhận yêu cầu", KHÔNG thấy "Đang chỉnh sửa". Đổi sang
 *     `optmhzW4sL` (giai đoạn 3, "Đang làm"): màn khách đổi sang "Đang chỉnh sửa".
 * (b) Nhân viên vai `cs` đăng nhập: danh sách + chi tiết hiện đúng mức cảnh báo
 *     `lark_canh_bao='optQEfwHOy'` → "Phải xong trong ngày" (chấm tím).
 * (c) Vai `photographer` (không có quyền `galleries:reopen`) KHÔNG thấy form
 *     "Mở lại cho khách chọn tiếp"; vai `cs` (có quyền) thấy.
 *
 * Dữ liệu: chỉ dòng "Fixture BB-200 …", email thử `test_bb200_…@demo.babybean.vn`.
 * Dọn theo thứ tự selections → galleries, staff_branches → staff_profiles → auth user.
 */

import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-200 ${runId}`;
const CHO_TAI = 30_000;
const emailCs = `test_bb200_cs_${runId}@demo.babybean.vn`;
const emailPhotographer = `test_bb200_photographer_${runId}@demo.babybean.vn`;
const password = "Password123!";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Mã lựa chọn Lark thật, xem src/lib/lark/trang-thai-hau-ky.ts — KHÔNG bịa mã,
// đây là mã thật của bảng Hậu Kỳ (chỉ đọc, không ghi gì lên Lark trong test này).
const MA_DA_CHON_HINH = "optl5DyKLx"; // giai đoạn 2
const MA_DANG_LAM = "optmhzW4sL"; // giai đoạn 3
const MA_PHAI_XONG_TRONG_NGAY = "optQEfwHOy";

test.describe("BB-200: nhãn trạng thái hậu kỳ từ Lark", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let userIdCs = "";
  let userIdPhotographer = "";
  let galleryA = "";
  let maLinkA = "";
  let galleryB = "";
  let galleryC = "";

  const suKienAdmin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    await client.query(`delete from galleries where title like 'Fixture BB-200%' and created_at < now() - interval '1 hour'`);
    await client.query(`delete from customers where full_name like 'Fixture BB-200%' and created_at < now() - interval '1 hour'`);

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    // Nhân viên thử vai cs (có galleries:reopen)
    const cs = await suKienAdmin().auth.admin.createUser({ email: emailCs, password, email_confirm: true });
    if (cs.error) throw cs.error;
    userIdCs = cs.data.user!.id;
    await client.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      userIdCs, `${NHAN} CS`, emailCs,
    ]);
    await client.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [
      userIdCs, branchId,
    ]);

    // Nhân viên thử vai photographer (KHÔNG có galleries:reopen)
    const ph = await suKienAdmin().auth.admin.createUser({ email: emailPhotographer, password, email_confirm: true });
    if (ph.error) throw ph.error;
    userIdPhotographer = ph.data.user!.id;
    await client.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'photographer')`, [
      userIdPhotographer, `${NHAN} Photographer`, emailPhotographer,
    ]);
    await client.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [
      userIdPhotographer, branchId,
    ]);

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    // Bộ A — in_retouch, dùng cho màn khách (a). Bắt đầu ở giai đoạn 2 (XẾP HÀNG).
    const { rows: gA } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled, lark_trang_thai, lark_trang_thai_tu, lark_doc_luc)
       values ($1,$2,$3,'in_retouch',$4,'https://example.com/xA',1,5,50000,false,$5,now(),now())
       returning id`,
      [branchId, customerId, `${NHAN} Bộ A`, `fixture-bb200a-${runId}`, MA_DA_CHON_HINH],
    );
    galleryA = gA[0].id;
    await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,$3,'image/jpeg',1,'active')`,
      [galleryA, `bb200a-${runId}-1`, `BB200A_0001.jpg`],
    );
    maLinkA = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryA, sha256(maLinkA), maLinkA.slice(0, 6)],
    );

    // Bộ B — in_review, mức cảnh báo "Phải xong trong ngày". Dùng cho màn quản
    // trị (b): danh sách + chi tiết.
    const { rows: gB } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled, lark_trang_thai, lark_canh_bao, lark_trang_thai_tu, lark_doc_luc)
       values ($1,$2,$3,'in_review',$4,'https://example.com/xB',1,5,50000,false,$5,$6,now(),now())
       returning id`,
      [branchId, customerId, `${NHAN} Bộ B`, `fixture-bb200b-${runId}`, MA_DA_CHON_HINH, MA_PHAI_XONG_TRONG_NGAY],
    );
    galleryB = gB[0].id;

    // Bộ C — submitted, dùng cho (c): thấy/không thấy form mở lại.
    const { rows: gC } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'submitted',$4,'https://example.com/xC',1,5,50000,false)
       returning id`,
      [branchId, customerId, `${NHAN} Bộ C`, `fixture-bb200c-${runId}`],
    );
    galleryC = gC[0].id;
  });

  test.afterAll(async () => {
    if (client) {
      for (const g of [galleryA, galleryB, galleryC]) {
        if (g) await client.query("delete from activity_logs where entity_id = $1", [g]);
        if (g) await client.query("delete from selections where gallery_id = $1", [g]);
      }
      for (const g of [galleryA, galleryB, galleryC]) {
        if (g) await client.query("delete from galleries where id = $1", [g]);
      }
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);

      for (const uid of [userIdCs, userIdPhotographer]) {
        if (uid) await client.query("delete from staff_branches where staff_id = $1", [uid]);
        if (uid) await client.query("delete from staff_profiles where id = $1", [uid]);
      }
      await client.end();
    }
    if (userIdCs) await suKienAdmin().auth.admin.deleteUser(userIdCs);
    if (userIdPhotographer) await suKienAdmin().auth.admin.deleteUser(userIdPhotographer);
  });

  test("(a) màn khách: nhãn tiến độ đổi theo mã Lark, không kẹt ở 'Đang chỉnh sửa' khi bộ mới xếp hàng", async ({ page }) => {
    await page.goto(`/g/${maLinkA}`);
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_TAI });

    // Giai đoạn 2 ("Đã chọn hình" — xếp hàng, chưa ai chỉnh).
    await expect(page.getByText("Bộ ảnh đã được ghi nhận yêu cầu")).toBeVisible();
    await expect(page.getByText("Đang chỉnh sửa")).toHaveCount(0);

    // Chuyển Lark sang giai đoạn 3 ("Đang làm") — mô phỏng lượt đồng bộ tiếp
    // theo (KHÔNG gọi Lark thật, chỉ ghi thẳng cột đã đọc từ trước).
    await client.query(
      `update galleries set lark_trang_thai = $1, lark_trang_thai_tu = now(), lark_doc_luc = now() where id = $2`,
      [MA_DANG_LAM, galleryA],
    );

    await page.reload();
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_TAI });
    await expect(page.getByText("Đang chỉnh sửa")).toBeVisible();
    await expect(page.getByText("Bộ ảnh đã được ghi nhận yêu cầu")).toHaveCount(0);
  });

  /**
   * (b1) DANH SÁCH — bị SKIP có lý do: chấm cảnh báo ở /admin/galleries đọc
   * larkCanhBao từ RPC get_admin_galleries (migration 0068), và 0068 CHƯA
   * được áp lên bb-dev — file migration nằm sẵn ở db/migrations/, đợi Opus
   * soát rồi mới áp (xem ghi chú đầu file 0068). Áp xong thì bỏ `.skip` này.
   */
  test("(b1) danh sách quản trị hiện đúng mức cảnh báo (0068 đã áp 25/09)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Tên tài khoản hoặc email").fill(emailCs);
    await page.getByLabel("Mật khẩu").fill(password);
    await page.getByRole("button", { name: /Đăng nhập/i }).click();
    await page.waitForURL("**/admin**");

    await page.goto("/admin/galleries");
    await page.locator('input[name="search"]:visible').first().fill(`${NHAN} Bộ B`);
    const chamDanhSach = page.getByLabel("Mức cảnh báo: Phải xong trong ngày").first();
    await expect(chamDanhSach).toBeVisible({ timeout: CHO_TAI });
  });

  /**
   * (b2) CHI TIẾT — KHÔNG phụ thuộc 0068: /api/admin/galleries/[id]/items
   * đọc lark_trang_thai/lark_canh_bao/lark_doc_luc thẳng từ bảng `galleries`
   * (đã có từ 0067, đang sống trên bb-dev), không qua RPC danh sách. Chạy
   * được ngay cả khi 0068 chưa áp.
   */
  test("(b2) chi tiết bộ ảnh hiện đúng mức cảnh báo và dòng 'Lark: …'", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Tên tài khoản hoặc email").fill(emailCs);
    await page.getByLabel("Mật khẩu").fill(password);
    await page.getByRole("button", { name: /Đăng nhập/i }).click();
    await page.waitForURL("**/admin**");

    await page.goto(`/admin/galleries/${galleryB}`);
    await expect(page.getByLabel("Mức cảnh báo: Phải xong trong ngày").first()).toBeVisible({ timeout: CHO_TAI });
    await expect(page.getByText(/^Lark: Đã chọn hình/)).toBeVisible();
  });

  test("(c) form 'Mở lại cho khách chọn tiếp': ẩn với vai không có quyền, hiện với vai có quyền", async ({ page, context }) => {
    // Vai photographer — KHÔNG có galleries:reopen.
    await page.goto("/login");
    await page.getByLabel("Tên tài khoản hoặc email").fill(emailPhotographer);
    await page.getByLabel("Mật khẩu").fill(password);
    await page.getByRole("button", { name: /Đăng nhập/i }).click();
    await page.waitForURL("**/admin**");

    await page.goto(`/admin/galleries/${galleryC}`);
    // Chờ dữ liệu tải xong TRƯỚC khi kiểm phần vắng mặt — GalleryDetail là
    // component client tự fetch sau khi mount, nên `toHaveCount(0)` hỏi ngay
    // sau goto() luôn đúng một cách vô nghĩa (dữ liệu chưa kịp tải thì cái gì
    // cũng "chưa có"). Đợi ô Thống kê "Trạng thái" — thứ luôn xuất hiện sau
    // khi tải xong — rồi mới kiểm phần đáng lẽ phải vắng mặt.
    await expect(page.getByText("Trạng thái").first()).toBeVisible({ timeout: CHO_TAI });
    await expect(page.getByText("Mở lại cho khách chọn tiếp")).toHaveCount(0);

    // Vai cs — CÓ galleries:reopen, trong một trang riêng (phiên khác).
    const csPage = await context.newPage();
    await csPage.goto("/login");
    await csPage.getByLabel("Tên tài khoản hoặc email").fill(emailCs);
    await csPage.getByLabel("Mật khẩu").fill(password);
    await csPage.getByRole("button", { name: /Đăng nhập/i }).click();
    await csPage.waitForURL("**/admin**");

    await csPage.goto(`/admin/galleries/${galleryC}`);
    await expect(csPage.getByText("Mở lại cho khách chọn tiếp")).toBeVisible();
  });
});
