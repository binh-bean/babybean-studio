/**
 * BB-365 — màn "ướm thử" chất liệu UV: nền là ẢNH CHỤP THẬT mặt bàn
 * (`/tuong/ban-uv-doc|ngang.jpg`), tấm ảnh của bé nằm trên bàn như ảnh giấy,
 * to nhỏ ĐÚNG theo cỡ UV ba mẹ chọn; không có ô chọn khung; bấm vào ảnh mở xem
 * lớn. Chạy ở hai khổ: điện thoại 390×844 (ảnh bàn dọc) và máy tính 1440×900
 * (ảnh bàn ngang).
 *
 * Dữ liệu: chỉ tạo dòng "Fixture BB-365 …" (khách, bộ ảnh, 6 ảnh dọc, link),
 * xoá theo id ở afterAll, kèm dọn rác ≥ 6 giờ theo tên + chi nhánh. Ảnh qua mock
 * lh3 (màu nước trừu tượng, không người). Ảnh chụp lưu ở `BB365_THU_MUC_ANH`
 * (mặc định test-results/bb-365, không commit).
 *
 * Kiểm ngược: cố định kích thước trong `tinhAnhGiayTrenBan` → ca "đổi cỡ thì
 * kích thước đổi" đỏ (bốn cỡ cùng một bề rộng).
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-365 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const THU_MUC_ANH = process.env.BB365_THU_MUC_ANH || "test-results/bb-365";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

const KHO_MAN = [
  { ten: "dien-thoai", w: 390, h: 844, tep: "ban-uv-doc.jpg", bangMayTinh: 0 },
  { ten: "may-tinh", w: 1440, h: 900, tep: "ban-uv-ngang.jpg", bangMayTinh: 360 },
] as const;

test.describe("BB-365: UV là ảnh giấy nằm trên bàn thật, to nhỏ theo cỡ", () => {
  test.describe.configure({ mode: "serial" });
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    await pg.query(
      `delete from galleries where title like 'Fixture BB-365%' and branch_id = $1 and created_at < now() - interval '6 hours'`,
      [branchId],
    );
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-365%' and branch_id = $1 and created_at < now() - interval '6 hours'`,
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
      [branchId, customerId, NHAN, `fixture-bb365-${runId}`],
    );
    galleryId = g[0].id;
    for (let i = 1; i <= 6; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
         values ($1,$2,$3,'image/jpeg',$4,'active',2000,3000)`,
        [galleryId, `bb365-${runId}-${i}.jpg`, `BB365_000${i}.jpg`, i],
      );
    }
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

  for (const kho of KHO_MAN) {
    test(`${kho.ten} ${kho.w}×${kho.h}: nền bàn thật, đổi cỡ thì ảnh to/nhỏ đúng tỉ lệ, không khung`, async ({ page }) => {
      await page.setViewportSize({ width: kho.w, height: kho.h });
      await chanLh3TrenTrinhDuyet(page);
      test.setTimeout(180_000); // lần đầu next dev còn biên dịch trang
      await page.goto(`/g/${maLink}`);
      // Bìa bộ ảnh (điện thoại): bấm "Bắt đầu chọn ảnh" để xuống lưới.
      const batDau = page.getByRole("button", { name: /Bắt đầu chọn ảnh/ }).filter({ visible: true }).first();
      await expect(batDau.or(page.getByTestId("the-anh").nth(4)).first()).toBeVisible({ timeout: 90_000 });
      if (await batDau.isVisible().catch(() => false)) await batDau.click();
      await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 60_000 });
      const tam = page.getByTestId("the-anh").nth(4);
      await tam.scrollIntoViewIfNeeded();
      // Ca trước (cùng bộ ảnh, chạy nối tiếp) có thể đã chọn sẵn tấm này.
      await expect(tam.getByRole("button", { name: /Chọn ảnh này|Bỏ chọn/ })).toBeVisible();
      if ((await tam.getByRole("button", { name: "Chọn ảnh này" }).count()) > 0) {
        await tam.getByRole("button", { name: "Chọn ảnh này" }).click();
      }
      await expect(tam.getByRole("button", { name: "Bỏ chọn" })).toBeVisible();
      await tam.click();
      const nutTuong = page.getByRole("button", { name: /Xem trên tường nhà/ }).filter({ visible: true }).first();
      // Điện thoại: nút nằm trong bảng "Đặt in" của màn xem lớn.
      if (!(await nutTuong.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" }).filter({ visible: true }).first().click();
      }
      await nutTuong.click();
      const man = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
      await expect(man).toBeVisible();

      const nutUv = man.getByRole("button", { name: "UV", exact: true });
      if ((await nutUv.count()) === 0) test.skip(true, "danh mục không có UV");
      await nutUv.click();

      // Nền là ảnh chụp thật mặt bàn, đúng khổ; không còn tranh màu nước cũ.
      const nen = man.getByTestId("nen-ban-uv");
      await expect(nen).toBeVisible();
      await expect(nen.locator("img").first()).toHaveAttribute("src", `/tuong/${kho.tep}`);
      await expect.poll(() => nen.locator("img").first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(1000);
      await expect(page.locator('img[src*="sp-uv-tren-ban"]')).toHaveCount(0);

      const anh = man.getByTestId("uv-anh-giay");
      await expect(anh).toBeVisible();
      await expect(man.getByTestId("uv-loi-bean")).toHaveText("UV in trên giấy ảnh, để gài album hoặc cất hộp ảnh gia đình ạ.");
      await expect(man.getByRole("heading", { name: "Ảnh giấy lưu giữ" })).toBeVisible();
      // UV không có ô chọn khung.
      await expect(man.getByTestId("tuy-chon-boc-khung")).toHaveCount(0);
      await expect(man.getByRole("checkbox")).toHaveCount(0);
      expect(await man.innerText()).not.toMatch(/cán (lên )?gỗ|UV bóng|để bàn|\btreo\b/i);

      // Các cỡ UV đang bán (lấy từ chip trên màn, không khoá cứng).
      const chip = man.getByRole("button", { name: /^\d+×\d+ cm$/ });
      const tenCo = (await chip.allInnerTexts()).map((s) => s.trim());
      expect(tenCo.length, "ít nhất 2 cỡ UV để so").toBeGreaterThanOrEqual(2);

      const doCo: Array<{ co: string; rong: number; cao: number }> = [];
      for (let i = 0; i < tenCo.length; i++) {
        await chip.nth(i).click();
        const co = tenCo[i]!.replace(" cm", "").replace("×", "x");
        await expect(anh).toHaveAttribute("data-co", co);
        await page.waitForTimeout(450); // chờ hết transition 300ms
        const kt = await anh.evaluate((el: HTMLElement) => ({ rong: el.offsetWidth, cao: el.offsetHeight }));
        doCo.push({ co, ...kt });

        // Nằm trong khung ảnh bàn, không dưới câu UV, không dưới bảng máy tính.
        const hop = (await anh.boundingBox())!;
        const hopNen = (await nen.boundingBox())!;
        const hopChu = (await man.getByTestId("uv-loi-bean").boundingBox())!;
        expect(hop.x).toBeGreaterThanOrEqual(hopNen.x - 1);
        expect(hop.x + hop.width).toBeLessThanOrEqual(hopNen.x + hopNen.width - kho.bangMayTinh + 1);
        expect(hop.y).toBeGreaterThanOrEqual(hopChu.y + hopChu.height);
        expect(hop.y + hop.height).toBeLessThanOrEqual(hopNen.y + hopNen.height + 1);

        if (i === 0 || i === tenCo.length - 1) {
          await page.screenshot({ path: `${THU_MUC_ANH}/${kho.ten}-${kho.w}x${kho.h}-uv-${co}.png` });
        }
      }

      // Ảnh dọc (2000×3000) → tấm giấy dọc. Cỡ lớn hơn → tấm to hơn, đúng tỉ lệ cm.
      for (let i = 0; i < doCo.length; i++) {
        const d = doCo[i]!;
        expect(d.cao, `${d.co} phải là ảnh dọc`).toBeGreaterThan(d.rong);
        const [a, b] = d.co.split("x").map(Number) as [number, number];
        expect(d.cao / d.rong).toBeCloseTo(Math.max(a, b) / Math.min(a, b), 1);
        if (i > 0) expect(d.rong, `${d.co} phải rộng hơn ${doCo[i - 1]!.co}`).toBeGreaterThan(doCo[i - 1]!.rong);
      }
      const nho = doCo.find((d) => d.co === "10x15");
      const lon = doCo.find((d) => d.co === "20x30");
      if (nho && lon) expect(lon.rong / nho.rong).toBeGreaterThan(1.9);
      if (nho && lon) expect(lon.rong / nho.rong).toBeLessThan(2.1);

      // Bấm vào tấm ảnh trên bàn: mở xem lớn như cũ.
      await anh.click();
      const xemLon = page.getByRole("dialog", { name: "Xem lớn ảnh của bé" });
      await expect(xemLon).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(xemLon).toBeHidden();
      await expect(man).toBeVisible();
    });
  }
});
