/**
 * BB-338 mục 3 — "Yêu cầu sửa lại" báo sai "Bộ ảnh vẫn đang mở".
 *
 * Ca anh vấp 01/10/2026: bộ app còn `in_review`, Lark đã "Đã chọn hình" →
 * màn khách khoá chọn + hiện "Yêu cầu sửa lại", bấm gửi thì máy chủ trả
 * "Bộ ảnh vẫn đang mở — ba mẹ sửa trực tiếp được, không cần xin ạ".
 *
 * Hai nhánh:
 *   1. Bộ đang khoá (theo Lark) → có nút, gửi được, CSKH thấy nhật ký.
 *   2. Bộ thật sự còn mở → KHÔNG có nút "Yêu cầu sửa lại".
 *
 * Dữ liệu: "Fixture BB-338 …", dọn theo id (kèm chi nhánh lấy từ bộ fixture).
 * Lark không bị gửi: máy chủ phép thử chạy với PHEP_THU_TRINH_DUYET=1.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-338 MoLai ${runId}`;
const CHO_ANH = 30_000;
const LARK_DA_CHON_HINH = "optl5DyKLx";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("BB-338: Yêu cầu sửa lại khớp luật khoá của màn khách", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query(
      "select id from branches where name not like 'Fixture%' order by name limit 1",
    );
    branchId = br[0].id;
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'in_review',$4,'https://example.com/bb338',3,5,50000,false) returning id`,
      [branchId, customerId, `${NHAN} Bộ`, `fixture-bb338-${runId}`],
    );
    galleryId = g[0].id;
    for (let i = 1; i <= 3; i++) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `bb338-${runId}-${i}`, `BB338_000${i}.jpg`, i],
      );
    }
    maLink = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
  });

  test.afterAll(async () => {
    if (!client) return;
    if (galleryId) {
      await client.query("delete from activity_logs where entity_id = $1 or gallery_id = $1", [galleryId]);
      await client.query("delete from notifications where payload->>'galleryId' = $1", [galleryId]).catch(() => {});
      await client.query("delete from thong_bao_khach where gallery_id = $1", [galleryId]).catch(() => {});
      await client.query("delete from selections where gallery_id = $1", [galleryId]);
      await client.query("delete from share_links where gallery_id = $1", [galleryId]);
      await client.query("delete from photos where gallery_id = $1", [galleryId]);
      await client.query("delete from galleries where id = $1 and branch_id = $2", [galleryId, branchId]);
    }
    if (customerId) await client.query("delete from customers where id = $1 and branch_id = $2", [customerId, branchId]);
    await client.end();
  });

  test("1. bộ khoá theo Lark ('Đã chọn hình') → có nút Yêu cầu sửa lại và GỬI ĐƯỢC", async ({ page }) => {
    await client.query(
      `update galleries set status='in_review', lark_trang_thai=$2, lark_trang_thai_tu=now() - interval '1 day',
              reopened_at=null where id=$1`,
      [galleryId, LARK_DA_CHON_HINH],
    );
    await page.goto(`/g/${maLink}`);
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_ANH });
    // Thanh đáy chỉ nổi lên khi đã cuộn qua bìa (đúng như ảnh anh chụp).
    await page.getByTestId("the-anh").first().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 400);

    await page.getByRole("button", { name: "Yêu cầu sửa lại" }).first().click();
    await page.getByPlaceholder("Ví dụ: đổi tấm số 12 sang tấm số 15").fill("Fixture BB-338 đổi tấm 2");
    await page.getByRole("button", { name: "Gửi cho studio" }).click();

    await expect(page.getByText("Bean đã nhận yêu cầu", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("vẫn đang mở")).toHaveCount(0);
    const { rows } = await client.query(
      "select count(*)::int n from activity_logs where gallery_id = $1 and action = 'gallery.reopen_requested'",
      [galleryId],
    );
    expect(rows[0].n).toBe(1);
  });

  test("2. bộ THẬT SỰ còn mở → không có nút Yêu cầu sửa lại", async ({ page }) => {
    await client.query("delete from activity_logs where gallery_id = $1", [galleryId]);
    await client.query(
      `update galleries set status='in_review', lark_trang_thai=null, lark_trang_thai_tu=null, reopened_at=null
        where id=$1`,
      [galleryId],
    );
    await page.goto(`/g/${maLink}`);
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_ANH });
    // Lưới còn chọn được: tim bấm được.
    await page.getByTestId("the-anh").first().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 400);
    await expect(page.getByTestId("the-anh").first().getByRole("button", { name: /^(Chọn ảnh này|Bỏ chọn)$/ })).toBeEnabled();
    // Thanh đáy đã nổi (nút chính là "Chốt danh sách"), và KHÔNG có "Yêu cầu sửa lại".
    await expect(page.getByRole("button", { name: "Chốt danh sách" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Yêu cầu sửa lại" })).toHaveCount(0);
    // Gọi thẳng route vẫn được nói rõ là không cần xin.
    const res = await page.request.post("/api/g/xin-sua-lai", { data: { lyDo: "Fixture BB-338 thử" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.message).toContain("vẫn đang mở");
  });
});
