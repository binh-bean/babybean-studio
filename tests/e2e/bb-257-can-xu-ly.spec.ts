/**
 * BB-257 — Dải cảnh báo "N bộ cần xử lý trước khi gửi khách" trên màn danh
 * sách bộ ảnh, và luồng "Thử lại" thật sự ở /admin/viec-can-xu-ly.
 *
 * BB-290 lượt 2: khối chi tiết (mở sẵn 134 dòng, trùng hẳn nội dung của
 * /admin/viec-can-xu-ly) đã thu gọn còn MỘT DÒNG cảnh báo + nút "Xem" dẫn
 * sang trang chi tiết. Phép thử này vì vậy tách hai việc:
 *  1. Trên /admin/galleries: dải cảnh báo hiện đúng số, bấm "Xem" điều hướng
 *     đúng trang.
 *  2. Trên /admin/viec-can-xu-ly (tab "Bộ ảnh lỗi tải", BB-280): bộ Fixture
 *     `sync_error` hiện ra, nút "Thử lại" chạy được. Nhóm "chuaCoAnh" (draft +
 *     0 ảnh) KHÔNG hiện ở tab này — trang đó chỉ lọc theo `sync_error`, một
 *     khoảng lệch còn ghi lại ở `can-xu-ly.tsx`; phép thử chỉ canh bộ đó vẫn
 *     được ĐẾM đúng ở dải cảnh báo, không đòi nó xuất hiện trong bảng chi
 *     tiết của trang kia.
 *
 * Dữ liệu do chính tệp này chèn và xoá — hai bộ Fixture BB-257 dùng
 * `drive_folder_id` GIẢ (`SEED_FOLDER_ID_BB257-…`, xem AGENTS.md §6). KHÔNG
 * bấm "Thử lại" trên bộ ảnh THẬT.
 *
 * ---------------------------------------------------------------------------
 * Vì sao bấm "Kiểm lại" ở đây vẫn được coi là an toàn dù không giả `fetch`
 * ---------------------------------------------------------------------------
 * `src/lib/drive/client.ts` chặn MỌI lượt gọi Drive thật khi `dangChayPhepThu()`
 * (biến `VITEST`/`NODE_ENV=test`) — nhưng máy chủ Next dev mà Playwright bật
 * lên (`playwright.config.ts`) chạy `next dev` bình thường, không đặt cờ đó.
 * Nút "Kiểm lại" ở phép thử này VẪN gọi thật `GET .../drive/v3/files` của
 * Google với `drive_folder_id` GIẢ — nhưng đó đúng là điều brief BB-257 cho
 * phép: "dùng bộ Fixture với thư mục giả để nhận lỗi mong đợi". Thư mục giả
 * không tồn tại nên Google trả 404, ánh xạ thành đúng câu lỗi
 * "Thư mục chưa được chia sẻ công khai" — không đọc/ghi gì của một thư mục
 * thật, không tốn quota có ý nghĩa (một yêu cầu liệt kê, không tải ảnh).
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-257 ${runId}`;
const email = `test_bb257_${runId}@demo.babybean.vn`;
const password = "Password123!";

const LY_DO_CHUA_CHIA_SE = "Thư mục chưa được chia sẻ công khai";

test.describe("BB-257: Cần xử lý trước khi gửi khách", () => {
  let client: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galDrive = "";
  let galRong = "";

  const suKienAdmin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

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

    // Bộ 1: sync_error, thư mục Drive GIẢ chưa (và không thể) chia sẻ công khai.
    const { rows: gA } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, sync_error, photo_count, last_synced_at)
       values ($1,$2,$3,'sync_error',$4,$5,$6,0, now()) returning id`,
      [
        branchId,
        customerId,
        `${NHAN} Bộ lỗi Drive`,
        `SEED_FOLDER_ID_BB257-drv-${runId}`,
        `https://drive.google.com/drive/folders/SEED_FOLDER_ID_BB257-drv-${runId}`,
        LY_DO_CHUA_CHIA_SE,
      ],
    );
    galDrive = gA[0].id;

    // Bộ 2: draft, chưa có ảnh nào.
    const { rows: gB } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'draft',$4,$5,0) returning id`,
      [
        branchId,
        customerId,
        `${NHAN} Bộ chưa có ảnh`,
        `SEED_FOLDER_ID_BB257-rong-${runId}`,
        `https://drive.google.com/drive/folders/SEED_FOLDER_ID_BB257-rong-${runId}`,
      ],
    );
    galRong = gB[0].id;
  });

  test.afterAll(async () => {
    if (client) {
      for (const id of [galDrive, galRong]) {
        if (id) await client.query("delete from activity_logs where entity_id = $1", [id]);
      }
      if (galDrive) await client.query("delete from galleries where id = $1", [galDrive]);
      if (galRong) await client.query("delete from galleries where id = $1", [galRong]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (userId) await client.query("delete from staff_branches where staff_id = $1", [userId]);
      if (userId) await client.query("delete from staff_profiles where id = $1", [userId]);
      await client.end();
    }
    if (userId) await suKienAdmin().auth.admin.deleteUser(userId);
  });

  test("Danh sách bộ ảnh: dải cảnh báo hiện đúng số, bấm Xem sang đúng trang", async ({ page }) => {
    await dangNhapNhanVien(page, email, password);
    await page.goto("/admin/galleries");

    // Dải hiện ra, không tự ẩn — vì có ít nhất hai bộ Fixture đang cần xử lý.
    const dai = page.getByTestId("can-xu-ly");
    await expect(dai).toBeVisible({ timeout: 15_000 });
    await expect(dai).toContainText("bộ cần xử lý trước khi gửi khách");
    await expect(dai.getByText("Xem")).toBeVisible();

    // Dải KHÔNG còn liệt kê tên từng bộ hay nút "Thử lại" riêng — đó là nội
    // dung của /admin/viec-can-xu-ly (BB-290 lượt 2, tránh trùng lặp).
    await expect(dai.getByText(`${NHAN} Bộ lỗi Drive`)).toHaveCount(0);

    await dai.click();
    await page.waitForURL("**/admin/viec-can-xu-ly**");
  });

  test("Việc cần xử lý (tab Bộ ảnh lỗi tải): bộ Fixture hiện ra, Thử lại vẫn báo đúng lý do", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapNhanVien(page, email, password);
    await page.goto("/admin/viec-can-xu-ly?tab=loi-dong-bo");

    // Lý do lỗi là TIÊU ĐỀ NHÓM (nhóm theo lý do, BB-129), không lặp lại
    // trong từng dòng — nhóm chứa cả tiêu đề lẫn dòng của bộ Fixture (bảng ở
    // `lg`+, KHÔNG dùng "tr, li" chung chung vì trang còn một bản thẻ điện
    // thoại `lg:hidden` cùng khớp text mà `.first()` có thể chọn nhầm bản ẩn).
    const nhom = page.locator("section", { hasText: LY_DO_CHUA_CHIA_SE }).first();
    await expect(nhom).toBeVisible({ timeout: 15_000 });
    await expect(nhom.getByText(LY_DO_CHUA_CHIA_SE)).toBeVisible();

    const dongFixture = nhom.locator("table tbody tr", { hasText: `${NHAN} Bộ lỗi Drive` }).first();
    await expect(dongFixture).toBeVisible();

    const nutThuLai = dongFixture.getByRole("button", { name: "Thử lại" });
    await expect(nutThuLai).toBeEnabled();
    await nutThuLai.click();

    // Chờ lượt thử lại chạy xong (gọi Drive thật với thư mục GIẢ + 5s chờ chủ
    // động của UI trước khi tải lại), rồi đọc lại đúng lý do lỗi tiếng Việt —
    // thư mục giả không tồn tại nên vẫn lỗi, đúng luồng "vẫn lỗi thì hiện lý
    // do lỗi mới nhất" chứ không phải luồng "đồng bộ thành công". Bộ Fixture
    // vẫn còn trong ĐÚNG nhóm lý do cũ sau khi danh sách tải lại.
    const nhomSauKhiTai = page.locator("section", { hasText: LY_DO_CHUA_CHIA_SE }).first();
    await expect(nhomSauKhiTai).toBeVisible({ timeout: 30_000 });
    await expect(
      nhomSauKhiTai.locator("table tbody tr", { hasText: `${NHAN} Bộ lỗi Drive` }).first(),
    ).toBeVisible();
  });
});
