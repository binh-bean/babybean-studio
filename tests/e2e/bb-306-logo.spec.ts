/**
 * BB-306 — logo hạt đậu mới đứng CẠNH chữ BABY BEAN ở mọi đầu trang (admin
 * duyệt 28/09/2026).
 *
 * OWNER: QA-BOT (tệp này) / DEV-FE (sản phẩm được kiểm:
 * `gallery-app.tsx`, `admin-sidebar.tsx`, `admin-header.tsx`, `login/page.tsx`).
 *
 * NĂM CHỖ ĐẶT LOGO ĐƯỢC KIỂM:
 *  1. Thanh thương hiệu đầu trang màn khách (`ten-thuong-hieu`) — 390 & 1440.
 *  2. Thanh đầu lưới dính màn khách máy tính (`ten-thuong-hieu-dinh` trong
 *     `#dau-luoi-anh`) — CHỈ sau khi đã cuộn qua bìa (xem mục "kiểm ngược").
 *  3. Trang đăng nhập (390).
 *  4. Thanh bên quản trị (1440, không thu gọn).
 *  5. Đầu trang quản trị trên điện thoại (390) — hàng chữ trong header VÀ
 *     tiêu đề Sheet menu (mở bằng nút "Mở menu").
 *
 * KIỂM NGƯỢC (AGENTS §5a) cho việc "logo ở thanh đầu lưới CHỈ hiện khi thanh
 * đó đang dính" (bìa layout "ben-canh" không tràn `100svh` ở máy tính nên
 * `#dau-luoi-anh` lọt vào khung nhìn từ lúc mở trang, chưa cuộn — xem ghi chú
 * `hienLogoDinhMayTinh` trong `gallery-app.tsx`):
 *   hoàn nguyên (xoá điều kiện `hienLogoDinhMayTinh &&`, luôn dựng cụm logo)
 *   → "Màn khách 1440×900 — bìa CHƯA cuộn" đỏ (đếm được HAI "Baby Bean" nhìn
 *   thấy cùng lúc) → vá lại (trả về điều kiện) → xanh. Kết quả dán trong
 *   bàn giao, không đưa vào bộ thử tự động (không có cách bật/tắt code sản
 *   phẩm an toàn từ trong phép thử — đúng cấm ở AGENTS §2.8).
 *
 * Dữ liệu: chỉ tạo "Fixture BB-306 …", xoá sạch ở afterAll — đúng khuôn
 * `bb-299-luoi-dau-cua-hang.spec.ts` (gallery) + `bb-141-admin-galleries.spec.ts`
 * (tài khoản nhân viên thử). Ảnh chụp: `test-results/bb-306/` (gitignore) +
 * bản đối chiếu dài hạn ở `babybean-assets/BB-306/chup/`.
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import type { Locator, Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-306 ${runId}`;
const soGia = `0905${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const emailNhanVien = `test_bb306_${runId}@demo.babybean.vn`;
const matKhauNhanVien = "Password123!";

const THU_MUC_ANH = "test-results/bb-306";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

// Ảnh chụp cho admin tự đối chiếu (LUẬT-DOT-8: lưu NGOÀI test-results).
const CHUP = "C:\\Users\\binh\\Downloads\\claude code\\babybean-assets\\BB-306\\chup";
fs.mkdirSync(CHUP, { recursive: true });

const DIEN_THOAI = { width: 390, height: 844 };
const MAY_TINH = { width: 1440, height: 900 };

/**
 * Kiểm MỘT cụm logo+chữ: cả hai nhìn thấy, ảnh logo TẢI THẬT (naturalWidth >
 * 0, không chỉ khung <img> hiện trên trang), và khoảng cách ngang logo→chữ
 * nằm trong 4–16px (đúng khoảng 0,4× cỡ chữ ở mọi vị trí đã dựng).
 */
async function kiemLogoCanhChu(logo: Locator, chu: Locator, nhan: string): Promise<void> {
  await ownIpExpect(logo, `${nhan}: logo không nhìn thấy`).toBeVisible();
  await ownIpExpect(chu, `${nhan}: chữ BABY BEAN không nhìn thấy`).toBeVisible();

  const naturalWidth = await logo.evaluate((img: HTMLImageElement) => img.naturalWidth);
  ownIpExpect
    .soft(naturalWidth, `${nhan}: logo chưa tải xong (naturalWidth=${naturalWidth})`)
    .toBeGreaterThan(0);

  const hopLogo = await logo.boundingBox();
  const hopChu = await chu.boundingBox();
  if (!hopLogo || !hopChu) throw new Error(`${nhan}: không đo được logo/chữ`);

  const khoangCach = hopChu.x - (hopLogo.x + hopLogo.width);
  ownIpExpect
    .soft(
      khoangCach >= 4 && khoangCach <= 16,
      `${nhan}: khoảng cách logo→chữ ${khoangCach.toFixed(1)}px, ngoài 4–16px`,
    )
    .toBe(true);
}

/**
 * Đếm số cụm thương hiệu "Baby Bean" ĐANG NHÌN THẤY trong thanh đầu lưới
 * dính (`#dau-luoi-anh`, testid `ten-thuong-hieu-dinh` — có thể khớp CẢ bản
 * điện thoại hàng 1 luôn dựng lẫn bản máy tính dựng có điều kiện, mỗi bề
 * rộng chỉ MỘT trong hai bản thật sự "nhìn thấy" qua CSS `hidden`/`lg:`).
 * Không quét toàn trang bằng `getByText` — trang còn "Baby Bean" ở lời cảm
 * ơn cuối trang (`bia-bo-anh.tsx`, trạng thái đã giao) và câu mẫu bìa
 * (`mau-chu-bia.ts`), không phải logo thương hiệu, sẽ đếm nhầm.
 */
async function demCumDinhNhinThay(page: Page): Promise<number> {
  const cum = page.locator('#dau-luoi-anh [data-testid="ten-thuong-hieu-dinh"]');
  const soKhop = await cum.count();
  let dem = 0;
  for (let i = 0; i < soKhop; i++) {
    if (await cum.nth(i).isVisible()) dem++;
  }
  return dem;
}

ownIpTest.describe("BB-306: logo hạt đậu cạnh BABY BEAN", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let babyId = "";
  let galleryId = "";
  let maLink = "";
  let staffUserId = "";

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    await pg.query(`delete from galleries where title like 'Fixture BB-306%' and created_at < now() - interval '6 hours'`);
    await pg.query(`delete from customers where full_name like 'Fixture BB-306%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách`, soGia],
    );
    customerId = kh[0].id;

    const { rows: be } = await pg.query(
      `insert into babies (customer_id, full_name, nickname) values ($1,$2,$3) returning id`,
      [customerId, `${NHAN} Bé`, "Bé Fixture 306"],
    );
    babyId = be[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, baby_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,$4,'ready',$5,'https://example.com/x',14,20,50000,false) returning id`,
      [branchId, customerId, babyId, NHAN, `fixture-bb306-${runId}`],
    );
    galleryId = g[0].id;

    // BB-306 mục (3) cần cuộn HẾT bìa ra khỏi khung nhìn để đo cụm logo dính
    // — vài tấm không đủ chiều cao lưới để cuộn được xa vậy, dùng 14 tấm
    // (đủ vài hàng) thay vì 3 như thử ban đầu (đã gặp timeout vì trang quá
    // ngắn, không cuộn xa được tới đó).
    for (let i = 1; i <= 14; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
         values ($1,$2,$3,'image/jpeg',$4,'active',1200,800)`,
        [galleryId, `bb306-${runId}-${i}`, `BB306_${String(i).padStart(3, "0")}.jpg`, i],
      );
    }

    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );

    // Tài khoản nhân viên thử cho các màn quản trị — đúng khuôn bb-141.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminAuthClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await adminAuthClient.auth.admin.createUser({
      email: emailNhanVien,
      password: matKhauNhanVien,
      email_confirm: true,
    });
    if (error) throw error;
    staffUserId = data.user.id;
    await pg.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`,
      [staffUserId, `${NHAN} Nhân viên`, emailNhanVien],
    );
  });

  ownIpTest.afterAll(async () => {
    if (pg) {
      if (galleryId) await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from galleries where id = $1", [galleryId]);
      if (babyId) await pg.query("delete from babies where id = $1", [babyId]);
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
      if (staffUserId) await pg.query("delete from staff_profiles where id = $1", [staffUserId]);
      await pg.end();
    }
    if (staffUserId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const adminAuthClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await adminAuthClient.auth.admin.deleteUser(staffUserId);
    }
  });

  // -------------------------------------------------------------------------
  // (1) Màn khách — thanh thương hiệu đầu trang, 390 & 1440.
  // -------------------------------------------------------------------------
  for (const [tenKichThuoc, kichThuoc] of [
    ["390x844", DIEN_THOAI],
    ["1440x900", MAY_TINH],
  ] as const) {
    ownIpTest(`Màn khách ${tenKichThuoc} — bìa: logo cạnh Baby Bean`, async ({ page }) => {
      await page.setViewportSize(kichThuoc);
      await page.goto(`/g/${maLink}`);

      const cum = page.getByTestId("ten-thuong-hieu");
      await cum.waitFor({ state: "visible" });
      const logo = cum.getByTestId("logo-hat-dau");
      const chu = cum.locator("span");

      await kiemLogoCanhChu(logo, chu, `Thanh thương hiệu ${tenKichThuoc}`);
      await page.screenshot({ path: `${THU_MUC_ANH}/1-bia-${tenKichThuoc}.png` });
      await page.screenshot({ path: `${CHUP}/1-man-khach-bia-${tenKichThuoc}.png` });
    });
  }

  // -------------------------------------------------------------------------
  // (2) Màn khách máy tính — bìa CHƯA cuộn: đúng MỘT "Baby Bean" nhìn thấy
  // (mục kiểm ngược chính của BB-306, xem ghi chú đầu tệp).
  // -------------------------------------------------------------------------
  ownIpTest("Màn khách 1440×900 — bìa CHƯA cuộn: chỉ MỘT Baby Bean nhìn thấy", async ({ page }) => {
    await page.setViewportSize(MAY_TINH);
    await page.goto(`/g/${maLink}`);

    const cum = page.getByTestId("ten-thuong-hieu");
    await cum.waitFor({ state: "visible" });
    // Chờ IntersectionObserver ổn định (BB-306: hienLogoDinhMayTinh mặc định
    // false, không cần chờ gì thêm để nó SAI — nhưng chờ một nhịp để chắc
    // chắn không có cập nhật trễ nào bật nhầm nó lên true trước khi đo).
    await page.waitForTimeout(300);

    // Thanh thương hiệu đầu trang (không dính) LUÔN nhìn thấy — đây chính là
    // "Baby Bean" thứ nhất. Cụm còn lại (thanh đầu lưới dính) phải là 0 khi
    // CHƯA cuộn, không thì tổng cộng có HAI cụm cùng lúc (lỗi BB-306 báo).
    const soDemCumDinh = await demCumDinhNhinThay(page);
    ownIpExpect
      .soft(
        soDemCumDinh,
        `Có ${soDemCumDinh} cụm "Baby Bean" trong thanh đầu lưới dính đang nhìn thấy TRƯỚC KHI cuộn — phải là 0 (thanh thương hiệu đầu trang đã chiếm chỗ "Baby Bean" duy nhất)`,
      )
      .toBe(0);

    await page.screenshot({ path: `${THU_MUC_ANH}/2-bia-chua-cuon-1440x900.png` });
    await page.screenshot({ path: `${CHUP}/2-man-khach-bia-chua-cuon-1440x900.png` });
  });

  // -------------------------------------------------------------------------
  // (3) Màn khách máy tính — SAU khi cuộn qua bìa: cụm logo+chữ trong thanh
  // đầu lưới dính hiện ra, đúng khoảng cách.
  // -------------------------------------------------------------------------
  ownIpTest("Màn khách 1440×900 — đã cuộn qua bìa: logo cạnh Baby Bean ở thanh dính", async ({ page }) => {
    await page.setViewportSize(MAY_TINH);
    await page.goto(`/g/${maLink}`);
    // Chờ bìa dựng xong TRƯỚC khi cuộn — `#dau-luoi-anh` chưa có trong DOM
    // lúc `gallery` còn đang tải (chỉ có khung xương), cuộn lúc đó chỉ cuộn
    // trong đúng 900px của khung xương rồi dừng ngay.
    await page.getByTestId("ten-thuong-hieu").waitFor({ state: "visible" });
    // `scrollIntoView({block:"start"})` bị CHẶN LẠI (không cuộn đủ xa) khi
    // tổng chiều cao trang không đủ khoảng cách để dau-luoi-anh chạm hẳn
    // y=0 — cuộn thẳng xuống ĐÁY trang (chắc chắn bìa đã ra khỏi khung nhìn
    // nếu còn nội dung nào bên dưới nó) đáng tin hơn cho đúng mục đích đo ở
    // đây: bìa KHÔNG CÒN GIAO khung nhìn.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // `:visible` lọc đúng MỘT bản đang hiện (bản máy tính) — testid lặp ở cả
    // hàng 1 điện thoại (luôn dựng, ẩn bằng CSS `lg:hidden` ở bề rộng này).
    const cum = page.locator('#dau-luoi-anh [data-testid="ten-thuong-hieu-dinh"]:visible');
    await cum.waitFor({ state: "visible" });
    const logo = cum.getByTestId("logo-hat-dau");
    const chu = cum.locator("span");

    await kiemLogoCanhChu(logo, chu, "Thanh đầu lưới dính (đã cuộn) 1440");
    await page.screenshot({ path: `${THU_MUC_ANH}/3-luoi-da-cuon-1440x900.png` });
    await page.screenshot({ path: `${CHUP}/3-man-khach-luoi-da-cuon-1440x900.png` });
  });

  // -------------------------------------------------------------------------
  // (4) Trang đăng nhập, 390×844.
  // -------------------------------------------------------------------------
  ownIpTest("Trang đăng nhập 390×844 — logo cạnh BABY BEAN", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto("/login");

    const cum = page.getByRole("heading", { name: "BABY BEAN" });
    await cum.waitFor({ state: "visible" });
    const logo = cum.getByTestId("logo-hat-dau");
    const chu = cum.locator("span");

    await kiemLogoCanhChu(logo, chu, "Trang đăng nhập 390");
    await page.screenshot({ path: `${THU_MUC_ANH}/4-dang-nhap-390x844.png` });
    await page.screenshot({ path: `${CHUP}/4-dang-nhap-390x844.png` });
  });

  // -------------------------------------------------------------------------
  // (5) Quản trị 1440×900 — thanh bên (không thu gọn).
  // -------------------------------------------------------------------------
  ownIpTest("Quản trị 1440×900 — thanh bên: logo cạnh BABY BEAN", async ({ page }) => {
    await page.setViewportSize(MAY_TINH);
    await dangNhapNhanVien(page, emailNhanVien, matKhauNhanVien);

    // `aside` không chỉ là thanh bên (bao-cao-explorer, photo-lightbox cũng
    // dùng thẻ này) — lọc đúng khối chứa "BABY BEAN" để tránh strict-mode.
    const thanhBen = page.locator('aside:has-text("BABY BEAN")');
    await thanhBen.waitFor({ state: "visible" });
    const logo = thanhBen.getByTestId("logo-hat-dau");
    const chu = thanhBen.getByText("BABY BEAN", { exact: true });

    await kiemLogoCanhChu(logo, chu, "Thanh bên quản trị 1440");
    await page.screenshot({ path: `${THU_MUC_ANH}/5-quan-tri-1440x900.png` });
    await page.screenshot({ path: `${CHUP}/5-quan-tri-1440x900.png` });
  });

  // -------------------------------------------------------------------------
  // (6) Quản trị 390×844 — đầu trang điện thoại (hàng header) VÀ Sheet menu.
  // -------------------------------------------------------------------------
  ownIpTest("Quản trị 390×844 — đầu trang điện thoại + Sheet menu: logo cạnh BABY BEAN", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await dangNhapNhanVien(page, emailNhanVien, matKhauNhanVien);

    // Hàng header (luôn hiện, không cần mở Sheet).
    const hangDau = page.locator('[data-testid="logo-hat-dau"]:visible').first();
    await hangDau.waitFor({ state: "visible" });
    const chuHangDau = page.locator("header").getByText("BABY BEAN", { exact: true }).first();
    await kiemLogoCanhChu(hangDau, chuHangDau, "Đầu trang quản trị điện thoại (hàng header)");
    await page.screenshot({ path: `${THU_MUC_ANH}/6-quan-tri-header-390x844.png` });
    await page.screenshot({ path: `${CHUP}/6-quan-tri-390x844.png` });

    // Sheet menu — mở bằng nút "Mở menu".
    await page.getByRole("button", { name: "Mở menu" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.waitFor({ state: "visible" });
    const logoSheet = sheet.getByTestId("logo-hat-dau");
    const chuSheet = sheet.getByText("BABY BEAN", { exact: true });
    await kiemLogoCanhChu(logoSheet, chuSheet, "Sheet menu quản trị điện thoại");
    await page.screenshot({ path: `${THU_MUC_ANH}/6b-quan-tri-sheet-390x844.png` });
  });
});
