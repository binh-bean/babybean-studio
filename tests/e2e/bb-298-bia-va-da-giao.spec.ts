/**
 * BB-298 — dựng đúng bản vẽ BB-297 (admin duyệt 28/09/2026) cho ba màn
 * khách: bìa (`bia-may-tinh-tap-chi.html`/`bia-dien-thoai.html`/
 * `bia-khong-ten-dien-thoai.html`), đã giao (`da-giao-*.html`), xem lớn máy
 * tính (`xem-lon-may-tinh.html`). Xem `babybean-assets/BB-297/XONG.md` mục
 * "Admin duyệt 28/09/2026" cho quyết định gốc.
 *
 * Canh những phần CHƯA có phép thử nào chạm tới (khác `bb-289`/`bb-295` đã
 * sửa lại cho khớp bản vẽ mới):
 *   1. Bìa máy tính: eyebrow "Bộ ảnh của", loại buổi chụp nghiêng dưới tên
 *      bé, 3 cột Ngày chụp/Chi nhánh/Trong gói, nút "Nhắn cho studio", dải
 *      "Vài khoảnh khắc trong bộ".
 *   2. Bìa điện thoại: dòng cuối "N ảnh | M tấm trong gói | Chọn trước dd/mm".
 *   3. Không có tên bé: câu dự phòng dùng loại buổi chụp (bậc 2).
 *   4. Đã giao: nút "Tải cả bộ" CHỈ hiện khi `options.download === true`;
 *      luôn có "Xem lại bộ ảnh"; thanh 5 bước (TheHanhTrinh) không còn hiện.
 *   5. Xem lớn máy tính: thẻ "Xem trên tường nhà mình" đổi sang thẻ SÁNG.
 *
 * Dữ liệu: chỉ "Fixture BB-298 …", xoá sạch ở afterAll (AGENTS.md §6). Ảnh có
 * `width`/`height` thật, cả ngang lẫn dọc — không phải fixture rỗng.
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = () => `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-298 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const THU_MUC_ANH = "test-results/bb-298";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

const DIEN_THOAI = { width: 390, height: 844 };
const DIEN_THOAI_SE = { width: 375, height: 667 };
const MAY_TINH = { width: 1440, height: 900 };

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
}

ownIpTest.describe("BB-298: bìa (bản vẽ BB-297), đã giao, xem lớn máy tính", () => {
  let pg: Client;
  let branchId = "";

  // Bộ A — có tên bé + loại buổi chụp, ĐANG CHỌN ảnh (status='ready'). Ảnh có
  // cả ngang lẫn dọc thật (width/height) — canh bìa "ben-canh" đầy đủ.
  let customerIdA = "";
  let babyIdA = "";
  let shootIdA = "";
  let galleryIdA = "";
  let maLinkA = "";

  // Bộ B — KHÔNG tên bé (baby_id null), CÓ loại buổi chụp — canh câu dự
  // phòng bậc 2.
  let customerIdB = "";
  let shootIdB = "";
  let galleryIdB = "";
  let maLinkB = "";

  // Bộ C — ĐÃ GIAO (delivered), download_enabled=true — canh nút Tải cả bộ +
  // dấu Đã hoàn thiện + ẩn thanh 5 bước.
  let customerIdC = "";
  let babyIdC = "";
  let shootIdC = "";
  let galleryIdC = "";
  let maLinkC = "";

  // Bộ D — ĐÃ GIAO nhưng download_enabled=false — canh KHÔNG có nút Tải cả
  // bộ trên bìa (không tự thêm nút cho khả năng không tồn tại).
  let customerIdD = "";
  let galleryIdD = "";
  let maLinkD = "";

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    await pg.query(`delete from galleries where title like 'Fixture BB-298%' and created_at < now() - interval '6 hours'`);
    await pg.query(`delete from customers where full_name like 'Fixture BB-298%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    async function taoAnh(galleryId: string, n: number) {
      // Xen kẽ ảnh ngang/dọc thật — đúng yêu cầu "cả ngang lẫn dọc" của đề bài.
      for (let i = 1; i <= n; i++) {
        const doc = i % 2 === 0;
        await pg.query(
          `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
           values ($1,$2,$3,'image/jpeg',$4,'active',$5,$6)`,
          [galleryId, `bb298-${runId}-${galleryId}-${i}`, `BB298_${String(i).padStart(3, "0")}.jpg`, i, doc ? 2000 : 3000, doc ? 3000 : 2000],
        );
      }
    }

    // ---------------------------------------------------------------------
    // Bộ A — tên bé + loại buổi chụp, đang chọn.
    // ---------------------------------------------------------------------
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Khách A`, soGia()],
      );
      customerIdA = kh[0].id;
      const { rows: baby } = await pg.query(
        `insert into babies (customer_id, full_name, nickname) values ($1,$2,$3) returning id`,
        [customerIdA, `${NHAN} Bé A`, "Bé Fixture 298A"],
      );
      babyIdA = baby[0].id;
      const { rows: shoot } = await pg.query(
        `insert into shoots (branch_id, customer_id, baby_id, shoot_date, concept) values ($1,$2,$3,'2026-09-12',$4) returning id`,
        [branchId, customerIdA, babyIdA, `${NHAN} Thôi nôi`],
      );
      shootIdA = shoot[0].id;
      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, baby_id, shoot_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, included_quota, extra_photo_price, due_at)
         values ($1,$2,$3,$4,$5,'ready',$6,'https://example.com/x',6,15,20000, now() + interval '10 days')
         returning id`,
        [branchId, customerIdA, babyIdA, shootIdA, NHAN + " A", `fixture-bb298a-${runId}`],
      );
      galleryIdA = g[0].id;
      await taoAnh(galleryIdA, 6);
      maLinkA = randomBytes(32).toString("base64url");
      await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
         values ($1,$2,$3,'owner',$4,'active')`,
        [galleryIdA, sha256(maLinkA), maLinkA.slice(0, 6), NHAN + " A"],
      );
    }

    // ---------------------------------------------------------------------
    // Bộ B — KHÔNG tên bé, CÓ loại buổi chụp.
    // ---------------------------------------------------------------------
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Khách B`, soGia()],
      );
      customerIdB = kh[0].id;
      const { rows: shoot } = await pg.query(
        `insert into shoots (branch_id, customer_id, shoot_date, concept) values ($1,$2,'2026-09-20',$3) returning id`,
        [branchId, customerIdB, `${NHAN} Newborn`],
      );
      shootIdB = shoot[0].id;
      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, baby_id, shoot_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, included_quota)
         values ($1,$2,null,$3,$4,'ready',$5,'https://example.com/x',3,10) returning id`,
        [branchId, customerIdB, shootIdB, NHAN + " B", `fixture-bb298b-${runId}`],
      );
      galleryIdB = g[0].id;
      await taoAnh(galleryIdB, 3);
      maLinkB = randomBytes(32).toString("base64url");
      await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
         values ($1,$2,$3,'owner',$4,'active')`,
        [galleryIdB, sha256(maLinkB), maLinkB.slice(0, 6), NHAN + " B"],
      );
    }

    // ---------------------------------------------------------------------
    // Bộ C — ĐÃ GIAO, download_enabled=true.
    // ---------------------------------------------------------------------
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Khách C`, soGia()],
      );
      customerIdC = kh[0].id;
      const { rows: baby } = await pg.query(
        `insert into babies (customer_id, full_name, nickname) values ($1,$2,$3) returning id`,
        [customerIdC, `${NHAN} Bé C`, "Bé Fixture 298C"],
      );
      babyIdC = baby[0].id;
      const { rows: shoot } = await pg.query(
        `insert into shoots (branch_id, customer_id, baby_id, shoot_date, concept) values ($1,$2,$3,'2026-08-01',$4) returning id`,
        [branchId, customerIdC, babyIdC, `${NHAN} Sinh nhật`],
      );
      shootIdC = shoot[0].id;
      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, baby_id, shoot_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, included_quota, download_enabled)
         values ($1,$2,$3,$4,$5,'delivered',$6,'https://example.com/x',4,10,true) returning id`,
        [branchId, customerIdC, babyIdC, shootIdC, NHAN + " C", `fixture-bb298c-${runId}`],
      );
      galleryIdC = g[0].id;
      await taoAnh(galleryIdC, 4);
      maLinkC = randomBytes(32).toString("base64url");
      await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
         values ($1,$2,$3,'owner',$4,'active')`,
        [galleryIdC, sha256(maLinkC), maLinkC.slice(0, 6), NHAN + " C"],
      );
    }

    // ---------------------------------------------------------------------
    // Bộ D — ĐÃ GIAO, download_enabled=false.
    // ---------------------------------------------------------------------
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Khách D`, soGia()],
      );
      customerIdD = kh[0].id;
      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, included_quota, download_enabled)
         values ($1,$2,$3,'delivered',$4,'https://example.com/x',2,10,false) returning id`,
        [branchId, customerIdD, NHAN + " D", `fixture-bb298d-${runId}`],
      );
      galleryIdD = g[0].id;
      await taoAnh(galleryIdD, 2);
      maLinkD = randomBytes(32).toString("base64url");
      await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
         values ($1,$2,$3,'owner',$4,'active')`,
        [galleryIdD, sha256(maLinkD), maLinkD.slice(0, 6), NHAN + " D"],
      );
    }
  });

  ownIpTest.afterAll(async () => {
    for (const galleryId of [galleryIdA, galleryIdB, galleryIdC, galleryIdD]) {
      if (!galleryId) continue;
      await pg.query("delete from selections where gallery_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from photos where gallery_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from galleries where id = $1", [galleryId]).catch(() => {});
    }
    for (const shootId of [shootIdA, shootIdB, shootIdC]) {
      if (shootId) await pg.query("delete from shoots where id = $1", [shootId]).catch(() => {});
    }
    for (const babyId of [babyIdA, babyIdC]) {
      if (babyId) await pg.query("delete from babies where id = $1", [babyId]).catch(() => {});
    }
    for (const customerId of [customerIdA, customerIdB, customerIdC, customerIdD]) {
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]).catch(() => {});
    }
    await pg.end();
  });

  // -------------------------------------------------------------------------
  // 1. Bìa máy tính — bản vẽ bia-may-tinh-tap-chi.html.
  // -------------------------------------------------------------------------
  ownIpTest("Bìa máy tính: eyebrow, tên bé, loại buổi chụp nghiêng, 3 cột thông tin, nút Nhắn cho studio", async ({
    page,
  }) => {
    await page.setViewportSize(MAY_TINH);
    await page.goto(`/g/${maLinkA}`);

    const bia = page.getByTestId("bia-bo-anh");
    await ownIpExpect(bia).toBeVisible();
    await doiAnhTai(page, page.getByTestId("bia-khoi-anh").locator("img").first());

    const khoiChu = page.getByTestId("bia-khoi-chu");
    await ownIpExpect(khoiChu.getByText("Bộ ảnh của", { exact: true })).toBeVisible();
    // API trả `babyName: nickname || full_name` — fixture đặt nickname
    // "Bé Fixture 298A", nên đó mới là chữ lên bìa (không phải full_name).
    await ownIpExpect(khoiChu.locator("h1")).toHaveText("Bé Fixture 298A");
    await ownIpExpect(khoiChu.getByText(`${NHAN} Thôi nôi`, { exact: true })).toBeVisible();

    // Bộ ba: Ngày chụp · Chi nhánh · Trong gói.
    await ownIpExpect(khoiChu.getByText("Ngày chụp")).toBeVisible();
    // "12/09/2026" xuất hiện ở CẢ hai khối (dòng phụ điện thoại `lg:hidden`
    // và bộ ba máy tính `hidden lg:flex`) — cùng tồn tại trong DOM, chỉ khác
    // CSS hiện/ẩn theo bề rộng (BiaBoAnh dùng MỘT `<h1>`/khối chữ chung, xem
    // ghi chú lớn trong `bia-bo-anh.tsx`). `.first()` để qua strict mode,
    // không phải dấu hiệu trùng lặp lỗi.
    await ownIpExpect(khoiChu.getByText("12/09/2026").last()).toBeVisible();
    await ownIpExpect(khoiChu.getByText("Trong gói", { exact: true }).last()).toBeVisible();
    // "15 tấm" cũng xuất hiện ở dòng cuối điện thoại (ẩn CSS ở lg, nhưng vẫn
    // trong DOM) — `.first()` qua strict mode, xem ghi chú ở dòng trên.
    await ownIpExpect(khoiChu.getByText("15 tấm", { exact: false }).first()).toBeVisible();

    await ownIpExpect(page.getByRole("button", { name: /Bắt đầu chọn ảnh/ })).toBeVisible();

    await page.screenshot({ path: tenAnh("bia-may-tinh", MAY_TINH), fullPage: false });
  });

  ownIpTest("Bìa máy tính: dải Vài khoảnh khắc trong bộ có 4 ảnh + Xem cả N ảnh", async ({ page }) => {
    await page.setViewportSize(MAY_TINH);
    await page.goto(`/g/${maLinkA}`);
    const khoiChu = page.getByTestId("bia-khoi-chu");
    await ownIpExpect(khoiChu.getByText("Vài khoảnh khắc trong bộ")).toBeVisible();
    await ownIpExpect(khoiChu.getByText(/Xem cả 6 ảnh/)).toBeVisible();
    const anhXemTruoc = khoiChu.getByLabel("Xem ảnh này trong lưới");
    await ownIpExpect(anhXemTruoc).toHaveCount(4);
  });

  // -------------------------------------------------------------------------
  // 2. Bìa điện thoại — dòng cuối N ảnh | M tấm trong gói | Chọn trước dd/mm.
  // -------------------------------------------------------------------------
  ownIpTest("Bìa điện thoại: dòng cuối N ảnh | M tấm trong gói | Chọn trước dd/mm", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLinkA}`);
    const bia = page.getByTestId("bia-bo-anh");
    await ownIpExpect(bia).toBeVisible();
    await doiAnhTai(page, page.getByTestId("bia-khoi-anh").locator("img").first());

    await ownIpExpect(bia.getByRole("button", { name: /Bắt đầu chọn ảnh/ })).toBeVisible();
    await ownIpExpect(bia.getByText("6 ảnh", { exact: true })).toBeVisible();
    await ownIpExpect(bia.getByText("15 tấm trong gói", { exact: true })).toBeVisible();
    await ownIpExpect(bia.getByText(/Chọn trước \d{2}\/\d{2}/)).toBeVisible();

    await page.screenshot({ path: tenAnh("bia-dien-thoai", DIEN_THOAI), fullPage: false });
  });

  // -------------------------------------------------------------------------
  // 2b. [BB-298 sửa theo giám đốc] Nút chính + dòng cuối phải nằm TRỌN trong
  //     màn hình đầu (không bị đẩy xuống dưới mép màn hình bởi thanh thương
  //     hiệu + chip "Lưu ra màn hình chính" đứng trên bìa) — cả 390×844 lẫn
  //     375×667 (iPhone SE, màn thấp nhất còn phổ biến).
  // -------------------------------------------------------------------------
  for (const [tenKichThuoc, kichThuoc] of [
    ["390x844", DIEN_THOAI],
    ["375x667 (iPhone SE)", DIEN_THOAI_SE],
  ] as const) {
    ownIpTest(`Bìa điện thoại ${tenKichThuoc}: nút Bắt đầu chọn ảnh nằm trọn trong màn hình đầu`, async ({
      page,
    }) => {
      await page.setViewportSize(kichThuoc);
      await page.goto(`/g/${maLinkA}`);
      const bia = page.getByTestId("bia-bo-anh");
      await ownIpExpect(bia).toBeVisible();
      await doiAnhTai(page, page.getByTestId("bia-khoi-anh").locator("img").first());

      const nut = bia.getByRole("button", { name: /Bắt đầu chọn ảnh/ });
      await ownIpExpect(nut).toBeVisible();
      const hop = await nut.boundingBox();
      if (!hop) throw new Error("Không đo được nút Bắt đầu chọn ảnh");

      await page.screenshot({ path: tenAnh("bia-dien-thoai-nut-trong-man", kichThuoc), fullPage: false });

      ownIpExpect(
        hop.y + hop.height,
        `Nút "Bắt đầu chọn ảnh" tràn xuống dưới mép màn hình ${kichThuoc.height}px (đáy nút ở ${hop.y + hop.height}px)`,
      ).toBeLessThanOrEqual(kichThuoc.height);
    });
  }

  // -------------------------------------------------------------------------
  // 3. Không có tên bé, CÓ loại buổi chụp — câu dự phòng bậc 2.
  // -------------------------------------------------------------------------
  ownIpTest("Không có tên bé: câu dự phòng dùng loại buổi chụp, không hiện tên khách", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLinkB}`);
    const bia = page.getByTestId("bia-bo-anh");
    await ownIpExpect(bia).toBeVisible();

    const khoiChu = page.getByTestId("bia-khoi-chu");
    await ownIpExpect(khoiChu.locator("h1")).toHaveText(`${NHAN} Newborn`);
    // Eyebrow bậc 2 là "Bộ ảnh" (không có "của").
    await ownIpExpect(khoiChu.getByText("Bộ ảnh", { exact: true })).toBeVisible();
    await ownIpExpect(khoiChu.getByText("của con", { exact: true })).toBeVisible();
    // Tên khách hàng (người lớn) không bao giờ lên bìa.
    await ownIpExpect(bia.getByText(`${NHAN} Khách B`)).toHaveCount(0);

    await page.screenshot({ path: tenAnh("bia-khong-ten-be", DIEN_THOAI), fullPage: false });
  });

  // -------------------------------------------------------------------------
  // 4. Đã giao — dấu Đã hoàn thiện, nút Tải cả bộ theo options.download,
  //    "Xem lại bộ ảnh" luôn có, thanh 5 bước không còn hiện.
  // -------------------------------------------------------------------------
  for (const [ten, khoBiet] of [
    ["điện thoại", DIEN_THOAI],
    ["máy tính", MAY_TINH],
  ] as const) {
    ownIpTest(`Đã giao (download bật): dấu Đã hoàn thiện, nút Tải cả bộ + Xem lại bộ ảnh, không còn thanh 5 bước (${ten})`, async ({
      page,
    }) => {
      await page.setViewportSize(khoBiet);
      await page.goto(`/g/${maLinkC}`);

      const bia = page.getByTestId("bia-bo-anh");
      await ownIpExpect(bia).toBeVisible();
      await ownIpExpect(page.getByTestId("dau-da-hoan-thien")).toContainText("Đã hoàn thiện");
      await ownIpExpect(page.getByTestId("nut-tai-ca-bo-bia")).toBeVisible();
      await ownIpExpect(bia.getByText("Xem lại bộ ảnh", { exact: true })).toBeVisible();
      await ownIpExpect(bia.getByText(`${NHAN} Sinh nhật`, { exact: false })).toBeVisible();
      await ownIpExpect(bia.getByText("4 ảnh đã chỉnh", { exact: false })).toBeVisible();

      // Thanh 5 bước (Đã chốt/Đang chỉnh/Duyệt ảnh/In-nhận ảnh/Đã giao) không
      // còn hiện khi đã giao — thay bằng dấu "Đã hoàn thiện" ở trên.
      await ownIpExpect(page.getByText("Đang chỉnh", { exact: true })).toHaveCount(0);
      await ownIpExpect(page.getByText("Duyệt ảnh", { exact: true })).toHaveCount(0);

      await page.screenshot({ path: tenAnh(`da-giao-${ten}`, khoBiet), fullPage: false });
    });
  }

  ownIpTest("Đã giao (download tắt): KHÔNG có nút Tải cả bộ trên bìa, vẫn có Xem lại bộ ảnh", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLinkD}`);
    const bia = page.getByTestId("bia-bo-anh");
    await ownIpExpect(bia).toBeVisible();
    await ownIpExpect(page.getByTestId("dau-da-hoan-thien")).toBeVisible();
    await ownIpExpect(page.getByTestId("nut-tai-ca-bo-bia")).toHaveCount(0);
    await ownIpExpect(bia.getByText("Xem lại bộ ảnh", { exact: true })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 5. Xem lớn máy tính — thẻ "Xem trên tường nhà mình" SÁNG (không còn mực đen).
  // -------------------------------------------------------------------------
  ownIpTest("Xem lớn máy tính: thẻ Xem trên tường nhà mình là thẻ SÁNG (nền trắng, chữ mực)", async ({ page }) => {
    await page.setViewportSize(MAY_TINH);
    await page.goto(`/g/${maLinkA}`);
    await page.evaluate(() => document.getElementById("dau-luoi-anh")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);

    const theAnh = page.getByTestId("the-anh").first();
    await theAnh.waitFor({ state: "visible" });
    await theAnh.locator("button").first().click();

    const hop = page.locator('div[role="dialog"][aria-modal="true"]');
    await ownIpExpect(hop).toBeVisible({ timeout: 10000 });

    const nutTuong = hop.getByRole("button", { name: /Xem trên tường nhà mình/ });
    // Sản phẩm treo tường có thể không nằm trong danh mục fixture (danh mục
    // là dữ liệu chung của bb-dev) — chỉ canh màu KHI nút thật sự có.
    if ((await nutTuong.count()) > 0) {
      const bg = await nutTuong.first().evaluate((el) => getComputedStyle(el).backgroundColor);
      // Thẻ sáng: nền trắng đặc (rgb(255, 255, 255)), không còn nền mực
      // #2E2A27 (rgb(46, 42, 39)) như bản đặc cũ.
      ownIpExpect
        .soft(bg, `Thẻ "Xem trên tường" phải nền trắng (thẻ sáng), đo được: ${bg}`)
        .toBe("rgb(255, 255, 255)");
    }

    await page.screenshot({ path: tenAnh("xem-lon-may-tinh", MAY_TINH), fullPage: false });
  });
});
