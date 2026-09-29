/**
 * BB-166 — nút "Nhắn cho studio" trên màn khách, đọc từ `settings.chat.page_url`.
 *
 * OWNER: QA-BOT.
 *
 * ---------------------------------------------------------------------------
 * BB-304 — VIẾT LẠI 28/09/2026 (Opus soát ra, Claude viết lại)
 * ---------------------------------------------------------------------------
 * Bản cũ phạm cả ba điều cấm ở AGENTS.md §5a điều 3 + §6: lấy một bộ ảnh THẬT
 * bằng `.limit(1)`, đổi `status` của nó, và ghi đè rồi XOÁ cài đặt
 * `chat.page_url` toàn studio (branch_id null) mà không trả lại giá trị cũ —
 * mỗi lần chạy là nút nhắn tin biến mất khỏi app thật cho tới khi có người
 * phát hiện. Bản này:
 *   - tự dựng chi nhánh/khách/bộ ảnh "Fixture BB-166 …" (mẫu bb-295), không
 *     đụng dòng nào của studio thật;
 *   - đọc và khoá `chat.page_url` bằng `tests/helpers/khoa-cai-dat.ts` (cùng
 *     khoá `tests/unit/bb-166-api.test.ts` đang dùng — hai tệp cùng đụng một
 *     dòng `settings` toàn cục phải xếp hàng, không giẫm lên nhau);
 *   - `afterAll` TRẢ LẠI đúng giá trị cũ, hoặc XOÁ dòng nếu trước đó chưa từng
 *     tồn tại — không bao giờ để lại một dòng bịa.
 *
 * Thước đo AGENTS.md §5a: hoàn nguyên bước trả lại trong `afterAll` (comment
 * dòng `update`/`delete` cuối) thì một phép thử phụ đọc thẳng `chat.page_url`
 * SAU KHI bộ này chạy xong phải thấy giá trị KHÁC giá trị gốc — tức đỏ. Đã
 * làm thật bằng script ngoài (không commit): xem bàn giao BB-304 cho hai kết
 * quả (đỏ khi bỏ bước trả lại, xanh khi có).
 *
 * Nút giờ là BIỂU TƯỢNG không chữ (`aria-label` giữ nguyên, xem BB-281) — và
 * có ĐẾN HAI bản (điện thoại/máy tính) cùng nằm trong `#dau-luoi-anh`, ẩn hiện
 * bằng CSS chứ không gỡ khỏi DOM. Dò bằng `aria-label` rồi `.filter({ visible:
 * true })` để luôn còn đúng MỘT phần tử bất kể bề rộng màn hình — không thì
 * Playwright báo "strict mode violation" (đúng bài học ghi lại ở bản cũ, chỉ
 * đổi từ "có chữ, chân trang trùng chữ" sang "icon, hai bậc màn hình trùng
 * nhãn").
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { khoaCaiDat, moKhoaCaiDat, type KhoaCaiDat } from "../helpers/khoa-cai-dat";

const KHOA_CAI_DAT = "chat.page_url";
const runId = Math.random().toString(36).slice(2, 10);
const soGia = `0901${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-166 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// URL giả RÕ RÀNG (toàn số 0) — không được lẫn với một địa chỉ m.me thật.
const URL_GIA = "https://m.me/000000000000000";

test.describe("BB-166: nút 'Nhắn cho studio'", () => {
  let pg: Client;
  let khoa: KhoaCaiDat;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  /** Giá trị gốc của `chat.page_url` trước khi phép thử này đụng vào. */
  let giaTriGoc: unknown = null;
  /** Dòng cài đặt có tồn tại từ trước không — quyết định TRẢ LẠI hay XOÁ. */
  let dongCaiDatDaTonTai = false;

  test.beforeAll(async () => {
    // Khoá NGAY ĐẦU — chặn tệp khác (bb-166-api.test.ts) cùng đụng
    // `chat.page_url` chạy song song giẫm lên nhau. Xem tests/helpers/khoa-cai-dat.ts.
    khoa = await khoaCaiDat(KHOA_CAI_DAT);

    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    // Dọn rác fixture cũ để lại (chạy hỏng giữa chừng lần trước) — không đụng
    // gì mới hơn 6 giờ, để không giẫm lên một lượt chạy khác đang diễn ra.
    await pg.query(
      `delete from galleries where title like 'Fixture BB-166%' and created_at < now() - interval '6 hours'`,
    );
    await pg.query(
      `delete from branches where code like 'FIXTURE-BB166%' and created_at < now() - interval '6 hours'`,
    );

    // Đọc giá trị gốc TRƯỚC khi ghi gì — kể cả trường hợp dòng không tồn tại.
    const { rows: cd } = await pg.query(
      `select value from settings where key = $1 and branch_id is null`,
      [KHOA_CAI_DAT],
    );
    dongCaiDatDaTonTai = cd.length > 0;
    giaTriGoc = dongCaiDatDaTonTai ? cd[0].value : null;

    // Chi nhánh + khách + bộ ảnh GIẢ riêng — không đụng dữ liệu thật (AGENTS.md §6).
    const { rows: brRows } = await pg.query(
      `insert into branches (code, name) values ($1,$2) returning id`,
      [`FIXTURE-BB166-${runId}`, `${NHAN} Chi nhánh`],
    );
    branchId = brRows[0].id;

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách`, soGia],
    );
    customerId = kh[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url)
       values ($1,$2,$3,'ready',$4,'https://example.com/fixture-bb166')
       returning id`,
      [branchId, customerId, NHAN, `fixture-bb166-${runId}`],
    );
    galleryId = g[0].id;

    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
    );
  });

  test.afterAll(async () => {
    // TRẢ LẠI đúng giá trị cũ — hoặc XOÁ nếu trước đó dòng này chưa từng tồn
    // tại (không được để lại một dòng bịa cho cả studio dùng chung).
    //
    // Kiểm ngược BB-304 (đã làm, không để lại trong mã): bỏ khối if/else này
    // rồi chạy lại — chat.page_url bị bỏ lại đúng giá trị của ca cuối
    // (URL_GIA), khác giá trị gốc của studio. Bật lại khối này thì đúng giá
    // trị gốc được trả về. Cả hai kết quả đã dán vào bàn giao BB-304.
    if (dongCaiDatDaTonTai) {
      await pg.query(
        `update settings set value = $1::jsonb where key = $2 and branch_id is null`,
        [JSON.stringify(giaTriGoc), KHOA_CAI_DAT],
      );
    } else {
      await pg.query(`delete from settings where key = $1 and branch_id is null`, [KHOA_CAI_DAT]);
    }

    if (galleryId) {
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    if (branchId) await pg.query("delete from branches where id = $1", [branchId]).catch(() => {});
    await pg.end();

    // Đóng khoá SAU CÙNG — sau khi đã trả cài đặt về giá trị gốc.
    await moKhoaCaiDat(khoa);
  });

  /**
   * Dò nút theo `aria-label` (bản icon không còn chữ, BB-281) rồi lọc còn
   * phần tử ĐANG HIỆN — `#dau-luoi-anh` chứa cả bản điện thoại lẫn bản máy
   * tính, ẩn/hiện bằng CSS theo bề rộng màn hình, không phải gỡ khỏi DOM.
   */
  const nutNhanTin = (page: import("@playwright/test").Page) =>
    page.locator("#dau-luoi-anh").getByRole("link", { name: "Nhắn studio" }).filter({ visible: true });

  test("hiện khi có cấu hình hợp lệ, ẩn khi trống/sai/thiếu, vẫn hiện khi đã chốt", async ({ page }) => {
    // 1. Cấu hình hợp lệ -> nút hiện, đúng href/target/rel.
    await pg.query(
      `insert into settings (key, branch_id, value) values ($1, null, $2::jsonb)
       on conflict (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
       do update set value = excluded.value`,
      [KHOA_CAI_DAT, JSON.stringify(URL_GIA)],
    );

    await page.goto(`/g/${maLink}`);
    // Chờ đầu trang dựng xong trước khi dò nút — lần biên dịch ĐẦU TIÊN của
    // tiến trình `next dev` (route `/g/[token]` + `/api/g/gallery`) có thể ăn
    // gần hết ngân sách 15s mặc định của `expect`, y hệt lý do case 2-4 bên
    // dưới đã chờ `#dau-luoi-anh` trước khi kiểm — thêm bước này cho case 1
    // để không đỏ giả vì máy chậm lúc mới khởi động dev server.
    await page.locator("#dau-luoi-anh").waitFor({ state: "visible" });
    const chatLink = nutNhanTin(page);
    await expect(chatLink).toBeVisible();
    await expect(chatLink).toHaveAttribute("href", URL_GIA);
    await expect(chatLink).toHaveAttribute("target", "_blank");
    const rel = await chatLink.getAttribute("rel");
    expect(rel).toContain("noopener");

    // 2. Cấu hình rỗng -> không có nút.
    await pg.query(`update settings set value = '""'::jsonb where key = $1 and branch_id is null`, [
      KHOA_CAI_DAT,
    ]);
    await page.reload();
    await page.locator("#dau-luoi-anh").waitFor({ state: "visible" });
    await expect(nutNhanTin(page)).toHaveCount(0);

    // 3. Cấu hình không bắt đầu bằng https:// -> không có nút.
    await pg.query(
      `update settings set value = '"http://m.me/000000000000000"'::jsonb where key = $1 and branch_id is null`,
      [KHOA_CAI_DAT],
    );
    await page.reload();
    await page.locator("#dau-luoi-anh").waitFor({ state: "visible" });
    await expect(nutNhanTin(page)).toHaveCount(0);

    // 4. Khoá không tồn tại -> không có nút.
    await pg.query(`delete from settings where key = $1 and branch_id is null`, [KHOA_CAI_DAT]);
    await page.reload();
    await page.locator("#dau-luoi-anh").waitFor({ state: "visible" });
    await expect(nutNhanTin(page)).toHaveCount(0);

    // 5. Cấu hình hợp lệ trở lại VÀ bộ ảnh (fixture của chính phép thử này)
    // đã chốt -> nút vẫn hiện.
    await pg.query(
      `insert into settings (key, branch_id, value) values ($1, null, $2::jsonb)
       on conflict (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
       do update set value = excluded.value`,
      [KHOA_CAI_DAT, JSON.stringify(URL_GIA)],
    );
    await pg.query(`update galleries set status = 'submitted' where id = $1`, [galleryId]);
    await page.reload();
    await expect(nutNhanTin(page)).toBeVisible();
  });
});
