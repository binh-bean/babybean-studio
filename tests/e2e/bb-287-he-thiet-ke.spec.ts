/**
 * BB-287 — Nền hệ thiết kế màn khách: sáu nguyên tắc bị vi phạm lặp lại.
 *
 * OWNER: QA-BOT (chỉ file này; sản phẩm do DEV-FE sửa theo phát hiện).
 *
 * Phép thử đo MÁY, không đoán bằng mắt, đúng bốn điều cấm ở AGENTS.md §5a:
 * không đọc mã nguồn làm dữ liệu thử, không giả lập hook React, phép thử ghi
 * DB tự trả lại giá trị cũ (afterAll xoá đúng id đã tạo), không kiểm chuỗi có
 * trong mọi HTML (mỗi assertion neo vào một giá trị hoặc hành vi cụ thể).
 *
 * (a) mọi h2/h3 màn khách thuộc tập cỡ cho phép (getComputedStyle) — 6 bậc
 *     H1 40/32 · H2 28 · H3 20 · thân 15 · chú thích 13 · nhãn 11.
 * (b) không màu chữ/nền ngoài bảng ở phần tử chính đã bị báo cáo chấm nêu
 *     tên (overlay tấm đã chọn, chữ "Đã lưu ghi chú").
 * (c) không còn tên tệp .jpg hiển thị trong lưới khách.
 * (d) ba bộ đếm (Tất cả / Đã chọn / Chưa chọn) luôn cộng đúng thành tổng.
 * (e) chọn bìa album không xoá cả trang thành "Đang tải…", giữ vị trí cuộn.
 *
 * Dữ liệu: chỉ "Fixture BB-287 …" (AGENTS.md §6), dọn theo đúng id đã tạo.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-287 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const CHO_ANH = 20_000;

/** Sáu bậc chữ chốt ở tokens.css (.kh-h1/.kh-h2/.kh-h3/.kh-body/.kh-caption/.kh-eyebrow). */
const CO_CHO_PHEP = [40, 32, 28, 20, 15, 13, 11];
function coHopLe(pxText: string): boolean {
  const px = parseFloat(pxText);
  return CO_CHO_PHEP.some((c) => Math.abs(c - px) < 0.5);
}

test.describe("BB-287: hệ thiết kế màn khách", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";
  let albumProductId = "";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    await pg.query(
      `delete from galleries where title like 'Fixture BB-287%' and created_at < now() - interval '6 hours'`,
    );
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-287%' and created_at < now() - interval '6 hours'`,
    );

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    // Album trong gói — để hiện khối "Chọn ảnh bìa album" (đo (a): tiêu đề
    // h3 của khối đó; và (e): chọn bìa không xoá trắng trang).
    const { rows: sp } = await pg.query(
      `select id from products
        where is_active and material ilike '%album%' and list_price is not null
          and price_confidence >= 0.8 and price_samples >= 5
        limit 1`,
    );
    albumProductId = sp[0]?.id ?? "";

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',24,10,50000) returning id`,
      [branchId, customerId, NHAN, `fixture-bb287-${runId}`],
    );
    galleryId = g[0].id;

    if (albumProductId) {
      await pg.query(
        `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
         values ($1,$2,1,500000)`,
        [galleryId, albumProductId],
      );
      // Không có dòng "ảnh chỉnh sửa" thì hạn mức "chưa biết" và app CHẶN thả
      // tim — cùng ghi chú Opus soát BB-202 đã để lại ở bb-202-album.spec.ts.
      await pg.query(
        `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
         select $1, id, 10, 0 from products
          where is_active and kind = 'edited_photo' order by id limit 1`,
        [galleryId],
      );
    }

    // 24 ảnh, tên tệp CÓ ĐUÔI .jpg thật — nếu bản vá bị hoàn nguyên thì (c)
    // phải bắt được chuỗi này lộ ra trong lưới.
    for (let i = 1; i <= 24; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `bb287-${runId}-${i}`, `BB287_${String(i).padStart(4, "0")}.jpg`, i],
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
    if (pg) {
      if (galleryId) await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from album_covers where gallery_id = $1", [galleryId]).catch(() => {});
      if (galleryId) await pg.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from gallery_items where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
      await pg.end();
    }
  });

  test("(c)+(d) lưới khách: không lộ tên tệp .jpg, ba bộ đếm cộng đúng thành tổng", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLink}`);

    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    // (c) — báo cáo chấm #5: "BBS_0001.jpg dưới mỗi ảnh, trông như ổ đĩa".
    // Cả trang (lightbox chưa mở ở ca này) không được lộ đuôi .jpg ở đâu cả —
    // tên tệp thật (`BB287_0001.jpg`) đã được ghim vào 24 ảnh fixture ở trên.
    await expect(page.locator(".giao-dien-khach").getByText(/\.jpg/i)).toHaveCount(0);

    // (d) — báo cáo chấm #7: bấm liền vài tim, ba bộ đếm phải luôn cộng
    // đúng thành tổng số ảnh — không đọc lệch nhau như trước bản vá.
    const nutChon = page.locator('button[aria-label="Chọn ảnh này"]');
    await nutChon.nth(0).click();
    await nutChon.nth(1).click();
    await nutChon.nth(2).click();

    const nutDaChon = page.getByRole("button", { name: /^Đã chọn/ });
    const nutChuaChon = page.getByRole("button", { name: /^Chưa chọn/ });
    const nutTatCa = page.getByRole("button", { name: /^Tất cả/ });

    await expect(async () => {
      const [tenTatCa, tenDaChon, tenChuaChon] = await Promise.all([
        nutTatCa.textContent(),
        nutDaChon.textContent(),
        nutChuaChon.textContent(),
      ]);
      const soTatCa = Number(tenTatCa?.match(/[\d.]+$/)?.[0].replace(/\./g, ""));
      const soDaChon = Number(tenDaChon?.match(/[\d.]+$/)?.[0].replace(/\./g, ""));
      const soChuaChon = Number(tenChuaChon?.match(/[\d.]+$/)?.[0].replace(/\./g, ""));
      expect(soDaChon).toBe(3);
      expect(soDaChon + soChuaChon).toBe(soTatCa);
      expect(soTatCa).toBe(24);
    }).toPass({ timeout: 10_000 });
  });

  test("(b) trạng thái chọn không còn viền đen — tim đặc + lớp phủ terracotta", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLink}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    const theDau = page.locator('[data-testid="the-anh"]').first();
    const nutTim = theDau.locator('button[aria-label="Chọn ảnh này"]');
    await nutTim.click();
    // Chờ React chuyển nhãn nút tim sang "Bỏ chọn" — bằng chứng lượt dựng lại
    // do `daChon` đổi đã CHẠY XONG, không đọc DOM khi bản dựng cũ còn đứng.
    await expect(theDau.locator('button[aria-label="Bỏ chọn"]')).toBeVisible({ timeout: 5_000 });

    // Ô ảnh của tấm ĐÃ CHỌN không còn có phần tử nào mang box-shadow đen
    // #2E2A27 (viền cũ báo cáo chấm mục #6 mô tả "nhìn như lỗi hiển thị").
    const boxShadows = await theDau.locator("*").evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).boxShadow),
    );
    for (const bs of boxShadows) {
      expect(bs.includes("46, 42, 39")).toBe(false);
    }

    // Lớp phủ ấm terracotta (#C4645A ở 6%) phải có mặt — Chrome dựng màu nền
    // của lớp phủ này ở không gian oklab (color-mix nội bộ của Tailwind cho
    // alpha tuỳ ý), nên so khớp qua CHÍNH class Tailwind đã áp thay vì phân
    // tích chuỗi `rgb(...)` của giá trị đã được trình duyệt tính lại.
    const coLopPhu = await theDau.evaluate((el) =>
      Array.from(el.querySelectorAll("*")).some((n) => n.className.toString().includes("c4645a")),
    );
    expect(coLopPhu).toBe(true);
  });

  test("(b) ghi chú lưu xong dùng màu sage, không phải xanh neon", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLink}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    // Ghi chú chỉ lưu được cho ảnh ĐÃ CHỌN.
    await page.locator('button[aria-label="Chọn ảnh này"]').first().click();
    await page.getByRole("button", { name: "Xem ảnh 1", exact: true }).click();

    const oGhiChu = page.locator("#ghi-chu-anh-ben-phai");
    await oGhiChu.waitFor({ state: "visible", timeout: 10_000 });
    await oGhiChu.fill("Ghi chú thử BB-287");
    await oGhiChu.blur();

    const daLuu = page.getByText("Đã lưu ghi chú");
    await expect(daLuu).toBeVisible({ timeout: 10_000 });
    const mau = await daLuu.evaluate((el) => getComputedStyle(el).color);
    // sage (--bb-accent trong .giao-dien-khach) = rgb(127, 169, 155).
    expect(mau).toContain("127, 169, 155");
    expect(mau).not.toContain("34, 197, 94"); // #22C55E cũ
  });

  test("(a) thang chữ 6 bậc: mọi h2/h3 màn khách thuộc tập cỡ cho phép", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLink}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    // Thả tim để hiện khối "Trong gói của ba mẹ" (+ "Chọn ảnh bìa album" nếu
    // bb-dev có sản phẩm album đủ điều kiện) — các tiêu đề chính báo cáo
    // chấm mục #22 nêu tên (18/22/30 lẫn lộn).
    await page.locator('button[aria-label="Chọn ảnh này"]').first().click();
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await expect(page.getByText("Trong gói của ba mẹ")).toBeVisible({ timeout: 10_000 });
    if (albumProductId) {
      await expect(page.getByText("Chọn ảnh bìa album")).toBeVisible({ timeout: 10_000 });
    }

    const ketQua = await page
      .locator(".giao-dien-khach h2, .giao-dien-khach h3")
      .evaluateAll((els) =>
        els
          .filter((el) => (el.textContent ?? "").trim().length > 0)
          .map((el) => ({ chu: el.textContent?.trim().slice(0, 40), co: getComputedStyle(el).fontSize })),
      );

    expect(ketQua.length).toBeGreaterThan(0);
    for (const { chu, co } of ketQua) {
      expect(coHopLe(co), `"${chu}" cỡ ${co} không thuộc {40,32,28,20,15,13,11}px`).toBe(true);
    }
  });

  test("(e) chọn bìa album: không xoá cả trang thành 'Đang tải…', giữ vị trí cuộn", async ({
    page,
  }) => {
    test.skip(!albumProductId, "bb-dev hiện không có sản phẩm album nào đủ điều kiện bán.");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLink}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    // Cần vài tấm đã thả tim để có gợi ý bìa — chờ MÁY CHỦ xác nhận cả hai
    // (không chỉ chờ số đếm lạc quan trên màn) trước khi bấm chọn bìa, đúng
    // nhịp một người thật sẽ có (thả tim rồi mới cuộn xuống tìm khối bìa).
    const nutChon = page.locator('button[aria-label="Chọn ảnh này"]');
    const [resTim1] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/g/selection") && r.status() === 200),
      nutChon.nth(0).click(),
    ]);
    await resTim1.finished();
    const [resTim2] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/g/selection") && r.status() === 200),
      nutChon.nth(1).click(),
    ]);
    await resTim2.finished();

    await page.getByText("Chọn ảnh bìa album").scrollIntoViewIfNeeded();
    const cuonTruoc = await page.evaluate(() => window.scrollY);

    const nutBia = page.locator('button[aria-label^="Chọn ảnh bìa"]').first();
    await nutBia.waitFor({ state: "visible", timeout: 10_000 });
    await nutBia.click();

    // Ngay sau cú bấm, KHÔNG được thấy toàn trang chỉ còn "Đang tải…" — bản
    // vá dùng `loadGallery({ silent: true })`, spinner toàn trang không bao
    // giờ bật cho thao tác này. Kiểm ngay lập tức, không chờ debounce, vì
    // spinner cũ (nếu hoàn nguyên) xuất hiện ngay khi state đổi.
    await expect(page.getByText("Đang tải…", { exact: true })).toHaveCount(0);

    // Máy chủ ghi xong, tên tệp đang là bìa phải hiện ra — vẫn trên CÙNG một
    // trang (không remount), và vị trí cuộn không đổi.
    await expect(page.getByText(/Đang chọn: BB287_/)).toBeVisible({ timeout: 10_000 });
    const cuonSau = await page.evaluate(() => window.scrollY);
    expect(Math.abs(cuonSau - cuonTruoc)).toBeLessThan(30);

    // Lưới ảnh vẫn còn nguyên trong DOM suốt quá trình — bằng chứng trang
    // không bị thay bằng màn "Đang tải…" ở bất kỳ thời điểm nào.
    await expect(page.locator('img[src*="/api/img/"]').first()).toBeVisible();
  });
});
