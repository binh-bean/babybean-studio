/**
 * BB-257 — Khối "Cần xử lý trước khi gửi khách" trên màn danh sách bộ ảnh.
 *
 * Dữ liệu do chính tệp này chèn và xoá — hai bộ Fixture BB-257 dùng
 * `drive_folder_id` GIẢ (`SEED_FOLDER_ID_BB257-…`, xem AGENTS.md §6). KHÔNG
 * bấm "Kiểm lại" trên bộ ảnh THẬT.
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

  test("CSKH thấy khối cảnh báo với bộ Fixture, bấm Kiểm lại hiện lý do lỗi tiếng Việt", async ({
    page,
  }) => {
    await dangNhapNhanVien(page, email, password);

    await page.goto("/admin/galleries");

    // Khối hiện ra, không tự ẩn — vì có ít nhất hai bộ Fixture đang lỗi.
    // Phạm vi mọi kiểm tra sau đây CHỈ trong khối này: bộ ảnh Fixture (thật,
    // chèn thẳng bằng SQL) cũng lọt vào danh sách kanban đầy đủ phía dưới —
    // không giới hạn phạm vi thì `getByText` khớp cả hai nơi.
    const khoiCanXuLy = page.getByTestId("can-xu-ly");
    await expect(khoiCanXuLy).toBeVisible({ timeout: 15_000 });
    await expect(khoiCanXuLy.getByText("Cần xử lý trước khi gửi khách")).toBeVisible();

    // Cả hai bộ Fixture đều thấy được (đúng tên, không lẫn với 73 bộ thật khác
    // đang có trên bb-dev — phân biệt bằng tên riêng mang runId).
    const dongDrive = khoiCanXuLy.getByText(`${NHAN} Bộ lỗi Drive`);
    const dongRong = khoiCanXuLy.getByText(`${NHAN} Bộ chưa có ảnh`);
    await expect(dongDrive).toBeVisible();
    await expect(dongRong).toBeVisible();

    // Nút "Mở thư mục Drive" có mặt cho bộ lỗi Drive.
    await expect(khoiCanXuLy.getByRole("link", { name: "Mở thư mục Drive" }).first()).toBeVisible();

    // Bấm "Kiểm lại" trên ĐÚNG bộ Fixture (không phải bộ thật nào khác).
    const nutKiemLai = khoiCanXuLy.getByTestId(`kiem-lai-${galDrive}`);
    await expect(nutKiemLai).toBeEnabled();
    await nutKiemLai.click();

    // Khoá nút ngay khi đang chạy — chặn bấm liên tục.
    await expect(nutKiemLai).toBeDisabled();

    // Chờ lượt kiểm lại chạy xong (gọi Drive thật với thư mục GIẢ + 3s chờ chủ
    // động của UI trước khi tải lại), rồi đọc lý do lỗi tiếng Việt hiện ra.
    // Thư mục giả không tồn tại nên vẫn lỗi — đúng luồng "vẫn lỗi thì hiện lý
    // do" của brief, không phải luồng "đồng bộ thành công".
    const dongFixture = khoiCanXuLy.locator("li", { hasText: `${NHAN} Bộ lỗi Drive` });
    await expect(dongFixture.getByText(LY_DO_CHUA_CHIA_SE)).toBeVisible({ timeout: 30_000 });

    // Nút mở khoá lại sau khi chạy xong — không bị kẹt mãi ở trạng thái khoá.
    await expect(nutKiemLai).toBeEnabled({ timeout: 20_000 });
  });
});
