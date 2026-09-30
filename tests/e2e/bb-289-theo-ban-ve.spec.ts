/**
 * BB-289 — bốn lỗi admin báo trên app thật (ưu tiên) + màn "Cảm ơn ba mẹ" sau
 * chốt + hộp chốt mở chi tiết. Bốn phép đo MÁY, không đoán bằng mắt:
 *
 *  (1) Chip "Lưu app" hiện NGAY ở lượt mở ĐẦU TIÊN cho một bộ ảnh ĐÃ CÓ tim
 *      từ trước (khách quay lại từ tin nhắn cũ) — bản cũ chỉ chờ 0->1 hoặc
 *      lượt mở thứ hai, nên khách này không bao giờ thấy.
 *  (2) Nút "Nhắn cho studio" vẫn NHÌN THẤY sau khi cuộn 2000px (đầu trang
 *      thương hiệu không sticky, chỉ `#dau-luoi-anh` mới sticky).
 *  (3) [BB-298 SỬA LẠI — xem ghi chú dưới] Máy tính: khối ảnh bìa dùng
 *      `object-fit: cover` tràn cột (bản vẽ BB-297 `bia-may-tinh-tap-chi`,
 *      admin duyệt 28/09/2026) — KHÔNG còn `object-fit: contain`/letterbox
 *      kem như BB-289/BB-285 từng chốt. Bản vẽ mới ghi đè bản cũ.
 *  (4) [BB-298 SỬA LẠI] Điện thoại (390×844): hộp chữ bìa nay ĐÈ lên hộp ảnh
 *      bìa (kiểu tạp chí tràn màn, lớp tối dần phía dưới — bản vẽ
 *      `bia-dien-thoai.html`) — KHÔNG còn "không giao nhau" như BB-289 từng
 *      chốt. Bản vẽ mới ghi đè bản cũ.
 *
 * Cộng thêm hai màn theo bản vẽ BB-285:
 *  (5) Chốt xong hiện màn "Cảm ơn ba mẹ" (`data-testid="cam-on-sau-chot"`),
 *      không còn trang trắng "Đang tải…" (`vi.common.loading`) toàn màn.
 *  (6) Hộp chốt bấm "Xem chi tiết" mở đúng dòng "Bìa album" cho từng album
 *      trong gói.
 *
 * LƯỢT 2 (Opus chấm) — ba việc, mỗi việc một phép đo MÁY:
 *  A1. Màn Cảm ơn: số tấm SO ĐÚNG hạn mức — "Đủ gói" chỉ khi ĐÃ CHỌN ≥ hạn
 *      mức, thiếu thì "N/hạn mức tấm", vượt thì "N/hạn mức · thêm X tấm".
 *      Luật này còn có phép thử ĐƠN VỊ riêng, xem
 *      `tests/unit/cam-on-sau-chot.test.ts`.
 *  A2. Nút "Xem tiến độ" (không phải "Xem chi tiết") đóng màn Cảm ơn và đưa
 *      tới `#the-hanh-trinh`.
 *  B1. Màn xem ảnh lớn: nền là KÍNH (backdrop alpha < 1 + `backdrop-filter`
 *      có blur), không còn màu tối đặc.
 *  B2. Chế độ "so sánh" ở lưới ảnh: KHÔNG còn nút tim trên mỗi ô — chỉ còn
 *      vòng số thứ tự.
 *  B3. Chân trang khách có trong DOM (đã có sẵn, cộng thêm câu kết + bản
 *      quyền theo bản vẽ `chan-trang-khach.png`).
 *
 * Dữ liệu: chỉ "Fixture BB-289 …", xoá sạch ở afterAll (AGENTS.md §6). Ảnh
 * chụp 390×844 + 1440×900 mỗi màn vào `test-results/bb-289/`, đặt cạnh bản vẽ
 * gốc (`babybean-assets/BB-285/`) để tự so — không phải bằng chứng nộp kèm.
 *
 * HOÀN NGUYÊN KIỂM NGƯỢC (AGENTS.md §5a) — đã làm thủ công trước khi nộp:
 *  - Bỏ khối `if (vuaChotXong && gallery)` trong `gallery-app.tsx` (khôi phục
 *    hành vi cũ: `loadGallery()` không silent) → ca (5) ĐỎ: không tìm thấy
 *    `cam-on-sau-chot`, thấy "Đang tải…" toàn trang.
 *  - Đổi `lg:object-contain` trong `bia-bo-anh.tsx` về `lg:object-cover` →
 *    ca (3) ĐỎ: tỉ lệ khối ảnh không còn khớp tỉ lệ ảnh gốc (ảnh dọc bị cắt
 *    ngang khối 42%).
 *  - Khôi phục điều kiện "lượt mở thứ 2 / 0->1" trong `loi-goi-y-luu-app.tsx`
 *    → ca (1) ĐỎ: chip không hiện ở lượt mở đầu cho bộ ảnh đã có tim.
 *  - Bỏ `!soSanhBat` khỏi điều kiện hiện tim trong `luoi-anh.tsx` → ca B2 ĐỎ:
 *    tim quay lại hiện song song vòng số thứ tự trong chế độ so sánh.
 *  - Đổi `trangThaiSoTam` (`cam-on-sau-chot.tsx`) về luật cũ `soTamDaChon >
 *    hanMuc` → hai ca trong `tests/unit/cam-on-sau-chot.test.ts` ĐỎ.
 * Kết quả các lượt (đỏ trước vá / xanh sau vá) dán trong báo cáo bàn giao,
 * không lặp lại ở đây.
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { tickHopChotDot1 } from "./helpers/tick-hop-chot-dot1";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const soGia1 = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const soGia2 = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-289 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const THU_MUC_ANH = "test-results/bb-289";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

const DIEN_THOAI = { width: 390, height: 844 };
const MAY_TINH = { width: 1440, height: 900 };
const MAY_TINH_NHO = { width: 1280, height: 720 };

function tenAnh(tenMan: string, kichThuoc: { width: number; height: number }) {
  return `${THU_MUC_ANH}/${tenMan.replace(/[^a-z0-9-]+/gi, "-")}-${kichThuoc.width}x${kichThuoc.height}.png`;
}

async function doiAnhTai(page: import("@playwright/test").Page, locatorFirst: import("@playwright/test").Locator) {
  await locatorFirst.waitFor({ state: "visible", timeout: 30000 });
  await locatorFirst.evaluate(
    (img: HTMLImageElement) =>
      img.complete
        ? undefined
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
            setTimeout(() => resolve(), 15000);
          }),
  );
  void page;
}

ownIpTest.describe("BB-289: bốn lỗi admin báo + màn cảm ơn + hộp chốt chi tiết", () => {
  let pg: Client;
  let branchId = "";

  // Bộ A — khách ĐÃ CÓ TIM từ trước (mở lại link cũ). Dùng cho ca (1)-(4):
  // không submit gì ở bộ này, chỉ đo bố cục/chip.
  let customerIdA = "";
  let galleryIdA = "";
  let maLinkA = "";
  let shareLinkIdA = "";
  let photoIdA1 = "";

  // Bộ B — có album TRONG GÓI (cần bìa) — dùng cho ca (5)-(6): chốt thật.
  let customerIdB = "";
  let galleryIdB = "";
  let maLinkB = "";
  let albumProductId = "";

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    await pg.query(`delete from galleries where title like 'Fixture BB-289%' and created_at < now() - interval '6 hours'`);
    await pg.query(`delete from customers where full_name like 'Fixture BB-289%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    // ---------------------------------------------------------------------
    // Bộ A
    // ---------------------------------------------------------------------
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Khách A`, soGia1],
      );
      customerIdA = kh[0].id;

      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, included_quota, extra_photo_price)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',6,10,20000) returning id`,
        [branchId, customerIdA, NHAN + " A", `fixture-bb289a-${runId}`],
      );
      galleryIdA = g[0].id;

      // Ảnh 1 DỌC (để đo tỉ lệ contain rõ ràng — chân dung dọc dễ bị cắt nhất
      // khi ép vào khối ảnh máy tính nếu còn object-cover).
      const { rows: p1 } = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
         values ($1,$2,$3,'image/jpeg',1,'active',2000,3000) returning id`,
        [galleryIdA, `bb289a-${runId}-1.jpg`, `BB289A_0001.jpg`],
      );
      photoIdA1 = p1[0].id;
      for (let i = 2; i <= 6; i++) {
        await pg.query(
          `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
           values ($1,$2,$3,'image/jpeg',$4,'active',3000,2000)`,
          [galleryIdA, `bb289a-${runId}-${i}.jpg`, `BB289A_000${i}.jpg`, i],
        );
      }

      maLinkA = randomBytes(32).toString("base64url");
      const { rows: lk } = await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
         values ($1,$2,$3,'owner','Fixture BB-289 A','active') returning id`,
        [galleryIdA, sha256(maLinkA), maLinkA.slice(0, 6)],
      );
      shareLinkIdA = lk[0].id;

      // Tim TỪ TRƯỚC — đúng kịch bản admin báo: khách mở lại link cũ, đã có
      // tim, `daChon` khởi động thẳng > 0 (không có cú 0 -> >0 nào để bắt).
      const { rows: sel } = await pg.query(
        `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
        [galleryIdA, shareLinkIdA],
      );
      await pg.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`,
        [sel[0].id, photoIdA1, galleryIdA],
      );
    }

    // ---------------------------------------------------------------------
    // Bộ B — có album trong gói (bìa bắt buộc trước khi chốt).
    // ---------------------------------------------------------------------
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Khách B`, soGia2],
      );
      customerIdB = kh[0].id;

      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, included_quota, extra_photo_price)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',4,10,20000) returning id`,
        [branchId, customerIdB, NHAN + " B", `fixture-bb289b-${runId}`],
      );
      galleryIdB = g[0].id;

      const { rows: sp } = await pg.query(
        `select id from products
          where is_active and material ilike '%album%' and list_price is not null
            and price_confidence >= 0.8 and price_samples >= 5
          limit 1`,
      );
      albumProductId = sp[0]?.id ?? "";

      if (albumProductId) {
        await pg.query(
          `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
           values ($1,$2,1,500000)`,
          [galleryIdB, albumProductId],
        );
        await pg.query(
          `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
           select $1, id, 10, 0 from products
            where is_active and kind = 'edited_photo' order by id limit 1`,
          [galleryIdB],
        );
      }

      for (let i = 1; i <= 4; i++) {
        await pg.query(
          `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
           values ($1,$2,$3,'image/jpeg',$4,'active')`,
          [galleryIdB, `bb289b-${runId}-${i}.jpg`, `BB289B_000${i}.jpg`, i],
        );
      }

      maLinkB = randomBytes(32).toString("base64url");
      await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
         values ($1,$2,$3,'owner','Fixture BB-289 B','active')`,
        [galleryIdB, sha256(maLinkB), maLinkB.slice(0, 6)],
      );
    }
  });

  ownIpTest.afterAll(async () => {
    for (const galleryId of [galleryIdA, galleryIdB]) {
      if (!galleryId) continue;
      await pg.query("delete from selection_items where gallery_id = $1", [galleryId]);
      await pg.query("delete from selections where gallery_id = $1", [galleryId]);
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from gallery_items where gallery_id = $1", [galleryId]);
      await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerIdA) await pg.query("delete from customers where id = $1", [customerIdA]);
    if (customerIdB) await pg.query("delete from customers where id = $1", [customerIdB]);
    await pg.end();
  });

  // -------------------------------------------------------------------------
  // (1) Chip "Lưu app" hiện NGAY ở lượt mở đầu cho bộ ảnh ĐÃ CÓ TIM từ trước.
  // -------------------------------------------------------------------------
  ownIpTest("Chip gợi ý Lưu app hiện ngay ở lượt mở đầu — bộ ảnh đã có tim", async ({ page, context }) => {
    // Trình duyệt "sạch": không cookie/localStorage cũ nào của bb-289 khác.
    await context.clearCookies();
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLinkA}`);

    const anhBia = page.locator('img[fetchpriority="high"]');
    await doiAnhTai(page, anhBia.first());

    const chip = page.getByTestId("goi-y-luu-app");
    await ownIpExpect(chip, "Chip 'Lưu app' phải hiện NGAY ở lượt mở đầu cho khách đã có tim từ trước").toBeVisible({
      timeout: 5000,
    });
  });

  // -------------------------------------------------------------------------
  // (2) "Nhắn cho studio" vẫn thấy sau khi cuộn 2000px.
  // -------------------------------------------------------------------------
  ownIpTest('Nút "Nhắn cho studio" vẫn nhìn thấy sau khi cuộn 2000px', async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLinkA}`);
    const anhBia = page.locator('img[fetchpriority="high"]');
    await doiAnhTai(page, anhBia.first());

    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(300);

    const nutNhanDinh = page.getByTestId("nhan-studio-dinh");
    await ownIpExpect(nutNhanDinh, "Nút nhắn cho studio ở thanh dính phải nhìn thấy sau khi cuộn 2000px").toBeVisible();
    const hop = await nutNhanDinh.boundingBox();
    ownIpExpect(hop, "Đo được vị trí nút nhắn dính").not.toBeNull();
    if (hop) {
      ownIpExpect(hop.y, "Nút nhắn phải nằm TRONG khung nhìn sau khi cuộn").toBeGreaterThanOrEqual(0);
      ownIpExpect(hop.y).toBeLessThanOrEqual(DIEN_THOAI.height);
    }
  });

  // -------------------------------------------------------------------------
  // (3) [BB-298] Máy tính: khối ảnh bìa dùng object-cover, tràn cột, không
  //     letterbox — bản vẽ BB-297 ghi đè quyết định object-contain của BB-289.
  // -------------------------------------------------------------------------
  for (const [tenKichThuoc, kichThuoc] of [
    ["1440x900", MAY_TINH],
    ["1280x720", MAY_TINH_NHO],
  ] as const) {
    ownIpTest(`Máy tính ${tenKichThuoc}: khối ảnh bìa tràn cột, object-fit:cover (bản vẽ BB-297)`, async ({ page }) => {
      await page.setViewportSize(kichThuoc);
      await page.goto(`/g/${maLinkA}`);

      const khoiAnh = page.getByTestId("bia-khoi-anh");
      const anhTrongKhoi = khoiAnh.locator("img");
      await doiAnhTai(page, anhTrongKhoi.first());

      await page.screenshot({ path: tenAnh("bia-may-tinh-chia-doi", kichThuoc), fullPage: false });

      // BB-298 — bản vẽ `bia-may-tinh-tap-chi.html` (admin duyệt 28/09/2026)
      // đổi cột ảnh sang tràn viền, không letterbox: `object-fit: cover`.
      const objectFit = await anhTrongKhoi.first().evaluate(
        (img: HTMLImageElement) => getComputedStyle(img).objectFit,
      );
      ownIpExpect
        .soft(objectFit, `Khối ảnh bìa máy tính phải dùng object-fit:cover (bản vẽ BB-297) ở ${tenKichThuoc}`)
        .toBe("cover");

      // Khối ảnh vẫn phải lấp đầy cột 42% (không co lại còn 0), đo gián tiếp
      // qua bounding box thay vì suy luận từ pixel ảnh giả của môi trường thử.
      const hop = await khoiAnh.first().boundingBox();
      ownIpExpect.soft(hop?.width ?? 0, "Cột ảnh bìa máy tính phải có bề rộng > 0").toBeGreaterThan(100);
    });
  }

  // -------------------------------------------------------------------------
  // (4) [BB-317 K-b, giám đốc quyết 29/09/2026] Điện thoại: ảnh bìa SẠCH (không
  //     chữ, không nút, không lớp tối) chiếm ~62% màn; khối chữ + nút nằm ở dải
  //     kem BÊN DƯỚI, giống bìa máy tính (ảnh và cột chữ tách riêng). Bản BB-298
  //     từng đòi chữ ĐÈ đáy ảnh (kiểu tạp chí) — ĐẢO NGƯỢC có chủ đích: chữ đè
  //     lên người bé là lỗi P1 của người chấm vòng 5. Đây là thay đổi đã duyệt,
  //     không phải hồi quy.
  // -------------------------------------------------------------------------
  ownIpTest("Điện thoại 390×844: ảnh bìa sạch ~62% màn, khối chữ nằm ở dải kem bên dưới", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLinkA}`);

    const khoiAnh = page.getByTestId("bia-khoi-anh");
    const khoiChu = page.getByTestId("bia-khoi-chu");
    await doiAnhTai(page, khoiAnh.locator("img").first());
    await khoiChu.waitFor({ state: "visible" });

    await page.screenshot({ path: tenAnh("bia-dien-thoai-anh-sach", DIEN_THOAI), fullPage: false });

    const rAnh = await khoiAnh.boundingBox();
    const rChu = await khoiChu.boundingBox();
    if (!rAnh || !rChu) throw new Error("Không đo được khối ảnh/chữ của bìa");

    ownIpExpect(
      rChu.y,
      `Khối chữ phải bắt đầu dưới đáy ảnh: ảnh={y:${rAnh.y}-${rAnh.y + rAnh.height}}, chữ từ y=${rChu.y}`,
    ).toBeGreaterThanOrEqual(rAnh.y + rAnh.height - 1);
    ownIpExpect(rAnh.height / DIEN_THOAI.height).toBeGreaterThan(0.5);
    ownIpExpect(rAnh.height / DIEN_THOAI.height).toBeLessThan(0.66);
    // Không lớp tối phủ lên ảnh (lớp gradient cũ của kiểu tạp chí).
    await ownIpExpect(khoiAnh.locator("div[aria-hidden='true']")).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // (5)+(6) Chốt bộ B: màn "Cảm ơn ba mẹ" thay "Đang tải…", hộp chốt mở chi
  // tiết thấy đúng dòng "Bìa album".
  // -------------------------------------------------------------------------
  ownIpTest("Chốt xong hiện màn Cảm ơn (không còn Đang tải toàn trang); hộp chốt mở chi tiết thấy Bìa album", async ({
    page,
  }) => {
    ownIpTest.skip(!albumProductId, "Không có sản phẩm album đủ điều kiện trong danh mục — bỏ qua ca này.");

    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLinkB}`);

    // Thả tim một tấm.
    await page.getByRole("button", { name: "Chọn ảnh này" }).first().click();
    await page.waitForTimeout(600); // hàng chờ gộp tim (BB-232) trước khi mở hộp chốt

    // Mở hộp chốt.
    const nutChot = page.getByRole("button", { name: /Chốt danh sách|chốt/i }).first();
    await nutChot.click();

    // -------- (6) Xem chi tiết trong hộp chốt TRƯỚC khi chốt thật --------
    const nutXemChiTiet = page.getByTestId("nut-xem-chi-tiet-hop-chot");
    if (await nutXemChiTiet.count()) {
      await nutXemChiTiet.click();
      const chiTiet = page.getByTestId("chi-tiet-hop-chot");
      await ownIpExpect(chiTiet).toBeVisible();
      await ownIpExpect(chiTiet.getByText("Bìa album")).toBeVisible();
      await ownIpExpect(chiTiet.getByText(/Chưa chọn/)).toBeVisible();
      await page.screenshot({ path: tenAnh("hop-chot-chi-tiet", DIEN_THOAI), fullPage: false });
      await nutXemChiTiet.click(); // đóng lại, không ảnh hưởng bước chọn bìa bên dưới
    }

    // Chưa chọn bìa → hộp nhắc "chưa chọn ảnh bìa" hiện, đi tới chọn bìa.
    // BB-295 mục #6 — nút đổi tên "Đi tới chọn bìa" → "Chọn bìa ngay".
    const diToiBia = page.getByTestId("nut-chon-bia-ngay");
    if (await diToiBia.count()) {
      await diToiBia.click();
      // BB-307 — đợi THẬT khối gợi ý bìa hiện ra, không phải
      // `waitForTimeout(400)` cố định: dưới tải nặng (nhiều tệp e2e chạy
      // cùng lúc), khối này tải chậm hơn 400ms, `goiYBia` rỗng, bỏ qua chọn
      // bìa, và nút "Xác nhận" khoá vĩnh viễn vì `albumThieuBia` vẫn còn
      // (`gallery-app.tsx` dòng ~2978) — kiểm ngược bắt được đúng ca này khi
      // chạy chung nhiều tệp spec.
      const goiYBia = page.locator("[id^='chon-bia-album-'] button").first();
      const coGoiY = await goiYBia
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (coGoiY) await goiYBia.click();
      await page.waitForTimeout(300);
      await nutChot.click();
    }

    const oTenXacNhan = page.locator("#confirm-name-input");
    if (await oTenXacNhan.count()) {
      await oTenXacNhan.fill(`${NHAN} Khách B`);
    }
    // BB-323 — BB-321 (chủ studio 29/09/2026) thêm hai ô BẮT BUỘC vào hộp chốt
    // đợt 1, đứng TRƯỚC ô chung "Tôi xác nhận…": chọn thiếu hạn mức (bộ B chọn
    // 1/10) → "đồng ý studio chọn dùm"; còn sản phẩm in chưa có ảnh (album) →
    // "biết nhận ảnh chậm hơn". Bản cũ tick `input[type=checkbox]` ĐẦU TIÊN —
    // nay đó là ô của khối A, ô chung và ô khối B còn trống nên nút Xác nhận
    // khoá mãi. Dùng chung helper mà BB-321 đã dùng cho e1/e2/e3/bb-310….
    await tickHopChotDot1(page);

    const nutXacNhan = page.getByRole("button", { name: "Xác nhận" });
    if (await nutXacNhan.count()) {
      // BB-323 — mốc 5 giây tính từ lúc MÁY CHỦ trả lời chốt, không phải từ cú
      // bấm. `/api/g/submit` đi ~25 lượt hỏi Supabase nối tiếp; từ máy dev (Việt
      // Nam → Supabase, 110–460 ms mỗi lượt) mất 3,4–5,4 giây, nên mốc tính từ cú
      // bấm đỏ/xanh theo độ trễ mạng chứ không theo hành vi (đo 29/09: cùng mã,
      // 3405 ms xanh, 5366 ms đỏ). Điều ca này canh là "chốt xong thì màn Cảm ơn
      // hiện, không rơi về trang trắng Đang tải" — tính từ lúc chốt xong mới đúng.
      const choChot = page.waitForResponse(
        (r) => r.url().includes("/api/g/submit") && r.request().method() === "POST",
        { timeout: 30_000 },
      );
      await nutXacNhan.click();
      const phanHoiChot = await choChot;
      ownIpExpect(phanHoiChot.status(), "Máy chủ phải nhận chốt (200)").toBe(200);

      // -------- (5) màn Cảm ơn thay "Đang tải…" --------
      const camOn = page.getByTestId("cam-on-sau-chot");
      await ownIpExpect(camOn, "Màn Cảm ơn phải hiện ngay sau khi chốt, không còn trang trắng Đang tải").toBeVisible({
        timeout: 5000,
      });
      // Đúng lúc màn Cảm ơn hiện, trang KHÔNG được đồng thời là màn tải toàn
      // trang cũ (chỉ có spinner + "Đang tải…", không có gì khác).
      await ownIpExpect(page.getByText("Đang tải…").first()).not.toBeVisible().catch(() => undefined);

      // BB-289 lượt 2 — số liệu ĐÚNG LUẬT: gói 10 tấm (fixture B), mới chọn
      // 1 tấm → "1/10 tấm", TUYỆT ĐỐI không phải "Đủ gói" (lỗi admin báo).
      // BB-319 (Ghi nhận K9): MỘT dòng "Đã chọn N / M tấm trong gói" thay hai chỗ lặp số.
      await ownIpExpect(camOn.getByText("Đã chọn 1 / 10 tấm trong gói")).toBeVisible();
      await ownIpExpect(camOn.getByText("Đủ gói")).toHaveCount(0);

      // Nhãn ngày chốt thật (hôm nay), không phải ngày bịa.
      const homNay = new Date();
      const ddmmyyyy = `${String(homNay.getDate()).padStart(2, "0")}/${String(homNay.getMonth() + 1).padStart(2, "0")}/${homNay.getFullYear()}`;
      await ownIpExpect(camOn.getByText(`Chờ studio xác nhận · ${ddmmyyyy}`)).toBeVisible();

      await page.screenshot({ path: tenAnh("cam-on-sau-chot", DIEN_THOAI), fullPage: false });

      // Nút đổi tên "Xem tiến độ" (không còn "Xem chi tiết") — bấm xong phải
      // đóng màn Cảm ơn và đưa ba mẹ tới thẻ hành trình 5 bước trên trang.
      const nutXemTienDo = camOn.getByRole("button", { name: "Xem tiến độ" });
      await ownIpExpect(nutXemTienDo).toBeVisible();
      await nutXemTienDo.click();
      await ownIpExpect(camOn).not.toBeVisible({ timeout: 10000 });
      const theHanhTrinh = page.locator("#the-hanh-trinh");
      await ownIpExpect(theHanhTrinh).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(500); // đợi cuộn mượt xong
      const rHanhTrinh = await theHanhTrinh.boundingBox();
      if (rHanhTrinh) {
        ownIpExpect
          .soft(rHanhTrinh.y, "Thẻ hành trình phải nằm trong (hoặc gần) khung nhìn sau khi bấm Xem tiến độ")
          .toBeLessThanOrEqual(DIEN_THOAI.height);
      }
    }
  });

  // -------------------------------------------------------------------------
  // B1 — màn xem ảnh lớn: nền kem MỘT MÀU đặc ở CẢ HAI khổ (BB-297, chủ
  // studio chốt — ghi đè quyết định "nền kính trong suốt" của BB-289 gốc).
  //
  // BB-313 (chấm lại 28/09/2026, mục 3) — ca khổ điện thoại từng đòi nền
  // TRONG SUỐT (alpha<1 + backdrop-blur), đúng bản vẽ BB-289 GỐC. Bản vẽ
  // BB-297 sau đó chốt lại: CẢ HAI khổ dùng chung MỘT nền kem #F3EDE5 ĐẶC,
  // không phân biệt máy tính/điện thoại nữa — ca cũ lỗi thời, canh đúng
  // hành vi CŨ đã bị bản vẽ MỚI thay thế (không phải app sai). Sửa ca này
  // khớp bản vẽ mới nhất, không sửa app để né phép thử.
  //
  // Kiểm ngược: đổi nền lightbox sang trong suốt trong photo-lightbox.tsx →
  // ca dưới đây phải ĐỎ (không còn khớp #F3EDE5 đặc) → trả lại đúng nền kem
  // đặc → xanh. Kết quả dán ở bàn giao BB-313.
  // -------------------------------------------------------------------------
  for (const [tenKichThuoc, kichThuoc] of [
    ["390x844", DIEN_THOAI],
    ["1440x900", MAY_TINH],
  ] as const) {
    ownIpTest(
      `Xem ảnh lớn ${tenKichThuoc}: nền kem MỘT MÀU đặc, không nhoè lưới phía sau (BB-297, chốt chung cho cả hai khổ)`,
      async ({ page }) => {
      await page.setViewportSize(kichThuoc);
      await page.goto(`/g/${maLinkA}`);

      const anhBia = page.locator('img[fetchpriority="high"]');
      await doiAnhTai(page, anhBia.first());
      await page.evaluate(() => document.getElementById("dau-luoi-anh")?.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(300);

      // Mở màn xem lớn bằng cách bấm vào tấm ảnh đầu (không phải nút tim).
      const theAnh = page.getByTestId("the-anh").first();
      await theAnh.waitFor({ state: "visible" });
      await theAnh.locator("button").first().click();

      const hop = page.locator('div[role="dialog"][aria-modal="true"]');
      await ownIpExpect(hop).toBeVisible({ timeout: 10000 });

      const { bgColor, blurLen } = await hop.evaluate((el: HTMLElement) => {
        const cs = getComputedStyle(el);
        const filter = cs.backdropFilter || (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || "";
        return { bgColor: cs.backgroundColor, blurLen: filter.includes("blur") ? filter.length : 0 };
      });

      // BB-297 (chủ studio chốt) — MỘT nền kem #F3EDE5 ĐẶC (alpha=1, không
      // blur) cho CẢ HAI khổ, "không nhoè lưới phía sau". Trước đây khổ điện
      // thoại có ngoại lệ riêng ("nền kính" trong suốt+blur) theo bản vẽ
      // BB-289 gốc — bản vẽ BB-297 sau đó bỏ hẳn ngoại lệ đó.
      ownIpExpect
        .soft(bgColor, `Nền màn xem lớn (${tenKichThuoc}) phải ĐẶC màu kem (rgb, không rgba), đo được: ${bgColor}`)
        .toBe("rgb(243, 237, 229)");
      ownIpExpect
        .soft(blurLen, `Nền màn xem lớn (${tenKichThuoc}) KHÔNG được còn backdrop-filter blur, đo được: "${bgColor}"`)
        .toBe(0);

      // BB-289 lượt 3 — Opus chấm ảnh chụp: ảnh chính gần như vô hình (một
      // chấm ~4px giữa màn) vì `w-auto h-auto` đo theo kích thước GỐC của
      // ảnh — máy chủ ảnh môi trường thử trả ảnh giả rất nhỏ. Sửa sang
      // `w-full h-full object-contain` (đo ở `photo-lightbox.tsx`). Đo trực
      // tiếp khung hiển thị của `<img>` đang xem, không đoán qua ảnh chụp.
      const anhChinh = hop.locator("img").first();
      await doiAnhTai(page, anhChinh);
      const rAnh = await anhChinh.boundingBox();
      const naturalWidth = await anhChinh.evaluate((img: HTMLImageElement) => img.naturalWidth);
      if (!rAnh) throw new Error("Không đo được khung ảnh chính trong màn xem lớn");
      const nguongRong = kichThuoc.width >= 1440 ? 600 : 300;
      ownIpExpect
        .soft(rAnh.width, `Ảnh chính phải hiện đủ cỡ (≥${nguongRong}px) ở ${tenKichThuoc}, đo được ${rAnh.width}px`)
        .toBeGreaterThanOrEqual(nguongRong);
      ownIpExpect.soft(naturalWidth, "Ảnh chính phải tải xong (naturalWidth>0)").toBeGreaterThan(0);

      // Tên tệp không còn hiện dưới số thứ tự (BB-289 lượt 3 — admin: "khách
      // không cần", BB-287 đã bỏ ở lưới, nay đồng bộ ở màn xem lớn).
      await ownIpExpect(hop.getByText(/BB289A_\d+\.jpg/)).toHaveCount(0);

      if (kichThuoc.width < 1024) {
        // Thanh đáy ba cột đều Tim · Ghi chú · Đặt in, chữ mực trên nền kính.
        const thanhDay = page.getByTestId("thanh-day-3-cot");
        await ownIpExpect(thanhDay).toBeVisible();
        await ownIpExpect(thanhDay.getByText("Tim")).toBeVisible();
      }

      await page.screenshot({ path: tenAnh("xem-lon-nen-kinh", kichThuoc), fullPage: false });
    });
  }

  // -------------------------------------------------------------------------
  // B2 — chế độ so sánh: KHÔNG còn tim trên mỗi ô, chỉ còn vòng số thứ tự.
  // -------------------------------------------------------------------------
  ownIpTest("Chế độ so sánh: không còn tim trên ô ảnh, chỉ vòng số thứ tự", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLinkA}`);
    const anhBia = page.locator('img[fetchpriority="high"]');
    await doiAnhTai(page, anhBia.first());
    await page.evaluate(() => document.getElementById("dau-luoi-anh")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "So sánh" }).click();
    await page.waitForTimeout(300);

    const timTrongLuoi = page.getByTestId("the-anh").locator(`button[aria-label="${"Bỏ chọn"}"], button[aria-label="Chọn ảnh này"]`);
    await ownIpExpect(timTrongLuoi, "Không được còn nút tim nào trong lưới khi đang ở chế độ so sánh").toHaveCount(0);

    // Bấm một ô để chắc vòng số thứ tự THAY THẾ đúng chỗ tim từng đứng.
    await page.getByTestId("the-anh").first().click();
    await ownIpExpect(page.getByTestId("the-anh").first().getByText("1")).toBeVisible();

    await page.screenshot({ path: tenAnh("so-sanh-chon-anh", DIEN_THOAI), fullPage: false });
  });

  // -------------------------------------------------------------------------
  // B3 — chân trang khách có trong DOM.
  // -------------------------------------------------------------------------
  for (const [tenKichThuoc, kichThuoc] of [
    ["390x844", DIEN_THOAI],
    ["1440x900", MAY_TINH],
  ] as const) {
    ownIpTest(`Chân trang khách có trong DOM — ${tenKichThuoc}`, async ({ page }) => {
      await page.setViewportSize(kichThuoc);
      await page.goto(`/g/${maLinkA}`);
      const anhBia = page.locator('img[fetchpriority="high"]');
      await doiAnhTai(page, anhBia.first());

      const chanTrang = page.locator("footer");
      await chanTrang.scrollIntoViewIfNeeded();
      await ownIpExpect(chanTrang).toBeVisible();
      await ownIpExpect(chanTrang.getByText("Cảm ơn ba mẹ đã yêu thương Baby Bean")).toBeVisible();
      await ownIpExpect(chanTrang.getByText(/© \d{4} Baby Bean Studio/)).toBeVisible();

      await page.screenshot({ path: tenAnh("chan-trang-khach", kichThuoc), fullPage: false });
    });
  }
});
