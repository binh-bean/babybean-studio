/**
 * BB-338 mục 2 + 4 — màn khách: mời gia đình, người được mời, thanh tiến trình.
 *
 *   2a. Ba mẹ tạo link mời, đóng, TẢI LẠI trang, mở lại → vẫn thấy link + Chép/Chia sẻ/Thu hồi.
 *   2b. Người được mời thấy đúng hai câu anh duyệt.
 *   2c. Người được mời THẢ TIM được (tim riêng, không ghi vào danh sách của ba mẹ).
 *   2d. Màn mua thêm: danh sách MỘT cột gọn (không tràn hai cột).
 *   2e. Chọn ảnh rồi không muốn nữa: có "Huỷ", và nút back đóng từng lớp, không văng khỏi bộ ảnh.
 *   4.  Thanh 5 bước ở 375×812 và 390×844: nhãn không đè nhau, không tràn — chụp ảnh lưu
 *       vào babybean-assets/BB-338/.
 *
 * Dữ liệu: "Fixture BB-338 …" (ảnh giả qua mock-drive), dọn theo id kèm chi nhánh.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-338 Moi ${runId}`;
const CHO_ANH = 30_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** `babybean-assets/` nằm cạnh repo — đi ngược lên tới khi gặp (chạy được cả ở main lẫn worktree). */
function thuMucAnh(): string {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const thu = path.join(d, "babybean-assets");
    if (fs.existsSync(thu)) return path.join(thu, "BB-338");
    d = path.dirname(d);
  }
  return path.resolve(__dirname, "../../test-results/BB-338");
}
const THU_MUC_ANH = thuMucAnh();

test.describe("BB-338: mời gia đình + người được mời + thanh tiến trình", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maBaMe = "";
  let maOngBa = "";

  test.beforeAll(async () => {
    fs.mkdirSync(THU_MUC_ANH, { recursive: true });
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
       values ($1,$2,$3,'in_review',$4,'https://example.com/bb338moi',4,5,50000,false) returning id`,
      [branchId, customerId, `${NHAN} Bộ`, `fixture-bb338moi-${runId}`],
    );
    galleryId = g[0].id;
    for (let i = 1; i <= 4; i++) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `bb338moi-${runId}-${i}`, `BB338M_000${i}.jpg`, i],
      );
    }
    maBaMe = randomBytes(32).toString("base64url");
    maOngBa = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active'), ($1,$4,$5,'viewer','active')`,
      [galleryId, sha256(maBaMe), maBaMe.slice(0, 6), sha256(maOngBa), maOngBa.slice(0, 6)],
    );
  });

  test.afterAll(async () => {
    if (!client) return;
    if (galleryId) {
      await client.query("delete from activity_logs where entity_id = $1 or gallery_id = $1", [galleryId]);
      await client.query("delete from thong_bao_khach where gallery_id = $1", [galleryId]).catch(() => {});
      await client.query("delete from selections where gallery_id = $1", [galleryId]);
      await client.query("delete from share_links where gallery_id = $1", [galleryId]);
      await client.query("delete from photos where gallery_id = $1", [galleryId]);
      await client.query("delete from galleries where id = $1 and branch_id = $2", [galleryId, branchId]);
    }
    if (customerId) await client.query("delete from customers where id = $1 and branch_id = $2", [customerId, branchId]);
    await client.end();
  });

  test("2a + 2e: link mời hiện lại sau khi tải lại trang; back đóng màn mời", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${maBaMe}`);
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_ANH });
    // BB-355 (bản vẽ v8 a) — lối mời nay là nút viền thứ hai trên bìa.
    await page.getByTestId("nut-moi-ong-ba-bia").click();
    await page.fill("#nhan-nguoi-than", "Fixture BB-338 Bà nội");
    await page.getByRole("button", { name: "Tạo link" }).click();
    await expect(page.getByText("Đã tạo link cho")).toBeVisible({ timeout: 15_000 });

    // Back của điện thoại: đóng màn mời, vẫn ở bộ ảnh.
    const urlTruoc = page.url();
    await page.goBack();
    await expect(page.locator("#nhan-nguoi-than")).toHaveCount(0);
    expect(page.url()).toBe(urlTruoc);

    // Thoát ra vào lại.
    await page.reload();
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_ANH });
    await page.getByTestId("nut-moi-ong-ba-bia").click();
    const dong = page.getByTestId("dong-nguoi-da-moi").filter({ hasText: "Fixture BB-338 Bà nội" });
    await expect(dong).toBeVisible({ timeout: 15_000 });
    await expect(dong.getByTestId("link-nguoi-da-moi")).toContainText("/g/");
    await expect(dong.getByRole("button", { name: "Chép link" })).toBeVisible();
    await expect(dong.getByRole("button", { name: "Chia sẻ" })).toBeVisible();
    await expect(dong.getByRole("button", { name: "Thu hồi" })).toBeVisible();
    await page.screenshot({ path: `${THU_MUC_ANH}/2a-link-moi-hien-lai-390.png` });

    // Nút Đóng cũng gỡ mục lịch sử: back sau đó không còn kẹt ở màn mời.
    await page.getByRole("button", { name: "Đóng" }).first().click();
    await expect(page.locator("#nhan-nguoi-than")).toHaveCount(0);
  });

  test("2b + 2c + 2d + 2e: người được mời thả tim, chọn tấm để mua, huỷ và back được", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${maOngBa}`);
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_ANH });

    // 2b — đúng câu anh duyệt.
    await expect(
      page.getByText(
        "Ảnh chọn trong gói được ba mẹ thực hiện. Gia đình thích tấm nào có thể đặt chỉnh sửa hoặc mua thêm ảnh in và album in ảnh ạ!",
      ),
    ).toBeVisible();

    // 2c — thả tim tấm 1 (tim riêng của người xem).
    const the1 = page.getByTestId("the-anh").first();
    await the1.scrollIntoViewIfNeeded();
    const tim = the1.getByRole("button", { name: /^(Chọn ảnh này|Bỏ chọn)$/ });
    await expect(tim).toBeEnabled();
    await tim.click();
    await expect(tim).toHaveAttribute("aria-pressed", "true");
    // Không ghi vào danh sách của ba mẹ.
    const { rows: chon } = await client.query(
      `select count(*)::int n from selection_items si join selections s on s.id = si.selection_id
        where s.gallery_id = $1 and si.mark = 'selected'`,
      [galleryId],
    );
    expect(chon[0].n).toBe(0);
    // Tải lại vẫn còn tim (lưu ở máy người xem).
    await page.reload();
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_ANH });
    // BB-355 (bản vẽ v8 c) — số tim nằm ở thanh đáy "1 tấm · gia đình thích".
    await expect(page.getByTestId("dem-tim-gia-dinh")).toHaveText(/^1\s*tấm\s*gia đình thích$/);

    // 2d — màn mua thêm: một cột gọn. BB-355: mở bằng nút túi ở thanh đáy (thẻ "Xem thêm" đã gỡ).
    // BB-358 — thanh đáy người xem ẩn khi bìa còn chiếm màn (cùng luật thanh của ba mẹ): cuộn tới lưới trước.
    await page.evaluate(() => {
      const the = document.querySelector('[data-testid="the-anh"]');
      if (the) window.scrollTo(0, the.getBoundingClientRect().top + window.scrollY - 120);
    });
    await page.getByRole("button", { name: "Mua ảnh in, album in ảnh" }).click();
    const man = page.getByTestId("man-mua-them-sau-duyet");
    await expect(man).toBeVisible();
    const dongSp = man.getByTestId("dong-san-pham-mua-them");
    const soDong = await dongSp.count();
    test.skip(soDong === 0, "Bảng giá bb-dev không có ảnh in đang bán");
    const xs = new Set<number>();
    for (let i = 0; i < Math.min(soDong, 4); i++) xs.add(Math.round((await dongSp.nth(i).boundingBox())!.x));
    expect(xs.size, "danh sách phải là MỘT cột").toBe(1);
    await page.screenshot({ path: `${THU_MUC_ANH}/2d-mua-them-gon-390.png` });

    // 2e — mở tấm chọn, chọn rồi HUỶ → không còn gì trong giỏ.
    await dongSp.first().getByRole("button", { name: "Chọn ảnh" }).click();
    const tam = page.getByTestId("tam-chon-anh-mua-them");
    await expect(tam).toBeVisible();
    await expect(tam.getByRole("button", { name: "Tấm đã thả tim (1)" })).toBeVisible();
    await tam.getByTestId("o-anh-mua-them").first().click();
    await expect(tam.getByTestId("o-anh-mua-them").first()).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: `${THU_MUC_ANH}/2e-tam-chon-anh-390.png` });
    await tam.getByRole("button", { name: "Huỷ chọn ảnh" }).click();
    await expect(tam).toHaveCount(0);
    await expect(man.getByRole("button", { name: "Gửi yêu cầu cho Bean" })).toBeDisabled();

    // Chọn lại, bấm Xong → dòng sản phẩm báo "Đã chọn 1 tấm".
    await dongSp.first().getByRole("button", { name: "Chọn ảnh" }).click();
    await tam.getByTestId("o-anh-mua-them").first().click();
    await tam.getByRole("button", { name: /^Xong/ }).click();
    await expect(dongSp.first()).toContainText("Đã chọn 1 tấm");

    // Back của điện thoại: lớp trong (tấm chọn) đóng trước, rồi tới màn mua thêm — không văng khỏi bộ ảnh.
    const urlBoAnh = page.url();
    await dongSp.first().getByRole("button", { name: "Sửa ảnh" }).click();
    await expect(tam).toBeVisible();
    await page.goBack();
    await expect(tam).toHaveCount(0);
    await expect(man).toBeVisible();
    await page.goBack();
    await expect(man).toHaveCount(0);
    expect(page.url()).toBe(urlBoAnh);
    await expect(page.locator('img[src*="/api/img/"]').first()).toBeVisible();
  });

  for (const kho of [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
  ]) {
    test(`4: thanh 5 bước gọn ở ${kho.width}×${kho.height}`, async ({ page }) => {
      await client.query("update galleries set status='submitted', lark_trang_thai=null where id=$1", [galleryId]);
      try {
        await page.setViewportSize(kho);
        await page.goto(`/g/${maBaMe}`);
        const the = page.locator("#the-hanh-trinh");
        await the.waitFor({ state: "visible", timeout: CHO_ANH });
        await the.scrollIntoViewIfNeeded();
        await expect(the.locator("[aria-current='step']")).toHaveText("Chờ xác nhận");
        const hopThe = (await the.boundingBox())!;
        const hop: { x: number; width: number }[] = [];
        for (const nhan of ["Chờ xác nhận", "Chờ chỉnh", "Đang chỉnh", "Duyệt ảnh", "In/nhận ảnh"]) {
          const h = await the.getByText(nhan, { exact: true }).boundingBox();
          expect(h, nhan).not.toBeNull();
          hop.push(h!);
        }
        for (let i = 0; i + 1 < hop.length; i++) {
          expect(hop[i]!.x + hop[i]!.width, `nhãn ${i + 1} đè nhãn ${i + 2}`).toBeLessThanOrEqual(hop[i + 1]!.x);
        }
        expect(hop[0]!.x).toBeGreaterThanOrEqual(hopThe.x);
        expect(hop[4]!.x + hop[4]!.width).toBeLessThanOrEqual(hopThe.x + hopThe.width);
        await the.screenshot({ path: `${THU_MUC_ANH}/4-thanh-tien-trinh-${kho.width}.png` });
      } finally {
        await client.query("update galleries set status='in_review' where id=$1", [galleryId]);
      }
    });
  }
});
