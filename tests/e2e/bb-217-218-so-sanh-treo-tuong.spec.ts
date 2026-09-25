/**
 * BB-217 + BB-218 — hai màn toàn màn hình mới của khách: so sánh nhiều tấm và
 * treo ảnh lên tường. Agent làm hai việc này không viết phép thử trình duyệt;
 * phép thử này canh những chỗ Claude sửa lúc soát:
 *
 * - So sánh: bỏ bớt còn 1 tấm phải ĐÓNG hẳn màn so sánh. Bản agent chỉ ẩn nó
 *   (trạng thái "đang mở" vẫn bật), nên đánh dấu thêm một tấm ở lưới thì màn
 *   so sánh tự bật lên không báo trước.
 * - Treo tường: mở được từ bảng sản phẩm của tấm ĐÃ CHỌN, có ảnh phòng + khung,
 *   có nút cỡ lấy từ danh mục thật, và Esc chỉ đóng màn treo tường chứ không
 *   đóng luôn màn xem lớn bên dưới.
 *
 * Dữ liệu: chỉ tạo dòng "Fixture BB-217-218 …", xoá sạch ở afterAll. Ảnh thử
 * trỏ tới tệp Drive không có thật — ảnh vỡ, nhưng thẻ ảnh và các nút vẫn dựng,
 * đủ cho những gì phép thử này canh.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
// Số giả MỚI mỗi lượt: số cố định va nhau khi hai worktree chạy cùng tệp
// (uq_customers_phone_branch) — xảy ra 25/09/2026 khi agent BB-222 chạy song song.
const soGia = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-217-218 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("BB-217 + BB-218: so sánh nhiều tấm, treo ảnh lên tường", () => {
  let pg: Client;
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(
      `delete from galleries where title like 'Fixture BB-217-218%' and created_at < now() - interval '1 hour'`,
    );
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-217-218%' and created_at < now() - interval '1 hour'`,
    );

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [br[0].id, `${NHAN} Khách`, soGia],
    );
    customerId = kh[0].id;
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',3,10,50000,false) returning id`,
      [br[0].id, customerId, NHAN, `fixture-bb217-${runId}`],
    );
    galleryId = g[0].id;
    // Ảnh dọc (2000×3000) — màn treo tường chọn hướng khung theo tấm của bé.
    for (let i = 1; i <= 3; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
         values ($1,$2,$3,'image/jpeg',$4,'active',2000,3000)`,
        [galleryId, `bb217-${runId}-${i}.jpg`, `BB217_000${i}.jpg`, i],
      );
    }
    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner','Fixture BB-217-218','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
  });

  test.afterAll(async () => {
    if (galleryId) {
      // selection_items/placements/addons đi theo selections (on delete cascade).
      await pg.query("delete from selections where gallery_id = $1", [galleryId]);
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    await pg.end();
  });

  test("so sánh: bỏ còn 1 tấm thì đóng hẳn, đánh dấu thêm không tự bật lại", async ({ page }) => {
    await page.goto(`/g/${maLink}`);
    const the = page.getByTestId("the-anh");
    await expect(the).toHaveCount(3);

    await page.getByRole("button", { name: "So sánh", exact: true }).click();
    await the.nth(0).click();
    await the.nth(1).click();
    await page.getByRole("button", { name: /Đã chọn 2 tấm để so sánh/ }).click();

    const manSoSanh = page.getByRole("dialog", { name: "So sánh nhiều tấm" });
    await expect(manSoSanh).toBeVisible();
    await expect(manSoSanh.locator("img")).toHaveCount(2);

    await manSoSanh.getByRole("button", { name: "Bỏ khỏi so sánh" }).first().click();
    await expect(manSoSanh).toBeHidden();

    // Chỗ lỗi cũ: tấm thứ hai đủ điều kiện "≥ 2 tấm" và màn so sánh bật lại.
    await the.nth(2).click();
    await expect(page.getByRole("button", { name: /Đã chọn 2 tấm để so sánh/ })).toBeVisible();
    await page.waitForTimeout(300);
    await expect(manSoSanh).toBeHidden();
  });

  test("treo tường: mở từ tấm đã chọn, có khung, Esc chỉ đóng một lớp", async ({ page }) => {
    await page.goto(`/g/${maLink}`);
    const tamDau = page.getByTestId("the-anh").first();
    await tamDau.getByRole("button", { name: "Chọn ảnh này" }).click();
    await expect(tamDau.getByRole("button", { name: "Bỏ chọn" })).toBeVisible();

    await tamDau.click();
    const anhLon = page.getByRole("dialog").first();
    await expect(anhLon).toBeVisible();
    await page.getByRole("button", { name: /Xem trên tường nhà mình/ }).first().click();

    const manTuong = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
    await expect(manTuong).toBeVisible();
    // Ảnh phòng thật (public/tuong) + tấm của bé trong khung.
    await expect(manTuong.locator('img[src*="/tuong/"]').first()).toBeVisible();
    await expect(manTuong.locator('img[src*="/api/img/"]')).toHaveCount(1);
    // Nút cỡ đọc từ danh mục: phải có ít nhất một cỡ, và có cỡ ngoài bộ ba cũ.
    const nutCo = manTuong.getByRole("button", { name: /^\d+×\d+ cm$/ });
    expect(await nutCo.count()).toBeGreaterThan(0);
    const tenCo = await nutCo.allTextContents();
    expect(tenCo.some((t) => !["40×60 cm", "50×75 cm", "60×90 cm"].includes(t.trim()))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(manTuong).toBeHidden();
    await expect(page.getByRole("button", { name: /Xem trên tường nhà mình/ }).first()).toBeVisible();
  });
});
