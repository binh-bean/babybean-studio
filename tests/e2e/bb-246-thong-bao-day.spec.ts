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

  test("status 'submitted' — có nút bật thông báo", async ({ page }) => {
    test.skip(!coVapid, "Dev server không có NEXT_PUBLIC_VAPID_PUBLIC_KEY — ghi rõ, không thử được.");

    // Chromium HEADLESS luôn trả `Notification.permission === "denied"`, kể
    // cả sau `context.grantPermissions(["notifications"])` (đã đo thật: lúc
    // đó `navigator.permissions.query({name:"notifications"})` báo "granted"
    // nhưng `Notification.permission` — API cũ, đồng bộ — vẫn báo "denied".
    // Đây là hạn chế đã biết của Chromium chạy headless, không liên quan gì
    // tới bat-thong-bao.tsx: trình duyệt thật (có màn hình) không có kiểu
    // lệch này). Component tự ẩn nút khi quyền đã TỪ CHỐI HẲN — đúng ý muốn ở
    // đời thật, hứa một nút bấm không làm gì được còn tệ hơn không hứa — nên
    // nếu để nguyên, ca này luôn đỏ trong CI dù mã đúng.
    //
    // Ghi đè `Notification.permission` về "default" (chưa từng hỏi) TRƯỚC khi
    // trang chạy bất kỳ mã nào — đúng trạng thái thật của một trình duyệt
    // ba mẹ chưa từng bấm "Bật thông báo" lần nào, không phải giả lập hành vi
    // của chính component đang thử.
    await page.addInitScript(() => {
      Object.defineProperty(Notification, "permission", { get: () => "default" });
    });

    await page.goto(`/g/${maLinkSubmitted}`);
    await expect(
      page.getByRole("button", { name: "Bật thông báo để biết ngay khi ảnh chỉnh xong" }),
    ).toBeVisible();
  });
});
