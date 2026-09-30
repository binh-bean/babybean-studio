/**
 * BB-310 mục 3, 4, 5, 6, 7 — báo cáo chấm độc lập vòng 4 (`6-vong4-khach-kho-tinh.md`)
 * và chỉ đạo admin bổ sung 28/09/2026 cho mục 7.
 *
 *   Mục 3 — Đã giao: đúng MỘT nút "Tải cả bộ" (bỏ bản lặp ở `ReviewPanel`);
 *   bỏ thẻ thừa trước lưới ảnh; thanh đáy không còn "Còn N · Yêu cầu sửa
 *   lại"; không còn dòng "Chưa có tấm nào trong cuốn này".
 *
 *   Mục 4 — Xem lớn: điện thoại nền kem đặc (không lộ lưới/chữ phía sau);
 *   máy tính ảnh dọc không có bóng đổ tạo cảm giác "tấm trắng" quanh khung.
 *
 *   Mục 5 — Tấm trượt "Tấm này dùng cho…" và màn So sánh đổi sang tông sáng
 *   cùng hệ kem (không còn mảng gần đen lạc tông).
 *
 *   Mục 6 — Tên bé dùng hàm dùng chung (`tenGoiBe`), không bao giờ ra
 *   "Bé Bé …", áp cho bìa/đầu lưới.
 *
 *   Mục 7 (chỉ đạo 28/09/2026, THAY quyết định "Bé + chữ cuối" ban đầu) —
 *   bé KHÔNG có nickname thì bìa in NGUYÊN HỌ TÊN ĐẦY ĐỦ (không thêm "Bé ",
 *   không rút gọn), cỡ chữ co theo độ dài để KHÔNG tràn quá 2 dòng ở cả
 *   390px và 1440px — phép thử dùng tên 5 chữ dài nhất tìm được (bịa).
 *   Kiểm ngược (AGENTS.md §5a): `git stash` đúng phần `coChuTieuDeBia`/
 *   biến CSS cỡ chữ trong `bia-bo-anh.tsx` + `dinh-dang.ts` rồi chạy lại ca
 *   "họ tên đầy đủ dài — tiêu đề ≤ 2 dòng" — đỏ (tiêu đề tràn quá 2 dòng ở
 *   cỡ chữ cố định cũ). Kết quả dán ở bàn giao BB-310.
 *
 * Dữ liệu: chỉ "Fixture BB-310 …", xoá sạch ở afterAll.
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = () => `0906${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-310P1 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const THU_MUC_ANH = "test-results/bb-310";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });
const CHUP = "C:\\Users\\binh\\Downloads\\claude code\\babybean-assets\\BB-310\\chup";
fs.mkdirSync(CHUP, { recursive: true });

const DIEN_THOAI = { width: 390, height: 844 };
const MAY_TINH = { width: 1440, height: 900 };

async function taoAnh(pg: Client, galleryId: string, n: number) {
  for (let i = 1; i <= n; i++) {
    const doc = i % 2 === 1;
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
       values ($1,$2,$3,'image/jpeg',$4,'active',$5,$6)`,
      [galleryId, `bb310p1-${runId}-${i}`, `BB310P1_${String(i).padStart(3, "0")}.jpg`, i, doc ? 800 : 1200, doc ? 1200 : 800],
    );
  }
}

ownIpTest.describe("BB-310 mục 3: Đã giao — không còn thẻ/nút/thanh thừa", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let babyId = "";
  let galleryId = "";
  let maLink = "";

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(`delete from galleries where title like 'Fixture BB-310P1%' and created_at < now() - interval '6 hours'`);
    await pg.query(`delete from customers where full_name like 'Fixture BB-310P1%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách`, soGia()],
    );
    customerId = kh[0].id;
    // Mục 6 — nickname CHƯA có tiền tố "Bé" (đúng kiểu đa số nickname thật
    // ngắn) — `tenGoiBe` phải tự thêm, không bao giờ ra "Bé Bé …".
    const { rows: be } = await pg.query(
      `insert into babies (customer_id, full_name, nickname) values ($1,$2,$3) returning id`,
      [customerId, `${NHAN} Bé`, "Sushi"],
    );
    babyId = be[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, baby_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, download_enabled)
       values ($1,$2,$3,$4,'delivered',$5,'https://example.com/x',4,10,true) returning id`,
      [branchId, customerId, babyId, NHAN, `fixture-bb310p1-${runId}`],
    );
    galleryId = g[0].id;
    await taoAnh(pg, galleryId, 4);

    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
    );
  });

  ownIpTest.afterAll(async () => {
    if (galleryId) {
      await pg.query("delete from selections where gallery_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (babyId) await pg.query("delete from babies where id = $1", [babyId]).catch(() => {});
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    await pg.end();
  });

  for (const [ten, khoBiet] of [
    ["điện thoại", DIEN_THOAI],
    ["máy tính", MAY_TINH],
  ] as const) {
    ownIpTest(`${ten}: đúng MỘT "Tải cả bộ", không còn thanh đáy, không còn "Chưa có tấm nào"`, async ({ page }) => {
      await page.setViewportSize(khoBiet);
      await page.goto(`/g/${maLink}`);

      const bia = page.getByTestId("bia-bo-anh");
      await ownIpExpect(bia).toBeVisible();

      // Mục 6 — nickname "Sushi" (chưa có "Bé") phải lên bìa thành "Bé Sushi"
      // (tiêu đề h1 — chữ này còn lặp lại ở đoạn cảm ơn phía dưới, dùng
      // `.first()` để không vỡ strict mode).
      await ownIpExpect(bia.getByText("Bé Sushi", { exact: false }).first()).toBeVisible();

      // Mục 3a — đúng MỘT nút "Tải cả bộ" trên toàn trang.
      await ownIpExpect(page.getByRole("button", { name: /^Tải cả bộ/ })).toHaveCount(1);

      // Mục 3c — không còn thanh đáy "Yêu cầu sửa lại" khi đã giao.
      await ownIpExpect(page.getByText("Yêu cầu sửa lại")).toHaveCount(0);

      await page.locator("#dau-luoi-anh").scrollIntoViewIfNeeded();
      // BB-319: dòng phụ bìa đã giao không còn "N ảnh đã chỉnh" (số ảnh nằm trên nút Tải cả bộ) — đợi lưới ảnh.
      await page.getByTestId("the-anh").first().waitFor({ state: "visible" });

      // Mục 3d — không còn dòng "Chưa có tấm nào trong cuốn này" (đã giao
      // xong, không còn gì "chưa" cả).
      await ownIpExpect(page.getByText("Chưa có tấm nào trong cuốn này")).toHaveCount(0);

      await page.screenshot({ path: `${THU_MUC_ANH}/3-${ten}-da-giao.png`, fullPage: true });
      await page.screenshot({ path: `${CHUP}/3-${ten}-da-giao.png`, fullPage: true });
    });
  }
});

ownIpTest.describe("BB-310 mục 4/5: Xem lớn và So sánh dùng tông sáng cùng hệ kem", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(`delete from galleries where title like 'Fixture BB-310P1%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách 2`, soGia()],
    );
    customerId = kh[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',6,10) returning id`,
      [branchId, customerId, NHAN + " 2", `fixture-bb310p1b-${runId}`],
    );
    galleryId = g[0].id;
    await taoAnh(pg, galleryId, 6);

    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN + " 2"],
    );
  });

  ownIpTest.afterAll(async () => {
    if (galleryId) {
      await pg.query("delete from selections where gallery_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    await pg.end();
  });

  ownIpTest("điện thoại: xem lớn nền kem đặc #F3EDE5, không còn nền trong mờ", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLink}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: 20_000 });
    await page.getByRole("button", { name: /Xem ảnh \d/ }).first().click();

    const hop = page.locator('div[role="dialog"][aria-modal="true"]').first();
    await ownIpExpect(hop).toBeVisible();
    const bg = await hop.evaluate((el) => getComputedStyle(el).backgroundColor);
    // #F3EDE5 = rgb(243, 237, 229), ĐẶC (alpha 1) — không còn
    // rgba(253,251,249,0.66) trong mờ như bản cũ.
    ownIpExpect.soft(bg, `Nền xem lớn điện thoại phải kem đặc #F3EDE5, đo được: ${bg}`).toBe("rgb(243, 237, 229)");

    await page.screenshot({ path: `${THU_MUC_ANH}/4-dt-xem-lon-nen-kem.png` });
    await page.screenshot({ path: `${CHUP}/4-dt-xem-lon-nen-kem.png` });
  });

  ownIpTest("điện thoại: tấm trượt 'Tấm này dùng cho…' tông sáng, không còn gần đen", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLink}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: 20_000 });
    await page.getByRole("button", { name: /Xem ảnh \d/ }).first().click();
    await page.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" }).click();

    const tam = page.getByTestId("tam-truot-dung-cho");
    await ownIpExpect(tam).toBeVisible();
    const bg = await tam.evaluate((el) => getComputedStyle(el).backgroundColor);
    // #fdfbf9 = rgb(253, 251, 249) — không còn #231e1a (rgb(35, 30, 26)).
    ownIpExpect.soft(bg, `Tấm trượt 'dùng cho' phải nền kem #fdfbf9, đo được: ${bg}`).toBe("rgb(253, 251, 249)");

    await page.screenshot({ path: `${THU_MUC_ANH}/5-dt-tam-truot-sang.png` });
    await page.screenshot({ path: `${CHUP}/5-dt-tam-truot-sang.png` });
  });

  ownIpTest("máy tính: ảnh dọc xem lớn không có bóng đổ tạo tấm trắng quanh khung", async ({ page }) => {
    await page.setViewportSize(MAY_TINH);
    await page.goto(`/g/${maLink}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: 20_000 });
    // Tấm đầu tiên (i=1, lẻ) là ảnh DỌC theo fixture ở trên.
    await page.getByRole("button", { name: "Xem ảnh 1" }).click();

    const anhLon = page.locator('main img[src*="/api/img/"]').first();
    await ownIpExpect(anhLon).toBeVisible();
    const bongDo = await anhLon.evaluate((el) => getComputedStyle(el).boxShadow);
    ownIpExpect.soft(bongDo, `Ảnh xem lớn máy tính vẫn còn bóng đổ (tạo cảm giác 'tấm trắng'): ${bongDo}`).toBe("none");

    await page.screenshot({ path: `${THU_MUC_ANH}/4b-mt-anh-doc-khong-bong-do.png` });
    await page.screenshot({ path: `${CHUP}/4b-mt-anh-doc-khong-bong-do.png` });
  });

  for (const [ten, khoBiet] of [
    ["điện thoại", DIEN_THOAI],
    ["máy tính", MAY_TINH],
  ] as const) {
    ownIpTest(`${ten}: màn So sánh nền kem sáng, không còn gần đen`, async ({ page }) => {
      await page.setViewportSize(khoBiet);
      await page.goto(`/g/${maLink}`);
      const anhDau = page.locator('img[src*="/api/img/"]').first();
      await anhDau.waitFor({ state: "visible", timeout: 20_000 });

      // Bật chế độ so sánh, chọn 2 tấm.
      await page.getByRole("button", { name: "So sánh", exact: true }).click();
      const theAnh = page.getByTestId("the-anh");
      await theAnh.nth(0).click();
      await theAnh.nth(1).click();
      await page.getByRole("button", { name: /Xem$/ }).click();

      const hop = page.getByRole("dialog", { name: "So sánh nhiều tấm" });
      await ownIpExpect(hop).toBeVisible();
      const bg = await hop.evaluate((el) => getComputedStyle(el).backgroundColor);
      ownIpExpect.soft(bg, `Màn So sánh phải nền kem #F3EDE5, đo được: ${bg}`).toBe("rgb(243, 237, 229)");

      await page.screenshot({ path: `${THU_MUC_ANH}/5b-${ten}-so-sanh-sang.png` });
      await page.screenshot({ path: `${CHUP}/5b-${ten}-so-sanh-sang.png` });
    });
  }
});

ownIpTest.describe("BB-310 mục 7: bìa — bé không nickname in NGUYÊN họ tên đầy đủ, không tràn quá 2 dòng", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let babyId = "";
  let galleryId = "";
  let maLink = "";

  // Tên bịa 5 chữ dài nhất tìm được (không phải tên khách thật — AGENTS.md
  // §6) — mục tiêu là ĐỘ DÀI thật, không phải tên có nghĩa.
  const HO_TEN_DAY_DU = "Nguyễn Thị Minh Ngọc Khánh Hân";

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(`delete from galleries where title like 'Fixture BB-310P1%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách 3`, soGia()],
    );
    customerId = kh[0].id;
    // CHỈ họ tên đầy đủ, KHÔNG nickname.
    const { rows: be } = await pg.query(
      `insert into babies (customer_id, full_name) values ($1,$2) returning id`,
      [customerId, HO_TEN_DAY_DU],
    );
    babyId = be[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, baby_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,$3,$4,'ready',$5,'https://example.com/x',3,10) returning id`,
      [branchId, customerId, babyId, NHAN + " 3", `fixture-bb310p1c-${runId}`],
    );
    galleryId = g[0].id;
    await taoAnh(pg, galleryId, 3);

    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN + " 3"],
    );
  });

  ownIpTest.afterAll(async () => {
    if (galleryId) {
      await pg.query("delete from selections where gallery_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (babyId) await pg.query("delete from babies where id = $1", [babyId]).catch(() => {});
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    await pg.end();
  });

  for (const [ten, khoBiet] of [
    ["điện thoại 390×844", DIEN_THOAI],
    ["máy tính 1440×900", MAY_TINH],
  ] as const) {
    ownIpTest(`${ten}: tiêu đề bìa in nguyên họ tên đầy đủ, KHÔNG tràn quá 2 dòng`, async ({ page }) => {
      await page.setViewportSize(khoBiet);
      await page.goto(`/g/${maLink}`);
      const bia = page.getByTestId("bia-bo-anh");
      await ownIpExpect(bia).toBeVisible();

      const h1 = bia.locator("h1");
      // Không thêm "Bé " trước họ tên đầy đủ (chỉ đạo 28/09/2026) — in
      // NGUYÊN VĂN, không rút gọn.
      await ownIpExpect(h1).toHaveText(HO_TEN_DAY_DU);

      const soDong = await h1.evaluate((el) => {
        const cs = getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight);
        const h = el.getBoundingClientRect().height;
        return Math.round(h / lh);
      });
      ownIpExpect
        .soft(soDong, `Tiêu đề bìa tràn quá 2 dòng ở ${ten} với họ tên "${HO_TEN_DAY_DU}" (${HO_TEN_DAY_DU.length} ký tự)`)
        .toBeLessThanOrEqual(2);

      await page.screenshot({ path: `${THU_MUC_ANH}/7-${khoBiet.width}x${khoBiet.height}-ho-ten-day-du.png` });
      await page.screenshot({ path: `${CHUP}/7-${khoBiet.width}x${khoBiet.height}-ho-ten-day-du.png` });
    });
  }
});
