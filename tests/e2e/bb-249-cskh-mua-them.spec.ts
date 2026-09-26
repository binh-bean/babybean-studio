/**
 * BB-249 — CSKH đổi trạng thái yêu cầu mua thêm trong màn chi tiết bộ ảnh
 * quản trị, và màn khách phản chiếu đúng trạng thái mới nhất.
 *
 * Kịch bản: nhân viên `cs` mở chi tiết bộ Fixture có 1 yêu cầu `moi`.
 *   1. Bấm "Đã gọi khách" -> DB chuyển `da_lien_he`.
 *   2. Bấm "Đã chốt" -> DB chuyển `da_chot`, nút biến mất (trạng thái cuối).
 *   3. Màn khách của bộ đó hiện "Đã chốt đơn".
 *
 * Dữ liệu: chỉ tạo dòng "Fixture BB-249 …", dọn sạch ở afterAll theo đúng
 * thứ tự khoá ngoại — AGENTS.md §6 (bb-dev là dữ liệu thật của studio).
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-249 ${runId}`;
const email = `test_bb249_${runId}@demo.babybean.vn`;
const password = "Password123!";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("BB-249: CSKH đổi trạng thái yêu cầu mua thêm", () => {
  let client: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let yeuCauId = "";
  let maLink = "";
  let coBang = false;

  const suKienAdmin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    // Dọn rác của lượt chạy cũ (>1h, bỏ sót do phép thử bị ngắt giữa chừng).
    await client.query(`delete from galleries where title like 'Fixture BB-249%' and created_at < now() - interval '6 hours'`);
    await client.query(`delete from customers where full_name like 'Fixture BB-249%' and created_at < now() - interval '6 hours'`);

    const { rows: bangKiem } = await client.query(`select to_regclass('public.yeu_cau_mua_them') as bang`);
    coBang = bangKiem[0]?.bang !== null;
    if (!coBang) return; // Migration 0072 chưa áp lên môi trường này — bỏ qua cả bộ.

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: sp } = await client.query(
      "select id from products where is_active = true and list_price is not null limit 1",
    );
    if (!sp[0]) throw new Error("Không có sản phẩm đang bán nào trong bb-dev — phép thử này cần một dòng products");
    const productId = sp[0].id as string;

    // Nhân viên thử vai cs.
    const { data, error } = await suKienAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;

    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`,
      [userId, `${NHAN} NV`, email],
    );
    await client.query(
      `insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`,
      [userId, branchId],
    );

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'approved',$4,'https://example.com/x',1) returning id`,
      [branchId, customerId, `${NHAN} Bộ`, `fixture-bb249-e2e-${runId}`],
    );
    galleryId = g[0].id;

    // Link để màn khách xem lại yêu cầu đã gửi.
    maLink = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
    );

    const { rows: y } = await client.query(
      `insert into yeu_cau_mua_them (gallery_id, product_id, so_luong, trang_thai)
       values ($1,$2,1,'moi') returning id`,
      [galleryId, productId],
    );
    yeuCauId = y[0].id;
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) {
        await client.query(
          "delete from activity_logs where entity_type = 'yeu_cau_mua_them' and gallery_id = $1",
          [galleryId],
        );
        await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
        await client.query("delete from yeu_cau_mua_them where gallery_id = $1", [galleryId]);
        await client.query("delete from share_links where gallery_id = $1", [galleryId]);
        await client.query("delete from galleries where id = $1", [galleryId]);
      }
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (userId) await client.query("delete from staff_branches where staff_id = $1", [userId]);
      if (userId) await client.query("delete from staff_profiles where id = $1", [userId]);
      await client.end();
    }
    if (userId) await suKienAdmin().auth.admin.deleteUser(userId);
  });

  test("cs gọi khách rồi chốt đơn; màn khách phản chiếu đúng trạng thái", async ({ page, context }) => {
    test.skip(!coBang, "Bảng yeu_cau_mua_them (migration 0072) chưa áp lên môi trường chạy thử này.");

    // 1. CSKH đăng nhập, mở chi tiết bộ ảnh.
    await page.goto("/login");
    await page.waitForURL("**/login**");
    await page.getByLabel("Tên tài khoản hoặc email").fill(email);
    await page.getByLabel("Mật khẩu").fill(password);
    await page.getByRole("button", { name: /Đăng nhập/i }).click();
    await page.waitForURL("**/admin**");

    await page.goto(`/admin/galleries/${galleryId}`);
    await expect(page.getByText("Yêu cầu mua thêm (1)")).toBeVisible({ timeout: 15_000 });

    // 2. Bấm "Đã gọi khách" -> da_lien_he.
    const nutGoi = page.getByRole("button", { name: "Đã gọi khách" });
    await expect(nutGoi).toBeVisible();
    await nutGoi.click();

    await expect
      .poll(async () => {
        const { rows } = await client.query("select trang_thai from yeu_cau_mua_them where id=$1", [yeuCauId]);
        return rows[0]?.trang_thai;
      }, { timeout: 10_000 })
      .toBe("da_lien_he");

    await expect(page.getByText("Đã liên hệ")).toBeVisible();

    // 3. Bấm "Đã chốt" -> da_chot, nút biến mất (trạng thái cuối).
    const nutChot = page.getByRole("button", { name: "Đã chốt" });
    await expect(nutChot).toBeVisible();
    await nutChot.click();

    await expect
      .poll(async () => {
        const { rows } = await client.query("select trang_thai from yeu_cau_mua_them where id=$1", [yeuCauId]);
        return rows[0]?.trang_thai;
      }, { timeout: 10_000 })
      .toBe("da_chot");

    await expect(page.getByText("Đã chốt", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đã gọi khách" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Huỷ" })).toHaveCount(0);

    // 4. Màn khách của đúng bộ này hiện "Đã chốt đơn", không lộ nút CSKH.
    const khachPage = await context.newPage();
    await khachPage.goto(`/g/${maLink}`);
    await expect(khachPage.getByText("Đã chốt đơn")).toBeVisible({ timeout: 15_000 });
  });
});
