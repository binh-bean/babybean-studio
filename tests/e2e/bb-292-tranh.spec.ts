/**
 * BB-292 — gắn 5 tranh mới (`public/minh-hoa/*`) vào đúng màn + trả nợ nhỏ từ
 * BB-289/290 (nhãn 5 bước hành trình, "BABY BEAN" thanh đầu quản trị điện
 * thoại).
 *
 * Mỗi tranh đo được HAI thứ, không đoán bằng mắt:
 *  1. `naturalWidth > 0` tại đúng màn nêu trong đề bài — tranh THẬT SỰ tải
 *     được, không phải `<img>` trỏ tới một tệp không tồn tại (đúng lỗi đã bắt
 *     được ở `KhongCoQuyen`: `khong-co-quyen.webp` không khớp tên tệp thật
 *     `khong-co-quyen-{320,640}.webp` — xem sửa trong
 *     `src/components/features/admin/page-header.tsx`).
 *  2. Không gây cuộn ngang ở 390px (`document.documentElement.scrollWidth`).
 *
 * Bảy mục trong đề bài, bảy ca dưới đây (không kể ca dựng dữ liệu):
 *  1. Cảm ơn sau chốt          → `cam-on-sau-chot.tsx`
 *  2. Trạng thái trống quản trị → `dashboard.tsx` (bảng điều khiển) +
 *     `gallery-list.tsx` (danh sách bộ ảnh không khớp lọc)
 *  3. KhongCoQuyen              → `page-header.tsx` (màn Nhân sự khi vai
 *     không đủ quyền)
 *  4. Dải tranh đăng nhập điện thoại → `(auth)/login/page.tsx`
 *  5. Chân trang khách          → `gallery-app.tsx`
 *  6. Nhãn 5 bước hành trình    → `hanh-trinh.ts`
 *  7. "BABY BEAN" thanh đầu quản trị điện thoại → `admin-header.tsx`
 *
 * Dữ liệu: chỉ "Fixture BB-292 …", dọn theo tuổi ≥6h ở `beforeAll`, dọn sạch
 * phần của lượt chạy này ở `afterAll` (AGENTS.md §6).
 *
 * VÒNG 2 (giám đốc chấm ảnh chụp) — năm sửa thêm, mỗi cái một phép đo MÁY:
 *  A. Tranh lệch tông nền (chân trang, dải đăng nhập, KhongCoQuyen, trạng
 *     thái trống quản trị) → `mix-blend-mode: multiply` qua `moVaoNen()`.
 *  B. Trạng thái trống quản trị: `object-contain`, rộng ≤360px, không cắt
 *     vật, bỏ nền riêng quanh tranh — đo trong mục 2a/2b.
 *  C. Chân trang: cắt sát riêng `chan-trang-vat-{160,320}.webp` từ
 *     `babybean-assets/BB-291/5-chan-trang.png` bằng sharp — đo trong mục 5.
 *  D. Ô tìm kiếm hàng lọc Bộ ảnh (1440px) không còn bị ép hẹp — đo trong
 *     mục 2b/4 (`boundingBox().width >= 200`).
 *  E. Ảnh chụp mục 6 nay chụp riêng phần tử `#the-hanh-trinh` sau khi cuộn
 *     tới, thấy rõ 5 nhãn bước.
 *
 * HOÀN NGUYÊN KIỂM NGƯỢC (AGENTS.md §5a) — làm thủ công trước khi nộp, dán
 * kết quả vào báo cáo bàn giao:
 *  - Đổi nhãn trong `hanh-trinh.ts` (`buocHanhTrinh`) về mảng cũ
 *    `["Chọn ảnh","Chỉnh sửa","Duyệt","In","Nhận ảnh"]` → ca mục 6 ĐỎ: không
 *    còn tìm thấy bước "Đang chỉnh"/"Đã chốt"/"Đã giao".
 *  - Đổi `src` trong `page-header.tsx` (`KhongCoQuyen`) về đường dẫn cũ
 *    `/minh-hoa/khong-co-quyen.webp` (tệp không tồn tại) → ca mục 3 ĐỎ:
 *    `naturalWidth` bằng 0.
 *  - Bỏ `lg:min-w-[220px]` khỏi ô tìm kiếm máy tính trong
 *    `gallery-filters.tsx` → ca mục 2b/4 ĐỎ: `boundingBox().width` rơi dưới
 *    200px ở 1440px.
 *
 * Chạy: `PW_PORT=3165 npx playwright test tests/e2e/bb-292-tranh.spec.ts --workers=1`.
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { tickHopChotDot1 } from "./helpers/tick-hop-chot-dot1";

const THU_MUC_ANH = "test-results/bb-292";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

const DIEN_THOAI = { width: 390, height: 844 };

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-292 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const soGia = (n: number) => `0900${String(n).padStart(6, "0")}`;

const suKienAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

/** Tranh tải được thật (không phải chỉ có mặt trong DOM). */
async function anhTaiDuoc(page: Page, selector: string) {
  const anh = page.locator(selector).first();
  await expect(anh).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => anh.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 15_000 })
    .toBeGreaterThan(0);
}

async function khongCuonNgang(page: Page) {
  const cuon = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(cuon, "trang cuộn ngang ở 390px").toBe(false);
}

/**
 * BB-292 vòng 2 — giám đốc chấm ảnh chụp: tranh minh hoạ hiện thành một khối
 * kem tách khỏi nền `#FBF7F2`. Canh MÁY: `mix-blend-mode: multiply` phải có
 * thật trên phần tử, không đoán bằng mắt qua ảnh chụp.
 */
async function moVaoNen(page: Page, selector: string) {
  const anh = page.locator(selector).first();
  const mode = await anh.evaluate((el) => getComputedStyle(el).mixBlendMode);
  expect(mode, `${selector} phải mix-blend-mode: multiply để tan vào nền`).toBe("multiply");
}

test.describe("BB-292: gắn 5 tranh mới + trả nợ BB-289/290", () => {
  let pg: Client;
  let branchId = "";
  let branchTrongId = "";

  // Bộ hành trình: bộ ảnh đã chốt, đang chỉnh — dùng cho mục 5 (chân trang) + 6 (nhãn).
  let customerHanhTrinhId = "";
  let galleryHanhTrinhId = "";
  let maLinkHanhTrinh = "";

  // Bộ chốt: bộ ảnh sẵn sàng chọn, chưa chốt — dùng cho mục 1 (Cảm ơn sau chốt).
  let customerChotId = "";
  let galleryChotId = "";
  let maLinkChot = "";

  // Nhân sự.
  let ownerId = "";
  const ownerEmail = `test_bb292_owner_${runId}@demo.babybean.vn`;
  let ngheSiId = "";
  const ngheSiEmail = `test_bb292_ns_${runId}@demo.babybean.vn`;
  const password = "Password123!";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    await pg.query(`delete from galleries where title like 'Fixture BB-292%' and created_at < now() - interval '6 hours'`);
    await pg.query(`delete from customers where full_name like 'Fixture BB-292%' and created_at < now() - interval '6 hours'`);
    await pg.query(`delete from branches where code like 'FIXTURE-BB292-%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    // Chi nhánh trống — không bộ ảnh nào — cho ca "bảng điều khiển trống" (mục 2a).
    const { rows: brTrong } = await pg.query(
      `insert into branches (code, name) values ($1,$2) returning id`,
      [`FIXTURE-BB292-${runId}`, `${NHAN} Chi nhánh trống`],
    );
    branchTrongId = brTrong[0].id;

    // -----------------------------------------------------------------
    // Bộ hành trình — status in_retouch, giaiDoan null → bước hiện tại
    // "Đang chỉnh" (vị trí 1 trong mảng nhãn mới), có chân trang khách.
    // -----------------------------------------------------------------
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Khách hành trình`, soGia(1)],
      );
      customerHanhTrinhId = kh[0].id;

      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, included_quota, extra_photo_price,
                                download_enabled)
         values ($1,$2,$3,'in_retouch',$4,'https://example.com/x',3,10,50000,false) returning id`,
        [branchId, customerHanhTrinhId, `${NHAN} Hành trình`, `fixture-bb292-ht-${runId}`],
      );
      galleryHanhTrinhId = g[0].id;

      maLinkHanhTrinh = randomBytes(32).toString("base64url");
      await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
         values ($1,$2,$3,'owner','Fixture BB-292 Hành trình','active')`,
        [galleryHanhTrinhId, sha256(maLinkHanhTrinh), maLinkHanhTrinh.slice(0, 6)],
      );
    }

    // -----------------------------------------------------------------
    // Bộ chốt — status ready, KHÔNG có album trong gói (coBia = null) để
    // luồng chốt đi thẳng, không dừng ở bước chọn bìa.
    // -----------------------------------------------------------------
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Khách chốt`, soGia(2)],
      );
      customerChotId = kh[0].id;

      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, included_quota, extra_photo_price)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',3,10,20000) returning id`,
        [branchId, customerChotId, `${NHAN} Chốt`, `fixture-bb292-ch-${runId}`],
      );
      galleryChotId = g[0].id;

      for (let i = 1; i <= 3; i++) {
        await pg.query(
          `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
           values ($1,$2,$3,'image/jpeg',$4,'active')`,
          [galleryChotId, `bb292ch-${runId}-${i}.jpg`, `BB292CH_000${i}.jpg`, i],
        );
      }

      maLinkChot = randomBytes(32).toString("base64url");
      await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
         values ($1,$2,$3,'owner','Fixture BB-292 Chốt','active')`,
        [galleryChotId, sha256(maLinkChot), maLinkChot.slice(0, 6)],
      );
    }

    // Owner — dùng cho bảng điều khiển + danh sách bộ ảnh.
    const ownerRes = await suKienAdmin().auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    });
    if (ownerRes.error) throw ownerRes.error;
    ownerId = ownerRes.data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
      ownerId,
      `${NHAN} Owner`,
      ownerEmail,
    ]);

    // Nghệ sĩ (photographer) — vai không đủ quyền xem màn Nhân sự → KhongCoQuyen.
    const ngheSiRes = await suKienAdmin().auth.admin.createUser({
      email: ngheSiEmail,
      password,
      email_confirm: true,
    });
    if (ngheSiRes.error) throw ngheSiRes.error;
    ngheSiId = ngheSiRes.data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'photographer')`, [
      ngheSiId,
      `${NHAN} Photographer`,
      ngheSiEmail,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [
      ngheSiId,
      branchId,
    ]);
  });

  test.afterAll(async () => {
    if (pg) {
      if (galleryHanhTrinhId) {
        await pg.query("delete from share_links where gallery_id = $1", [galleryHanhTrinhId]);
        await pg.query("delete from galleries where id = $1", [galleryHanhTrinhId]);
      }
      if (galleryChotId) {
        await pg.query("delete from selection_items where gallery_id = $1", [galleryChotId]);
        await pg.query("delete from selections where gallery_id = $1", [galleryChotId]);
        await pg.query("delete from photos where gallery_id = $1", [galleryChotId]);
        await pg.query("delete from share_links where gallery_id = $1", [galleryChotId]);
        await pg.query("delete from galleries where id = $1", [galleryChotId]);
      }
      if (customerHanhTrinhId) await pg.query("delete from customers where id = $1", [customerHanhTrinhId]);
      if (customerChotId) await pg.query("delete from customers where id = $1", [customerChotId]);
      if (ngheSiId) await pg.query("delete from staff_branches where staff_id = $1", [ngheSiId]);
      if (ownerId) await pg.query("delete from staff_profiles where id = $1", [ownerId]);
      if (ngheSiId) await pg.query("delete from staff_profiles where id = $1", [ngheSiId]);
      if (branchTrongId) await pg.query("delete from branches where id = $1", [branchTrongId]);
      await pg.end();
    }
    if (ownerId) await suKienAdmin().auth.admin.deleteUser(ownerId);
    if (ngheSiId) await suKienAdmin().auth.admin.deleteUser(ngheSiId);
  });

  // -------------------------------------------------------------------
  // Mục 1 — Cảm ơn sau chốt.
  // -------------------------------------------------------------------
  ownIpTest("mục 1: tranh Cảm ơn sau chốt tải được ở khung tròn, không tràn 390px", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLinkChot}`);

    await page.getByRole("button", { name: "Chọn ảnh này" }).first().click();
    await page.waitForTimeout(600);

    const nutChot = page.getByRole("button", { name: /Chốt danh sách|chốt/i }).first();
    await nutChot.click();

    // BB-295 mục #6 — nút đổi tên "Đi tới chọn bìa" → "Chọn bìa ngay".
    const diToiBia = page.getByTestId("nut-chon-bia-ngay");
    if (await diToiBia.count()) {
      // Bộ dữ liệu ca này cố ý không có album trong gói — không nên tới đây.
      throw new Error("Bộ ảnh fixture BB-292 không có album nhưng vẫn hỏi chọn bìa — kiểm lại fixture.");
    }

    const oTenXacNhan = page.locator("#confirm-name-input");
    if (await oTenXacNhan.count()) {
      await oTenXacNhan.fill(`${NHAN} Khách chốt`);
    }
    // BB-323 — từ BB-321 (chủ studio 29/09/2026) hộp chốt đợt 1 có thêm ô BẮT BUỘC
    // đứng TRƯỚC ô chung (chọn thiếu hạn mức → "đồng ý studio chọn dùm"; còn sản
    // phẩm in chưa có ảnh → "biết nhận ảnh chậm hơn"). Tick `checkbox` ĐẦU TIÊN như
    // bản cũ chỉ trúng ô khối A, nút Xác nhận khoá mãi. Dùng helper chung.
    await tickHopChotDot1(page);

    // Mốc chờ màn Cảm ơn tính từ lúc MÁY CHỦ trả lời chốt (xem bb-289: /api/g/submit
    // từ máy dev mất 3,4–5,4 s vì ~25 lượt hỏi Supabase nối tiếp).
    const choChot = page.waitForResponse(
      (r) => r.url().includes("/api/g/submit") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "Xác nhận" }).click();
    ownIpExpect((await choChot).status(), "Máy chủ phải nhận chốt (200)").toBe(200);

    const camOn = page.getByTestId("cam-on-sau-chot");
    await ownIpExpect(camOn).toBeVisible({ timeout: 10_000 });

    await anhTaiDuoc(page, "[data-testid='cam-on-sau-chot'] img[src*='cam-on-phong-thu']");
    await khongCuonNgang(page);

    await page.screenshot({ path: `${THU_MUC_ANH}/muc1-cam-on-sau-chot.png`, fullPage: false });
  });

  // -------------------------------------------------------------------
  // Mục 6 (+ tranh hành trình không liên quan BB-292, chỉ nhãn) và mục 5.
  // -------------------------------------------------------------------
  ownIpTest(
    "mục 6: nhãn hành trình theo bản vẽ BB-285 ('Đã chốt'/'Đang chỉnh'/'Đã giao'), không tràn 390px",
    async ({ page }) => {
      await page.setViewportSize(DIEN_THOAI);
      await page.goto(`/g/${maLinkHanhTrinh}`);

      const stepDangChinh = page.locator("div[aria-current='step']:has-text('Đang chỉnh')");
      await ownIpExpect(stepDangChinh).toBeVisible();

      for (const nhan of ["Đã chốt", "Đã giao"]) {
        const hop = await page.getByText(nhan, { exact: true }).boundingBox();
        expect(hop, nhan).not.toBeNull();
        expect(hop!.x, `${nhan} tràn trái`).toBeGreaterThanOrEqual(0);
        expect(hop!.x + hop!.width, `${nhan} tràn phải`).toBeLessThanOrEqual(390);
      }
      await khongCuonNgang(page);

      // BB-292 vòng 2 — giám đốc báo ảnh chụp trước không thấy nhãn 5 bước:
      // chụp cả trang (`fullPage:false`) ở đúng vị trí cuộn ban đầu, mà thẻ
      // hành trình nằm dưới phần đầu trang (bìa + tiêu đề). Cuộn tới đúng thẻ
      // rồi chụp RIÊNG phần tử đó, không chụp cả khung nhìn.
      const theHanhTrinh = page.locator("#the-hanh-trinh");
      await theHanhTrinh.scrollIntoViewIfNeeded();
      await theHanhTrinh.screenshot({ path: `${THU_MUC_ANH}/muc6-nhan-hanh-trinh.png` });
    },
  );

  ownIpTest(
    "mục 5: chân trang khách có tranh chan-trang-vat, tan vào nền (multiply), cao ≤120px, không tràn 390px",
    async ({ page }) => {
      await page.setViewportSize(DIEN_THOAI);
      await page.goto(`/g/${maLinkHanhTrinh}`);

      const anhChanTrang = page.locator("footer img[src*='chan-trang-vat']");
      await anhChanTrang.scrollIntoViewIfNeeded();
      await anhTaiDuoc(page, "footer img[src*='chan-trang-vat']");
      await moVaoNen(page, "footer img[src*='chan-trang-vat']");

      const hop = await anhChanTrang.boundingBox();
      expect(hop, "tranh chân trang phải đo được kích thước").not.toBeNull();
      expect(hop!.height, "tranh chân trang cao quá 120px").toBeLessThanOrEqual(120);

      await khongCuonNgang(page);
      await page.screenshot({ path: `${THU_MUC_ANH}/muc5-chan-trang.png`, fullPage: false });
    },
  );

  // -------------------------------------------------------------------
  // Mục 4 — dải tranh đăng nhập điện thoại.
  // -------------------------------------------------------------------
  test("mục 4: dải tranh đăng nhập điện thoại tải được, không tràn 390px, máy tính vẫn tranh dọc", async ({
    page,
  }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto("/login");
    await anhTaiDuoc(page, "img[src*='dai-dang-nhap']");
    await moVaoNen(page, "img[src*='dai-dang-nhap']");
    // Tranh dọc máy tính vẫn trong DOM (className "hidden md:block" không gỡ
    // khỏi cây DOM) — kiểm KHÔNG THẤY, không kiểm số lượng.
    await expect(page.locator("img[src*='dang-nhap-doc']")).toBeHidden();
    await khongCuonNgang(page);
    await page.screenshot({ path: `${THU_MUC_ANH}/muc4-dang-nhap-dien-thoai.png`, fullPage: false });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await anhTaiDuoc(page, "img[src*='dang-nhap-doc']");
    await expect(page.locator("img[src*='dai-dang-nhap']")).toBeHidden();
    await page.screenshot({ path: `${THU_MUC_ANH}/muc4-dang-nhap-may-tinh.png`, fullPage: false });
  });

  // -------------------------------------------------------------------
  // Mục 3 — KhongCoQuyen.
  // -------------------------------------------------------------------
  test("mục 3: màn Nhân sự hiện KhongCoQuyen với tranh tải được khi vai không đủ quyền", async ({ page }) => {
    await dangNhapNhanVien(page, ngheSiEmail, password);
    await page.goto("/admin/staff");
    await expect(page.getByRole("heading", { name: "Không có quyền" })).toBeVisible();
    await anhTaiDuoc(page, "img[src*='khong-co-quyen']");
    await moVaoNen(page, "img[src*='khong-co-quyen']");
    await page.screenshot({ path: `${THU_MUC_ANH}/muc3-khong-co-quyen.png`, fullPage: false });
  });

  // -------------------------------------------------------------------
  // Mục 2 — trạng thái trống quản trị.
  // -------------------------------------------------------------------
  test("mục 2a: bảng điều khiển của chi nhánh trống hiện tranh ngang-quan-tri-trong, contain ≤360px, tan vào nền", async ({
    page,
  }) => {
    await dangNhapNhanVien(page, ownerEmail, password);
    await page.goto(`/admin?branchId=${branchTrongId}`);
    await expect(page.getByRole("heading", { name: "Chưa có bộ ảnh nào" })).toBeVisible({ timeout: 15_000 });
    await anhTaiDuoc(page, "img[src*='ngang-quan-tri-trong']");
    await moVaoNen(page, "img[src*='ngang-quan-tri-trong']");

    // BB-292 vòng 2 — giám đốc báo tranh bị kéo tràn ngang, lọ hoa cắt đỉnh:
    // đo MÁY hai điều luật mới — không rộng quá 360px, và `object-fit` phải
    // là `contain` (không cắt vật, khác `cover` cũ).
    const anh = page.locator("img[src*='ngang-quan-tri-trong']").first();
    const hop = await anh.boundingBox();
    expect(hop, "phải đo được khung tranh").not.toBeNull();
    expect(hop!.width, "tranh trống quản trị rộng quá 360px").toBeLessThanOrEqual(360);
    const objectFit = await anh.evaluate((el) => getComputedStyle(el).objectFit);
    expect(objectFit, "tranh trống quản trị phải object-fit: contain (không cắt vật)").toBe("contain");

    await page.screenshot({ path: `${THU_MUC_ANH}/muc2a-dashboard-trong.png`, fullPage: false });
  });

  test("mục 2b + mục 4: danh sách bộ ảnh không khớp bộ lọc hiện tranh contain ≤360px; ô tìm kiếm không bị ép ở 1440px", async ({
    page,
  }) => {
    await dangNhapNhanVien(page, ownerEmail, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/galleries");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Mục 4 — ô tìm kiếm hàng lọc Bộ ảnh KHÔNG bị ép còn ~70px ở 1440px.
    const oTim = page.getByPlaceholder("Tìm theo tên bé, tên khách, số điện thoại…");
    const hopTim = await oTim.boundingBox();
    expect(hopTim, "phải đo được ô tìm kiếm").not.toBeNull();
    expect(hopTim!.width, "ô tìm kiếm bị ép hẹp ở 1440px").toBeGreaterThanOrEqual(200);

    await oTim.fill(`khong-ai-co-ten-${runId}-khong-trung-mot-bo-anh-nao`);
    await expect(page.getByText("Không tìm thấy bộ ảnh nào")).toBeVisible({ timeout: 15_000 });
    await anhTaiDuoc(page, "img[src*='ngang-quan-tri-trong']");
    await moVaoNen(page, "img[src*='ngang-quan-tri-trong']");

    const anh = page.locator("img[src*='ngang-quan-tri-trong']").first();
    const hopAnh = await anh.boundingBox();
    expect(hopAnh, "phải đo được khung tranh").not.toBeNull();
    expect(hopAnh!.width, "tranh danh sách rỗng rộng quá 360px").toBeLessThanOrEqual(360);
    const objectFit = await anh.evaluate((el) => getComputedStyle(el).objectFit);
    expect(objectFit, "tranh danh sách rỗng phải object-fit: contain").toBe("contain");

    await page.screenshot({ path: `${THU_MUC_ANH}/muc2b-danh-sach-trong.png`, fullPage: false });
  });

  // -------------------------------------------------------------------
  // Mục 7 — "BABY BEAN" thanh đầu quản trị điện thoại.
  // -------------------------------------------------------------------
  test("mục 7: thanh đầu quản trị điện thoại hiện 'BABY BEAN' giãn chữ, không còn 'BabyBean' liền", async ({
    page,
  }) => {
    await dangNhapNhanVien(page, ownerEmail, password);
    await page.setViewportSize(DIEN_THOAI);
    await page.goto("/admin/galleries");
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page.locator("header").getByText("BABY BEAN")).toBeVisible();
    await expect(page.locator("header").getByText("BabyBean", { exact: true })).toHaveCount(0);
    await khongCuonNgang(page);
    await page.screenshot({ path: `${THU_MUC_ANH}/muc7-thanh-dau-dien-thoai.png`, fullPage: false });
  });
});
