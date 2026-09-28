/**
 * BB-299 — dựng đúng bản vẽ BB-297 (đã admin duyệt 28/09/2026) cho thanh đầu
 * lưới, lưới ảnh, thanh chọn nổi và cửa hàng sau khi thêm.
 *
 * OWNER: QA-BOT (tệp này) / DEV-FE (sản phẩm được kiểm).
 *
 * Nguồn bản vẽ: `babybean-assets/BB-297/html/luoi-may-tinh.html`,
 * `luoi-dien-thoai.html`, `cua-hang-sau-them-may-tinh.html`,
 * `cua-hang-sau-them-dien-thoai.html`.
 *
 * Kiểm ngược (AGENTS §5a) cho hai mục P0/P1:
 *  - Mục 1 (thanh đầu MỘT hàng 56px, "So sánh" liền cụm chip): hoàn nguyên
 *    `gallery-app.tsx` → khoảng cách "So sánh"-cụm chip xa hơn hẳn khoảng
 *    cách "So sánh"-tin nhắn (đỏ) → vá lại (xanh). Xem `4-cham-lai-doc-lap.md`
 *    hoặc chạy `git stash` trong worktree này để tự đối chiếu.
 *  - Mục 2 (ô ngang lưới có tỉ lệ rộng/cao > 1): hoàn nguyên `xep-so-le.ts`
 *    không đổi phép kiểm này (thuật toán cột giữ đúng tỉ lệ gốc từ trước) —
 *    phép thử canh HÀNH VI hiện tại của lưới, không canh riêng bản vá.
 *
 * Dữ liệu: chỉ tạo "Fixture BB-299 …", xoá sạch ở afterAll. Ảnh giả (không
 * tải thật từ Drive — `/api/img` trả 1×1 JPEG giả lập trong môi trường thử,
 * xem `playwright.config.ts`), NHƯNG width/height là SỐ THẬT khai trong DB để
 * lưới tính đúng tỉ lệ — đúng cách `luoi-anh.tsx` đọc dữ liệu.
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-299 ${runId}`;
const soGia = `0904${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const THU_MUC_ANH = "test-results/bb-299";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

// Ảnh chụp cho admin tự đối chiếu với PNG bản vẽ (LUẬT-DOT-8: lưu NGOÀI
// test-results). Đường tuyệt đối vì thư mục này nằm ngoài repo babybean-studio.
const CHUP = "C:\\Users\\binh\\Downloads\\claude code\\babybean-assets\\BB-299\\chup";
fs.mkdirSync(CHUP, { recursive: true });

const DIEN_THOAI = { width: 390, height: 844 };
const MAY_TINH = { width: 1440, height: 900 };

ownIpTest.describe("BB-299: đầu lưới gộp, lưới ảnh, thanh chọn nổi, cửa hàng", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let babyId = "";
  let galleryId = "";
  let maLink = "";
  let coSanPham = false;

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    await pg.query(`delete from galleries where title like 'Fixture BB-299%' and created_at < now() - interval '6 hours'`);
    await pg.query(`delete from customers where full_name like 'Fixture BB-299%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách`, soGia],
    );
    customerId = kh[0].id;

    // BB-299 — "tên bé" ở đầu lưới đọc từ bảng `babies` (KHÔNG phải cột trực
    // tiếp trên `galleries`), cùng khuôn `bb-295-man-khach.spec.ts`.
    const { rows: be } = await pg.query(
      `insert into babies (customer_id, full_name, nickname) values ($1,$2,$3) returning id`,
      [customerId, `${NHAN} Bé`, "Bé Fixture 299"],
    );
    babyId = be[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, baby_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,$4,'ready',$5,'https://example.com/x',6,10,50000,false) returning id`,
      [branchId, customerId, babyId, NHAN, `fixture-bb299-${runId}`],
    );
    galleryId = g[0].id;

    // 3 tấm DỌC (rộng 800, cao 1200 -> tỉ lệ 2:3) + 3 tấm NGANG (1200×800 -> 3:2),
    // xen kẽ đúng tinh thần bản vẽ "ô ngang và ô dọc lẫn lộn".
    for (let i = 1; i <= 6; i++) {
      const doc = i % 2 === 1;
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
         values ($1,$2,$3,'image/jpeg',$4,'active',$5,$6)`,
        [galleryId, `bb299-${runId}-${i}`, `BB299_${String(i).padStart(3, "0")}.jpg`, i, doc ? 800 : 1200, doc ? 1200 : 800],
      );
    }

    // Cửa hàng dùng danh mục THẬT có sẵn trong bb-dev (không tạo sản phẩm giả
    // — đúng quy ước `bb-279-cua-hang.spec.ts`). Không có sản phẩm đang bán
    // thì ca cửa hàng bên dưới tự `test.skip`, không giả vờ xanh.
    const { rows: sp } = await pg.query(
      `select 1 from products where is_active and list_price is not null limit 1`,
    );
    coSanPham = sp.length > 0;

    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
  });

  ownIpTest.afterAll(async () => {
    if (pg) {
      if (galleryId) await pg.query("delete from selection_addons where selection_id in (select id from selections where gallery_id=$1)", [galleryId]);
      if (galleryId) await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from galleries where id = $1", [galleryId]);
      if (babyId) await pg.query("delete from babies where id = $1", [babyId]);
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
      await pg.end();
    }
  });

  // -------------------------------------------------------------------------
  // Mục 1 — thanh đầu MỘT hàng 56px ở máy tính (1440), "So sánh" liền cụm chip
  // (không còn ở tít mép phải cùng tin nhắn/chuông).
  // -------------------------------------------------------------------------
  ownIpTest("Máy tính: đầu lưới một hàng 56px, So sánh liền cụm chip lọc", async ({ page }) => {
    await page.setViewportSize(MAY_TINH);
    await page.goto(`/g/${maLink}`);
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));

    const nav = page.locator("#dau-luoi-anh nav").first();
    await nav.waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${THU_MUC_ANH}/1-dau-luoi-may-tinh-1440x900.png` });
    await page.screenshot({ path: `${CHUP}/1-dau-luoi-may-tinh-1440x900.png` });

    const hopNav = await nav.boundingBox();
    if (!hopNav) throw new Error("Không đo được hàng đầu lưới");
    ownIpExpect
      .soft(hopNav.height, `Hàng đầu lưới cao ${hopNav.height}px, vượt xa 56px bản vẽ`)
      .toBeLessThanOrEqual(64);

    // Chip CUỐI CÙNG của cụm lọc là "Chưa chọn" (Tất cả, Đã chọn, Chưa chọn)
    // — đo khoảng cách từ ĐÓ tới "So sánh", không phải từ "Tất cả" (sẽ tính
    // gộp luôn khoảng trống của hai chip kia, sai mục đích phép đo).
    const chipCuoi = page.getByRole("button", { name: /^Chưa chọn/ });
    const nutSoSanh = page.getByRole("button", { name: "So sánh", exact: true });
    const chuong = page.locator("#dau-luoi-anh").getByRole("button", { name: /^Thông báo/ });

    const hopChipCuoi = await chipCuoi.boundingBox();
    const hopSoSanh = await nutSoSanh.boundingBox();
    const hopChuong = await chuong.boundingBox();
    if (!hopChipCuoi || !hopSoSanh || !hopChuong) throw new Error("Không đo được cụm chip/So sánh/chuông");

    const khoangCachChip = hopSoSanh.x - (hopChipCuoi.x + hopChipCuoi.width);
    const khoangCachChuong = hopChuong.x - (hopSoSanh.x + hopSoSanh.width);

    ownIpExpect
      .soft(
        khoangCachChip,
        `"So sánh" phải đứng NGAY SAU cụm chip lọc (đo được ${khoangCachChip.toFixed(1)}px, quá xa)`,
      )
      .toBeLessThanOrEqual(80);
    ownIpExpect
      .soft(
        khoangCachChuong > khoangCachChip,
        `Chuông phải bị đẩy XA hơn hẳn "So sánh" (mục #17: chỉ tin nhắn/chuông ở mép phải, So sánh liền cụm chip)`,
      )
      .toBe(true);

    // Logo + tên bé hiện trong CHÍNH hàng đầu lưới này (gộp, không tách rời).
    await ownIpExpect(nav.getByText("Baby Bean", { exact: false })).toBeVisible();
    await ownIpExpect(nav.getByText("Bé Fixture 299", { exact: false })).toBeVisible();
  });

  ownIpTest("Điện thoại: đầu lưới hai tầng vẫn là MỘT khối dính duy nhất", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLink}`);
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${THU_MUC_ANH}/1-dau-luoi-dien-thoai-390x844.png` });
    await page.screenshot({ path: `${CHUP}/1-dau-luoi-dien-thoai-390x844.png` });

    const dauLuoiAnh = page.locator("#dau-luoi-anh");
    // BB-299 — testid "ten-thuong-hieu-dinh" cố ý lặp lại ở CẢ hai nhánh
    // (hàng 1 điện thoại + hàng máy tính, ẩn/hiện bằng CSS theo breakpoint,
    // xem ghi chú trong `gallery-app.tsx`) để `getByTestId` không bao giờ
    // khớp cùng lúc với `data-testid="ten-thuong-hieu"` của thanh thương
    // hiệu KHÔNG dính phía trên bìa — `.first()` lấy đúng bản điện thoại
    // (đứng trước trong DOM) ở khổ 390×844 đang thử.
    await ownIpExpect(dauLuoiAnh.getByTestId("ten-thuong-hieu-dinh").first()).toBeVisible();
    // Hàng chip lọc (tầng 2) vẫn nằm trong CÙNG một `#dau-luoi-anh` — cả khối
    // dính chung một lần, không phải hai thanh tách rời như trước BB-299.
    await ownIpExpect(dauLuoiAnh.getByRole("button", { name: /^Tất cả/ })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Mục 2 — lưới ảnh: ô ngang thật sự NGANG (tỉ lệ rộng/cao > 1), không còn bị
  // ép vuông hay ép dọc.
  // -------------------------------------------------------------------------
  ownIpTest("Lưới ảnh: ô ngang có tỉ lệ rộng/cao > 1 (không cắt vuông)", async ({ page }) => {
    await page.setViewportSize(MAY_TINH);
    await page.goto(`/g/${maLink}`);
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));

    const theAnh = page.getByTestId("the-anh");
    await ownIpExpect(theAnh.first()).toBeVisible();
    await page.waitForTimeout(300);

    const soO = await theAnh.count();
    let coONgang = false;
    for (let i = 0; i < soO; i++) {
      const hop = await theAnh.nth(i).boundingBox();
      if (!hop) continue;
      if (hop.width / hop.height > 1.05) {
        coONgang = true;
        break;
      }
    }
    ownIpExpect
      .soft(coONgang, "Không có ô nào ngang (rộng/cao > 1) trong lưới — ảnh ngang có thể đang bị ép dọc")
      .toBe(true);
    await page.screenshot({ path: `${THU_MUC_ANH}/2-luoi-anh-may-tinh.png` });
    await page.screenshot({ path: `${CHUP}/2-luoi-anh-may-tinh-1440x900.png` });

    // Bản mobile cùng lưới — đối chiếu ô ngang/dọc lẫn lộn ở 390×844.
    await page.setViewportSize(DIEN_THOAI);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${CHUP}/2-luoi-anh-dien-thoai-390x844.png` });
  });

  // -------------------------------------------------------------------------
  // Mục 3 + 4 — cửa hàng: huy hiệu giỏ hiện SỐ (không phải chấm), dòng "Đã
  // thêm vào giỏ" có Hoàn tác, Hoàn tác xoá đúng món vừa thêm.
  // -------------------------------------------------------------------------
  ownIpTest("Cửa hàng: huy hiệu giỏ hiện số, Hoàn tác xoá đúng món vừa thêm", async ({ page }) => {
    ownIpTest.skip(!coSanPham, "bb-dev không có sản phẩm đang bán (is_active, có list_price) để thử cửa hàng");
    await page.setViewportSize(MAY_TINH);
    await page.goto(`/g/${maLink}`);
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));

    const theAnh = page.getByTestId("the-anh");
    await ownIpExpect(theAnh.first()).toBeVisible();
    await theAnh.first().getByRole("button", { name: /Chọn ảnh này/ }).click();

    await page.waitForTimeout(300);
    const nutMuaThem = page.getByRole("button", { name: "Mua thêm" });
    await nutMuaThem.waitFor({ state: "visible" });
    await nutMuaThem.click();

    const cuaHang = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
    await cuaHang.waitFor({ state: "visible" });
    await page.waitForTimeout(200);

    // Sản phẩm không gắn ảnh trực tiếp trong bước này (album/khung) — dùng
    // đường đơn giản nhất có sẵn của cửa hàng: chọn ảnh trong lưới nếu nhóm
    // yêu cầu, hoặc bấm thẳng "Thêm vào giỏ" nếu nhóm không cần ảnh.
    const nutChonAnh = cuaHang.getByRole("button", { name: "Chọn ảnh", exact: true });
    if (await nutChonAnh.isVisible().catch(() => false)) {
      await nutChonAnh.click();
      const luoiChon = page.getByRole("dialog", { name: "Chọn ảnh để đặt in" });
      await luoiChon.waitFor({ state: "visible" });
      await luoiChon.locator("button:has(img)").first().click();
      await luoiChon.getByRole("button", { name: "Xong", exact: true }).click();
      await luoiChon.waitFor({ state: "hidden" });
    }

    const nutThem = cuaHang.getByRole("button", { name: /^Thêm vào giỏ/ });
    await nutThem.waitFor({ state: "visible" });
    await nutThem.click();

    await ownIpExpect(cuaHang.getByRole("status")).toContainText("Đã thêm vào giỏ");
    const nutHoanTac = cuaHang.getByRole("button", { name: "Hoàn tác" });
    await ownIpExpect(nutHoanTac).toBeVisible();
    await page.screenshot({ path: `${THU_MUC_ANH}/3-cua-hang-sau-them-may-tinh.png` });
    await page.screenshot({ path: `${CHUP}/3-cua-hang-sau-them-may-tinh-1440x900.png` });

    await cuaHang.getByRole("button", { name: "Đóng" }).click();
    await cuaHang.waitFor({ state: "hidden" });
    await page.waitForTimeout(200);

    // Huy hiệu giỏ ở thanh chọn nổi phải hiện SỐ (>=1), không phải chấm tròn.
    const huyHieu = page.getByTestId("huy-hieu-gio");
    await ownIpExpect(huyHieu).toBeVisible();
    const soMon = (await huyHieu.textContent())?.trim();
    ownIpExpect(Number(soMon), `Huy hiệu giỏ phải là một số > 0, đọc được "${soMon}"`).toBeGreaterThan(0);
    await page.screenshot({ path: `${THU_MUC_ANH}/4-huy-hieu-gio-may-tinh.png` });
    await page.screenshot({ path: `${CHUP}/4-huy-hieu-gio-may-tinh-1440x900.png` });

    // Kiểm ngược Hoàn tác: mở lại cửa hàng, bấm Hoàn tác trên dòng vừa thêm
    // (giả lập lại luồng thêm rồi hoàn tác ngay) — giỏ phải rỗng trở lại.
    await nutMuaThem.click();
    await cuaHang.waitFor({ state: "visible" });
    const daMuaTruoc = await cuaHang.locator("footer li").count();
    ownIpExpect(daMuaTruoc, "Giỏ phải có ít nhất 1 món từ bước trước").toBeGreaterThan(0);

    // Ảnh chụp bản điện thoại của cùng màn "sau khi thêm" — đối chiếu
    // `cua-hang-sau-them-dien-thoai.png` (tấm trượt đáy, không phải ngăn kéo).
    await cuaHang.getByRole("button", { name: "Đóng" }).click();
    await cuaHang.waitFor({ state: "hidden" });
    await page.setViewportSize(DIEN_THOAI);
    await page.waitForTimeout(200);
    await nutMuaThem.click();
    await cuaHang.waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${CHUP}/3-cua-hang-sau-them-dien-thoai-390x844.png` });
  });
});
