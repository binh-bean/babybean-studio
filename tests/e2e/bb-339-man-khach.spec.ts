/**
 * BB-339 — màn khách: chọn ảnh cho món trong gói (bấm vào là chọn được, cập
 * nhật ngay), cửa hàng báo "Trong gói: x/y ảnh" + chọn ảnh trong gói tại chỗ,
 * lưới chọn ảnh dùng ảnh nét (srcset), demo treo tường in tràn viền / UV là
 * ảnh giấy + dòng "Hình demo chỉ mang tính tham khảo ạ."
 *
 * Dữ liệu: chỉ tạo dòng "Fixture BB-339 …" (khách, bộ ảnh, ảnh, link, dòng
 * hàng trong gói trỏ tới sản phẩm THẬT Gỗ 40x60 + Album 20x20), xoá theo id ở
 * afterAll, kèm dọn rác ≥ 6 giờ theo tên + chi nhánh. Ảnh qua mock lh3, không
 * có ảnh trẻ em thật. Ảnh chụp lưu ở test-results/bb-339 (không commit).
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-339 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const THU_MUC_ANH = "test-results/bb-339";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

test.describe("BB-339: sản phẩm trong gói, cửa hàng, demo treo tường", () => {
  test.describe.configure({ mode: "serial" });
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";
  let coGo4060 = false;

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    await pg.query(
      `delete from galleries where title like 'Fixture BB-339%' and branch_id = $1 and created_at < now() - interval '6 hours'`,
      [branchId],
    );
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-339%' and branch_id = $1 and created_at < now() - interval '6 hours'`,
      [branchId],
    );
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách`, soGia],
    );
    customerId = kh[0].id;
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',6,10,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-bb339-${runId}`],
    );
    galleryId = g[0].id;
    for (let i = 1; i <= 6; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
         values ($1,$2,$3,'image/jpeg',$4,'active',2000,3000)`,
        [galleryId, `bb339-${runId}-${i}.jpg`, `BB339_000${i}.jpg`, i],
      );
    }
    const { rows: go } = await pg.query(
      `select id from products where is_active and kind='print' and material='Gỗ' and size='40x60'
          and lark_record_id is not null and name not like 'Fixture%' limit 1`,
    );
    coGo4060 = go.length > 0;
    if (coGo4060) {
      await pg.query(
        `insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,1,0)`,
        [galleryId, go[0].id],
      );
    }
    // Hạn mức 10 ảnh chỉnh ("Edit file" ×10) — để cửa hàng báo "Trong gói: x/10 ảnh".
    await pg.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
       select $1, id, 10, 0 from products where is_active and kind = 'edited_photo' order by id limit 1`,
      [galleryId],
    );
    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
    );
  });

  test.afterAll(async () => {
    if (galleryId) {
      await pg.query("delete from selections where gallery_id = $1", [galleryId]);
      await pg.query("delete from gallery_items where gallery_id = $1", [galleryId]);
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1 and branch_id = $2", [galleryId, branchId]);
    }
    if (customerId) await pg.query("delete from customers where id = $1 and branch_id = $2", [customerId, branchId]);
    await pg.end();
  });

  test("món trong gói: bấm vào là mở lưới chọn ảnh nét, chọn xong cập nhật ngay", async ({ page }) => {
    test.skip(!coGo4060, "bb-dev không có Gỗ 40x60 đang bán");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/g/${maLink}`);
    await expect(page.getByTestId("the-anh")).toHaveCount(6);
    const nut = page.getByRole("button", { name: "Chọn ảnh cho Gỗ 40×60" });
    await nut.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${THU_MUC_ANH}/1-trong-goi-truoc.png` });
    await nut.click();

    const luoi = page.getByRole("dialog", { name: "Chọn ảnh để đặt in" });
    await expect(luoi.getByRole("heading", { name: "Ảnh cho Gỗ 40×60" })).toBeVisible();
    // Chưa thả tim tấm nào → lưới mở sẵn "Tất cả".
    const o = luoi.locator("button[aria-pressed]");
    await expect(o).toHaveCount(6);
    // Mục 1 — ảnh nét: không còn ?w=200, có srcset 800w.
    const img = o.first().locator("img");
    // (lh3 giả trong phép thử có thể lỗi → ảnh tự thử lại qua route `&qua=1` và
    // bỏ srcset; vẫn phải là bậc 400/800, không phải 200.)
    const src = (await img.getAttribute("src")) ?? "";
    expect(src).not.toContain("w=200");
    expect(src).toMatch(/w=(400|800)/);
    expect(await img.getAttribute("sizes")).toContain("vw");
    await o.nth(1).click();
    // Suất 1 tấm: bấm tấm khác là đổi.
    await o.nth(2).click();
    await expect(o.nth(2)).toHaveAttribute("aria-pressed", "true");
    await expect(o.nth(1)).toHaveAttribute("aria-pressed", "false");
    await expect(luoi.getByText("Đã chọn 1/1 tấm")).toBeVisible();
    await page.screenshot({ path: `${THU_MUC_ANH}/2-luoi-chon-anh-trong-goi.png` });
    const daLuu = page.waitForResponse(
      (r) => r.url().includes("/api/g/placements") && r.request().method() === "POST",
    );
    await luoi.getByRole("button", { name: "Xong" }).click();
    await expect(luoi).toBeHidden();

    // Cập nhật lạc quan: thẻ món đổi ngay sang "Đủ 1 tấm" + có ảnh thu nhỏ.
    const khoi = page.locator("#trong-goi-cua-ba-me");
    await expect(khoi.getByText("Đủ 1 tấm")).toBeVisible({ timeout: 1500 });
    await expect(khoi.getByRole("button", { name: "Đổi ảnh cho Gỗ 40×60" })).toBeVisible();
    await page.screenshot({ path: `${THU_MUC_ANH}/3-trong-goi-sau.png` });

    // Đã lưu thật: tải lại vẫn còn.
    expect((await daLuu).status()).toBe(200);
    await page.reload();
    await expect(page.locator("#trong-goi-cua-ba-me").getByText("Đủ 1 tấm")).toBeVisible();
  });

  test("cửa hàng: báo 'Trong gói: x/y ảnh' và chọn ảnh trong gói tại chỗ", async ({ page }) => {
    test.skip(!coGo4060, "bb-dev không có Gỗ 40x60 đang bán");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${maLink}`);
    await expect(page.getByTestId("the-anh").first()).toBeVisible();
    // Thanh đáy (có nút giỏ "Mua thêm") ẩn khi còn ở bìa — cuộn xuống lưới trước.
    await page.getByTestId("the-anh").first().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 600);
    await page.getByRole("button", { name: "Mua thêm", exact: true }).click();
    const cuaHang = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
    const khoi = cuaHang.getByTestId("trong-goi-cua-hang");
    await expect(khoi).toBeVisible();
    await expect(khoi.getByTestId("trong-goi-dem")).toHaveText(/\d+\/10 tấm/);
    await expect(khoi.getByRole("button", { name: /ảnh trong gói cho Gỗ 40×60/ })).toBeVisible();
    await page.screenshot({ path: `${THU_MUC_ANH}/4-cua-hang-trong-goi-390.png` });
    await khoi.getByRole("button", { name: /ảnh trong gói cho Gỗ 40×60/ }).click();
    await expect(page.getByRole("heading", { name: "Ảnh cho Gỗ 40×60" })).toBeVisible();
  });

  test("demo treo tường: UV là ảnh giấy (không treo), có khung mới treo; có dòng tham khảo", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/g/${maLink}`);
    const tam = page.getByTestId("the-anh").nth(4);
    await tam.getByRole("button", { name: "Chọn ảnh này" }).click();
    await expect(tam.getByRole("button", { name: "Bỏ chọn" })).toBeVisible();
    await tam.click();
    await page.getByRole("button", { name: /Xem trên tường nhà mình/ }).first().click();
    const manTuong = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
    await expect(manTuong).toBeVisible();
    await expect(manTuong.getByTestId("tham-khao-demo")).toHaveText("Hình demo chỉ mang tính tham khảo ạ.");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${THU_MUC_ANH}/5-tuong-mac-dinh-tran-vien.png` });

    // BB-358 (anh 02/10) — tên chỉ là "UV"; UV là ảnh giấy: không khung, không treo tường.
    // Chất liệu mặc định (đã cán) có lựa chọn khung khi danh mục có khung — ghi lại để so sau.
    const soLuaChonKhungMacDinh = await manTuong.getByTestId("tuy-chon-boc-khung").count();
    const nutUv = manTuong.getByRole("button", { name: "UV", exact: true });
    if ((await nutUv.count()) === 0) test.skip(true, "danh mục không có UV");
    await nutUv.click();
    await expect(manTuong.getByTestId("uv-anh-giay")).toBeVisible();
    await expect(manTuong.getByTestId("uv-loi-bean")).toHaveText("UV là ảnh in trên giấy ảnh, hợp để gài album hoặc để bàn ạ.");
    await expect(manTuong.getByTestId("tuy-chon-boc-khung")).toHaveCount(0);
    await expect(manTuong.getByRole("checkbox")).toHaveCount(0);
    const chuUv = await manTuong.innerText();
    expect(chuUv).not.toMatch(/cán (lên )?gỗ|UV bóng|chọn thêm khung/i);
    await page.screenshot({ path: `${THU_MUC_ANH}/6-tuong-uv-anh-giay.png` });

    // Chất liệu đã cán (Gỗ): vẫn có lựa chọn bọc khung như cũ, và lại treo trên tường.
    const nutGo = manTuong.getByRole("button", { name: "Gỗ", exact: true });
    if ((await nutGo.count()) > 0) {
      await nutGo.click();
      await expect(manTuong.getByTestId("uv-anh-giay")).toHaveCount(0);
      await expect(manTuong.getByTestId("tuy-chon-boc-khung")).toHaveCount(soLuaChonKhungMacDinh);
      if (soLuaChonKhungMacDinh > 0) await expect(manTuong.getByTestId("tuy-chon-boc-khung")).toBeVisible();
    }
  });
});
