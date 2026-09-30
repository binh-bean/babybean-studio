/**
 * BB-332 — "Bản ghi mới từ Lark" (Bàn làm việc) + tab "Dòng Lark đã bị xoá"
 * (Việc cần xử lý) + thuật sĩ tạo bộ ảnh điền sẵn từ bản ghi Lark.
 *
 * Dữ liệu: chỉ "Fixture BB-332 …", xoá theo id ở afterAll (kể cả staff_branches).
 * KHÔNG gọi Lark ghi. Mốc đồng bộ trong settings được đặt "vừa chạy" trong lúc
 * thử để trang không đi đọc Lark (và không xoá dòng Fixture vì Lark không có
 * nó) — rồi TRẢ LẠI giá trị cũ.
 *
 * Bảng `lark_ban_ghi_moi` + cột `galleries.lark_dong_da_xoa_luc` đến từ
 * migration 0079 (chưa áp lúc viết). Chưa áp thì hai ca cần bảng tự bỏ qua,
 * ca còn lại kiểm trang không vỡ.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-332 ${runId}`;
const email = `test_bb332_${runId}@demo.babybean.vn`;
const matKhau = "Password123!";
const MA_DONG = `recFixtureBB332${runId}`;
const KHOA_LUOT = "lark_ban_ghi_moi_luot";

test.describe("BB-332: bản ghi mới từ Lark", () => {
  let client: Client;
  let userId = "";
  let branchId = "";
  let coBang = false;
  let customerId = "";
  let galleryId = "";
  let mocCu: unknown = undefined; // undefined = chưa có dòng settings

  const admin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches where is_active order by name limit 1");
    branchId = br[0].id;

    const { data, error } = await admin().auth.admin.createUser({ email, password: matKhau, email_confirm: true });
    if (error) throw error;
    userId = data.user!.id;
    await client.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      userId,
      `${NHAN} NV`,
      email,
    ]);
    await client.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [userId, branchId]);

    const { rows: t } = await client.query(`select to_regclass('public.lark_ban_ghi_moi')::text as t`);
    coBang = !!t[0]?.t;
    if (!coBang) return;

    // Chặn lượt đồng bộ tự động trong lúc thử (nhớ giá trị cũ để trả lại).
    const { rows: s } = await client.query(`select value from settings where key = $1 and branch_id is null`, [KHOA_LUOT]);
    mocCu = s.length ? s[0].value : undefined;
    const bayGio = JSON.stringify({ timestamp: Date.now() + 3_600_000 });
    if (s.length) await client.query(`update settings set value = $1::jsonb where key = $2 and branch_id is null`, [bayGio, KHOA_LUOT]);
    else await client.query(`insert into settings (key, value) values ($1, $2::jsonb)`, [KHOA_LUOT, bayGio]);

    await client.query(
      `insert into lark_ban_ghi_moi (lark_record_id, branch_id, ten_khach, so_dien_thoai, goi_chup, ma_hoa_don, chi_nhanh_lark)
       values ($1,$2,$3,'0901000001','Fam 04','HD_20260930#332','Fixture')`,
      [MA_DONG, branchId, `${NHAN} Mẹ Mai`],
    );

    // Bộ ảnh đã gửi khách mà dòng Lark bị xoá → tab "Dòng Lark đã bị xoá".
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000002') returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count,
                              lark_hauky_record_id, lark_dong_da_xoa_luc)
       values ($1,$2,$3,'in_review',$4,'https://example.com/x',0,$5, now()) returning id`,
      [branchId, customerId, `${NHAN} Bộ ảnh`, `SEED_FOLDER_ID_BB332_${runId}`, `${MA_DONG}g`],
    );
    galleryId = g[0].id;
  });

  test.afterAll(async () => {
    if (client) {
      if (coBang) {
        await client.query(`delete from lark_ban_ghi_moi where lark_record_id = $1`, [MA_DONG]);
        if (mocCu === undefined) await client.query(`delete from settings where key = $1 and branch_id is null`, [KHOA_LUOT]);
        else await client.query(`update settings set value = $1::jsonb where key = $2 and branch_id is null`, [JSON.stringify(mocCu), KHOA_LUOT]);
      }
      if (galleryId) {
        await client.query(`delete from activity_logs where entity_id = $1`, [galleryId]);
        await client.query(`delete from galleries where id = $1`, [galleryId]);
      }
      if (customerId) await client.query(`delete from customers where id = $1`, [customerId]);
      if (userId) {
        await client.query(`delete from staff_branches where staff_id = $1`, [userId]);
        await client.query(`delete from staff_profiles where id = $1`, [userId]);
      }
      await client.end();
    }
    if (userId) await admin().auth.admin.deleteUser(userId);
  });

  test("Bàn làm việc và tab Việc cần xử lý không vỡ (có hoặc chưa có migration 0079)", async ({ page }) => {
    await dangNhapNhanVien(page, email, matKhau);
    const phanHoi = page.waitForResponse((r) => r.url().includes("/api/admin/lark-moi"));
    await page.goto("/admin");
    const r = await phanHoi;
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body.data.dong)).toBe(true);
    if (!coBang) {
      expect(body.data.chuaApMigration).toBe(true);
      await expect(page.getByTestId("ban-ghi-moi-lark")).toHaveCount(0);
    }

    await page.goto("/admin/viec-can-xu-ly?tab=lark-da-xoa");
    await expect(page.getByTestId("tab-lark-da-xoa")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dòng Lark đã bị xoá" })).toBeVisible();

    // Mã dòng không có → thuật sĩ vẫn mở bình thường, không báo lỗi.
    await page.goto("/admin/galleries/create?banGhiLark=recKhongCoBB332");
    await expect(page.getByPlaceholder("https://drive.google.com/drive/folders/…")).toBeVisible();
    // (bỏ qua ô thông báo rỗng của Next route announcer)
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  });

  test("bản ghi mới hiện ĐẦU Bàn làm việc; bấm Tạo bộ ảnh → thuật sĩ điền sẵn mã hoá đơn + SĐT", async ({ page }) => {
    test.skip(!coBang, "Chưa áp migration 0079");
    await dangNhapNhanVien(page, email, matKhau);
    await page.goto("/admin");
    const khoi = page.getByTestId("ban-ghi-moi-lark");
    await expect(khoi).toBeVisible();
    const dong = khoi.locator("li", { hasText: `${NHAN} Mẹ Mai` });
    await expect(dong).toBeVisible();
    await expect(dong).toContainText("Mới nhập");
    await expect(dong).toContainText("chưa có link Drive");

    // Khối đứng trên "Cần xử lý ngay" (đầu trang, ngay sau lời chào).
    const yKhoi = (await khoi.boundingBox())!.y;
    const canXuLy = page.getByText("Cần xử lý ngay").first();
    if (await canXuLy.count()) expect(yKhoi).toBeLessThan((await canXuLy.boundingBox())!.y);

    // Không đi tra Lark thật từ thuật sĩ trong phép thử: chặn route tra-lark,
    // và dùng chính lượt gọi đó làm bằng chứng thuật sĩ đã điền sẵn đúng số.
    await page.route("**/api/admin/galleries/tra-lark", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { dong: [] } }) }),
    );
    const traLark = page.waitForRequest((req) => req.url().includes("/api/admin/galleries/tra-lark"));
    await dong.getByRole("link", { name: "Tạo bộ ảnh" }).click();
    await page.waitForURL(`**/admin/galleries/create?banGhiLark=${MA_DONG}`);
    expect(page.url()).not.toContain("0901000001"); // SĐT không lên thanh địa chỉ
    const req = await traLark;
    expect(req.postDataJSON()).toEqual({ maHoaDon: "HD_20260930#332", soDienThoai: "0901000001" });
  });

  test("tab Dòng Lark đã bị xoá: có dòng, bấm Đã xử lý thì dòng rời danh sách", async ({ page }) => {
    test.skip(!coBang, "Chưa áp migration 0079");
    await dangNhapNhanVien(page, email, matKhau);
    await page.goto("/admin/viec-can-xu-ly?tab=lark-da-xoa");
    const dong = page.getByTestId("dong-lark-da-xoa").filter({ hasText: NHAN });
    await expect(dong).toBeVisible();
    await dong.getByRole("button", { name: "Đã xử lý" }).click();
    await expect(dong).toHaveCount(0);
    const { rows } = await client.query(`select lark_dong_da_xoa_luc from galleries where id = $1`, [galleryId]);
    expect(rows[0].lark_dong_da_xoa_luc).toBeNull();
  });
});
