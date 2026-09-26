/**
 * E-1 "Vòng đời hạnh phúc" — kịch bản đầu tiên của ma trận E2E (docs/10 mục 5).
 *
 * OWNER: QA-BOT. Task BB-053.
 *
 * ---------------------------------------------------------------------------
 * Vì sao đến hôm nay mới viết được trọn vẹn
 * ---------------------------------------------------------------------------
 * E-1 kết thúc bằng "nhân viên xuất CSV → đối chiếu đúng tên file". Đường xuất
 * danh sách ấy **chỉ tồn tại trong tệp dịch** cho tới BB-067 (22/09/2026): có
 * quyền `galleries:export`, có mô tả trong docs/04, không có route. Nên vế cuối
 * của kịch bản này trước đây không viết được, và cả kịch bản nằm im.
 *
 * ---------------------------------------------------------------------------
 * Nó canh cái gì mà phép thử đơn vị không canh được
 * ---------------------------------------------------------------------------
 * Từng mảnh đều đã có phép thử riêng: RPC chọn ảnh, route chốt, route xuất.
 * Thứ chưa ai đo là **cả chuỗi nối vào nhau bằng trình duyệt thật**:
 *
 *   ba mẹ bấm tim trên điện thoại
 *     → lựa chọn đi qua cookie phiên đã ký, qua RLS, xuống cơ sở dữ liệu
 *     → bấm Chốt, bộ ảnh khoá lại
 *     → nhân viên đăng nhập bằng tài khoản thật
 *     → tải danh sách về, và **đúng những tấm ba mẹ đã bấm**
 *
 * Mỗi mắt nối là một chỗ hai bên hiểu khác nhau mà không ai báo: sai id ảnh,
 * sai lượt chọn, sai thứ tự, hay xuất nhầm ảnh chỉ thả tim.
 *
 * Dữ liệu tự dựng, mang nhãn runId riêng, dọn đúng nhãn của mình.
 */

import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture E-1 ${runId}`;
const email = `test_e1_${runId}@demo.babybean.vn`;
const password = "Password123!";

const CHO_ANH = 30_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Bốn tấm, sort_index cố ý KHÔNG theo thứ tự sẽ bấm. */
const ANH = [
  { ten: "E1_0001.jpg", idx: 1 },
  { ten: "E1_0002.jpg", idx: 2 },
  { ten: "E1_0003.jpg", idx: 3 },
  { ten: "E1_0004.jpg", idx: 4 },
];

test.describe("E-1: vòng đời hạnh phúc", () => {
  let client: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  const suKienAdmin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    // Rác của lần chạy cũ hơn một giờ — không đụng fixture đang chạy song song.
    await client.query(
      `delete from galleries where title like 'Fixture E-1%' and created_at < now() - interval '6 hours'`,
    );
    await client.query(
      `delete from customers where full_name like 'Fixture E-1%' and created_at < now() - interval '6 hours'`,
    );

    // --- nhân viên thật, đăng nhập được ------------------------------------
    const { data, error } = await suKienAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`,
      [userId, `${NHAN} Nhân viên`, email],
    );

    // --- khách, bộ ảnh, bốn tấm --------------------------------------------
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',$5,5,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-e1-${runId}`, ANH.length],
    );
    galleryId = g[0].id;

    for (const a of ANH) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `e1-${runId}-${a.ten}`, a.ten, a.idx],
      );
    }

    // --- link gửi khách, mã thật ------------------------------------------
    maLink = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (userId) await client.query("delete from staff_profiles where id = $1", [userId]);
      await client.end();
    }
    if (userId) await suKienAdmin().auth.admin.deleteUser(userId);
  });

  test("ba mẹ chọn ảnh rồi chốt, nhân viên tải về ĐÚNG những tấm đó", async ({ page }) => {
    // ── 1. Ba mẹ mở link ───────────────────────────────────────────────────
    await page.goto(`/g/${maLink}`);

    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });
    await expect
      .poll(async () => anhDau.evaluate((el: HTMLImageElement) => el.naturalWidth), {
        timeout: CHO_ANH,
        message: "Ảnh không tải được — ba mẹ sẽ thấy lưới trống",
      })
      .toBeGreaterThan(0);

    // ── 2. Chọn hai tấm: tấm thứ BA trước, rồi tấm thứ NHẤT ────────────────
    //
    // Cố ý bấm ngược thứ tự thư mục. Danh sách nhân viên tải về phải sắp theo
    // thứ tự ảnh trong thư mục Drive, không theo thứ tự ba mẹ bấm — thợ chỉnh
    // ảnh đi từ trên xuống trong thư mục.
    const nutChon = page.locator('button[aria-label="Chọn ảnh này"]');
    const dem = page.getByTestId("dem-da-chon");
    await expect(dem).toHaveText("0");

    await nutChon.nth(2).click();
    await expect(dem).toHaveText("1", { timeout: 10_000 });
    await nutChon.nth(0).click();
    await expect(dem).toHaveText("2", { timeout: 10_000 });

    // ── 3. Chốt danh sách ──────────────────────────────────────────────────
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();

    // Hai ô bắt buộc — máy chủ đòi `confirmedByName` và `agreed` từ đầu, còn
    // màn hình thì tới 22/09/2026 mới có. Chính phép thử này làm lộ ra.
    await page.fill("#confirm-name-input", "Mẹ Bean");
    await page.getByRole("checkbox").check();
    await page.fill("#customer-note-input", "Cả bộ làm tông sáng giúp em");
    await page.getByRole("button", { name: "Xác nhận" }).click();

    // Bộ ảnh phải KHOÁ thật trong cơ sở dữ liệu, không chỉ đổi màn hình.
    await expect
      .poll(
        async () => {
          const { rows } = await client.query("select status::text s from galleries where id=$1", [
            galleryId,
          ]);
          return rows[0]?.s;
        },
        { timeout: 20_000, message: "Bộ ảnh không chuyển sang trạng thái đã chốt" },
      )
      .toBe("submitted");

    // ── 4. Nhân viên đăng nhập bằng tài khoản thật ─────────────────────────
    await page.goto("/login");
    await page.waitForURL("**/login**");
    // Chọn theo NHÃN, không theo thuộc tính `type`: ô tên tài khoản không khai
    // `type` nên mọi bộ chọn dựa vào nó đều mong manh.
    await page.getByLabel("Tên tài khoản hoặc email").fill(email);
    await page.getByLabel("Mật khẩu").fill(password);
    await page.getByRole("button", { name: /Đăng nhập/i }).click();
    await page.waitForURL("**/admin**");

    // ── 5. Tải danh sách ảnh đã chọn ───────────────────────────────────────
    const res = await page.request.get(`/api/admin/galleries/${galleryId}/export`);
    expect(res.status()).toBe(200);
    const danhSach = (await res.text()).split("\r\n");

    // ĐÚNG hai tấm ba mẹ bấm, theo thứ tự thư mục (0001 trước 0003).
    expect(danhSach).toEqual(["E1_0001.jpg", "E1_0003.jpg"]);

    // ── 6. Bản CSV mang theo lời dặn của ba mẹ ─────────────────────────────
    const resCsv = await page.request.get(
      `/api/admin/galleries/${galleryId}/export?format=csv`,
    );
    expect(resCsv.status()).toBe(200);
    const csv = await resCsv.text();
    expect(csv).toContain("E1_0001.jpg");
    expect(csv).toContain("Cả bộ làm tông sáng giúp em");
    expect(csv).not.toContain("E1_0002.jpg");

    // ── 7. Cả chuỗi phải để lại vết kiểm toán ──────────────────────────────
    const { rows: log } = await client.query(
      `select action from activity_logs where gallery_id = $1 or entity_id = $1`,
      [galleryId],
    );
    const hanhDong = log.map((r) => r.action);
    expect(hanhDong).toContain("selection.submit");
    expect(hanhDong).toContain("gallery.export");
  });
});
