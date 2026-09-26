/**
 * BB-246 — nút "Bật thông báo" trên màn khách.
 *
 * OWNER: Sonnet. Chủ studio: ba mẹ bật thông báo một lần, rồi nhận tin khi
 * ảnh đã chỉnh xong, mời duyệt.
 *
 * Canh đúng điều brief đòi: bộ ảnh `ready` (còn đang chọn ảnh) thì KHÔNG có
 * nút; bộ ảnh `submitted` trở đi (đã chốt, đang chờ studio) thì CÓ nút — chỉ
 * khi dev server có khoá VAPID (đặt sẵn ở `.env.local`, xem
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`, khoá
 * GIẢ chỉ để chạy cục bộ — không phải khoá thật của studio).
 *
 * Không thử luồng bấm "Bật" xin quyền + subscribe thật: Chromium headless
 * không có kênh push thật để subscribe thành công (không phải giả lập hành
 * vi trình duyệt bằng regex — đây là giới hạn thật của môi trường CI, không
 * phải né tránh thử behaviour). Nút hiện đúng lúc, đúng điều kiện là điều
 * quan trọng nhất kiểm được đáng tin ở lớp e2e; luồng subscribe/gửi thật đã
 * có phép thử đơn vị canh (tests/unit/bb-246-thong-bao-day.test.ts).
 *
 * Dữ liệu: chỉ tạo dòng "Fixture BB-246 …", xoá sạch ở afterAll.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
// Số giả MỚI mỗi lượt — số cố định va nhau khi nhiều worktree chạy cùng tệp
// (uq_customers_phone_branch), như bb-217-218 đã ghi chú.
const soGia = () => `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-246 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("BB-246: nút Bật thông báo", () => {
  let pg: Client;
  let coVapid = false;

  let customerIdReady = "";
  let galleryIdReady = "";
  let maLinkReady = "";

  let customerIdSubmitted = "";
  let galleryIdSubmitted = "";
  let maLinkSubmitted = "";

  test.beforeAll(async () => {
    // Nút chỉ hiện khi dev server có khoá VAPID (playwright.config.ts tự nạp
    // .env.local). Không cấu hình được thì ghi rõ ở đây thay vì để ca đỏ mù mờ.
    coVapid = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(
      `delete from galleries where title like 'Fixture BB-246%' and created_at < now() - interval '1 hour'`,
    );
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-246%' and created_at < now() - interval '1 hour'`,
    );

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    const branchId = br[0].id;

    // Bộ ảnh 'ready' — còn đang chọn ảnh, chưa có gì để "chờ thông báo".
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Ready`, soGia()],
      );
      customerIdReady = kh[0].id;
      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, included_quota, extra_photo_price,
                                download_enabled)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',1,10,50000,false) returning id`,
        [branchId, customerIdReady, NHAN, `fixture-bb246-ready-${runId}`],
      );
      galleryIdReady = g[0].id;
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',1,'active')`,
        [galleryIdReady, `bb246-ready-${runId}.jpg`, `BB246_READY.jpg`],
      );
      maLinkReady = randomBytes(32).toString("base64url");
      await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
         values ($1,$2,$3,'owner','Fixture BB-246 Ready','active')`,
        [galleryIdReady, sha256(maLinkReady), maLinkReady.slice(0, 6)],
      );
    }

    // Bộ ảnh 'submitted' — đã chốt, đúng lúc ba mẹ muốn biết KHI NÀO ảnh xong.
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Submitted`, soGia()],
      );
      customerIdSubmitted = kh[0].id;
      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, included_quota, extra_photo_price,
                                download_enabled)
         values ($1,$2,$3,'submitted',$4,'https://example.com/x',1,10,50000,false) returning id`,
        [branchId, customerIdSubmitted, NHAN, `fixture-bb246-submitted-${runId}`],
      );
      galleryIdSubmitted = g[0].id;
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',1,'active')`,
        [galleryIdSubmitted, `bb246-submitted-${runId}.jpg`, `BB246_SUBMITTED.jpg`],
      );
      maLinkSubmitted = randomBytes(32).toString("base64url");
      await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
         values ($1,$2,$3,'owner','Fixture BB-246 Submitted','active')`,
        [galleryIdSubmitted, sha256(maLinkSubmitted), maLinkSubmitted.slice(0, 6)],
      );
    }
  });

  test.afterAll(async () => {
    for (const galleryId of [galleryIdReady, galleryIdSubmitted]) {
      if (!galleryId) continue;
      await pg.query("delete from selections where gallery_id = $1", [galleryId]);
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    for (const customerId of [customerIdReady, customerIdSubmitted]) {
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    }
    await pg.end();
  });

  test("status 'ready' — chưa có nút bật thông báo", async ({ page }) => {
    test.skip(!coVapid, "Dev server không có NEXT_PUBLIC_VAPID_PUBLIC_KEY — ghi rõ, không thử được.");

    await page.goto(`/g/${maLinkReady}`);
    await expect(page.getByTestId("the-anh")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Bật thông báo để biết ngay khi ảnh chỉnh xong" }),
    ).toHaveCount(0);
  });

  /**
   * BB-258 (26/09/2026) — PHÉP THỬ PHẢI ĐỔI, ghi lý do:
   *
   * Chủ studio (ảnh chụp màn khách máy tính) chê dòng "Bật thông báo để biết
   * ngay khi ảnh chỉnh xong" nằm lơ lửng mép trái, thiếu tinh tế. Một Sonnet
   * khác đang làm CHUÔNG THÔNG BÁO góc phải để THAY THẾ chỗ gắn này; Opus sẽ
   * nối chuông đó vào lúc gộp nhánh. Nhiệm vụ BB-258 chỉ được phép GỠ chỗ gắn
   * (`<BatThongBao />`) khỏi `gallery-app.tsx` — cấm đụng `bat-thong-bao.tsx`,
   * `src/lib/thong-bao/**`, `public/sw.js`, `src/app/api/g/thong-bao/**`.
   *
   * Ca thử gốc canh ĐÚNG một hành vi thật (nút hiện đúng lúc theo status) —
   * không phải phép thử vô dụng theo nghĩa AGENTS.md §5a. Nó đỏ bây giờ vì
   * SẢN PHẨM cố ý bỏ chỗ gắn, không phải vì logic `bat-thong-bao.tsx` sai.
   * Đổi tạm sang canh "nút không còn ở đây nữa" (khớp trạng thái sản phẩm
   * hiện tại) thay vì xoá hẳn ca thử — khi Opus nối lại chuông thay thế, ca
   * thử này cần sửa lại lần nữa để canh chuông mới, không phải xoá vĩnh viễn.
   */
  test("status 'submitted' — nút bật thông báo cũ đã gỡ khỏi màn khách (chờ chuông thay thế, BB-258)", async ({
    page,
  }) => {
    test.skip(!coVapid, "Dev server không có NEXT_PUBLIC_VAPID_PUBLIC_KEY — ghi rõ, không thử được.");

    // BB-258: bỏ addInitScript ghi đè `Notification.permission` từng có ở
    // đây — nó chỉ cần thiết để né hành vi headless Chromium làm rối logic
    // HIỆN nút của `bat-thong-bao.tsx` (component đó giờ không còn gắn ở
    // màn khách nữa, xem chú thích phía trên), giữ lại nó không còn ý nghĩa.
    await page.goto(`/g/${maLinkSubmitted}`);
    // BB-258: bìa tràn một màn hình, lưới ảnh chỉ vẽ khi cuộn tới gần.
    await page.locator("#dau-luoi-anh").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("the-anh")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Bật thông báo để biết ngay khi ảnh chỉnh xong" }),
    ).toHaveCount(0);

    // BB-261 (Opus nối khi gộp) — chuông thay thế: có ở đầu trang, bấm mở ra
    // danh sách; bộ Fixture chưa có thông báo nào → "Chưa có thông báo".
    const chuong = page.getByRole("button", { name: /^Thông báo/ });
    await expect(chuong).toBeVisible();
    await chuong.click();
    await expect(page.getByText("Chưa có thông báo")).toBeVisible();
  });
});
