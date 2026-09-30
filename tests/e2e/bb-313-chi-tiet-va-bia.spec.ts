/**
 * BB-313 (P0, ảnh chụp app thật Đợt 9) — chi tiết bộ ảnh quản trị và trình
 * thiết kế bìa.
 *
 *   Mục 1 — Lỗi phông tiêu đề: tiêu đề lớn (Playfair) phải là TÊN (bé hoặc
 *   khách), mã hợp đồng CHỈ dùng khi hết tên, và khi đó KHÔNG được lặp lại ở
 *   dòng phụ + phải đổi sang Be Vietnam Pro tabular. Breadcrumb phải hiện
 *   đúng "#", không phải "%23".
 *
 *   Mục 2 — Thành phần hợp đồng sửa được: sửa số lượng một dòng, hạn mức
 *   ("Khách đã chọn / N tấm") tính lại NGAY; xoá có xác nhận; dòng vừa sửa
 *   tách khỏi hợp đồng Lark (lark_contract_code về null) để lần đồng bộ sau
 *   không ghi đè mất bản sửa — xem chú thích dài ở PATCH,
 *   src/app/api/admin/galleries/[id]/items/route.ts.
 *
 *   Mục 3 — Trình thiết kế bìa: bấm một ô trong lưới đổi NGAY ảnh xem trước;
 *   ô đang chọn có viền rõ; cả hai khổ (máy tính 1440×900, điện thoại
 *   390×844) không còn chữ đè kín ảnh / ảnh bị đẩy lệch — canh bằng
 *   boundingBox() của khối ảnh và khối chữ trong khung xem trước đã
 *   `scale()`, không chỉ nhìn ảnh chụp bằng mắt. Ảnh giả đúng tỉ lệ 2:3
 *   (1000×1500), không ảnh bé thật.
 *
 * Dữ liệu: chỉ "Fixture BB-313 …", dọn theo tuổi ≥6h ở beforeAll, xoá sạch
 * phần của lượt chạy này ở afterAll (AGENTS.md §6).
 *
 * Chạy: `PW_PORT=3168 npx playwright test tests/e2e/bb-313-chi-tiet-va-bia.spec.ts --workers=1`.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-313 ${runId}`;
const soGia = () => `0907${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const emailOwner = `test_bb313_owner_${runId}@demo.babybean.vn`;
const password = "Password123!";

const CHUP = "C:\\Users\\binh\\Downloads\\claude code\\babybean-assets\\BB-313\\chup";
fs.mkdirSync(CHUP, { recursive: true });
const THU_MUC_ANH = "test-results/bb-313";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

const MAY_TINH = { width: 1440, height: 900 };

async function chup(page: Page, ten: string) {
  await page.screenshot({ path: `${THU_MUC_ANH}/${ten}.png`, fullPage: true });
  await page.screenshot({ path: `${CHUP}/${ten}.png`, fullPage: true });
}

const suKienAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

test.describe("BB-313", () => {
  let pg: Client;
  let branchId = "";
  let ownerId = "";
  let editFileProductId = "";
  let shootPackageProductId = "";
  let serviceProductId = "";

  // Bộ A — mục 1: có nickname bé, có mã hợp đồng (lark_contract_codes) — canh
  // tiêu đề "Bé …", breadcrumb decode "#", và mã KHÔNG lặp (chỉ ở dòng phụ).
  let custA = "", babyA = "", galA = "";
  const maHopDongA = `HD_FIXTURE313#${runId}A`;

  // Bộ B — mục 1: KHÔNG có bé, CÓ tên khách thật — canh tiêu đề dùng TÊN
  // KHÁCH, không lùi thẳng về mã hợp đồng (đúng lỗi báo cáo: bản cũ bỏ qua
  // tầng "tên khách", nhảy thẳng từ "không có bé" sang "mã hợp đồng").
  let custB = "", galB = "";

  // Bộ C — mục 1: KHÔNG bé, tên khách RỖNG (mô phỏng dữ liệu nhập từ Hậu Ký
  // Lark không có tên thật — full_name vẫn NOT NULL nhưng để khoảng trắng) —
  // CHỈ trường hợp này mới được lùi về mã hợp đồng, và phải đổi phông.
  let custC = "", galC = "";
  const maHopDongC = `HD_FIXTURE313#${runId}C`;

  // Bộ D — mục 2: một gói (dòng cha, lark_contract_code) + thành phần "Edit
  // file" x15 (dòng con, cùng lark_contract_code) — canh sửa số lượng, xoá có
  // xác nhận, và dòng sống sót qua "đồng bộ lại" (lark_contract_code → null).
  let custD = "", galD = "";
  let parentItemD = "", childItemD = "", xoaTestItemD = "";
  const maHopDongD = `HD_FIXTURE313#${runId}D`;

  // Bộ E — mục 3: trình thiết kế bìa, 6 ảnh dọc 1000×1500 (2:3) giả.
  let custE = "", babyE = "", galE = "";
  const anhIdsE: string[] = [];

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(`delete from galleries where title like 'Fixture BB-313%' and created_at < now() - interval '6 hours'`);
    await pg.query(`delete from customers where full_name like 'Fixture BB-313%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: p } = await pg.query("select id from products where kind = 'edited_photo' limit 1");
    editFileProductId = p[0].id;
    const { rows: pk } = await pg.query("select id from products where kind = 'shoot_package' limit 1");
    shootPackageProductId = pk[0].id;
    const { rows: sv } = await pg.query("select id from products where kind = 'service' limit 1");
    serviceProductId = sv[0].id;

    const ownerRes = await suKienAdmin().auth.admin.createUser({ email: emailOwner, password, email_confirm: true });
    if (ownerRes.error) throw ownerRes.error;
    ownerId = ownerRes.data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
      ownerId,
      `${NHAN} Owner`,
      emailOwner,
    ]);

    // --- Bộ A ---------------------------------------------------------
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Khách A`, soGia()],
      );
      custA = kh[0].id;
      const { rows: be } = await pg.query(
        `insert into babies (customer_id, full_name, nickname) values ($1,$2,$3) returning id`,
        [custA, `${NHAN} Bé A Nguyễn Văn`, "Bin"],
      );
      babyA = be[0].id;
      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, baby_id, title, status, drive_folder_id, drive_folder_url,
                                lark_contract_code, lark_contract_codes)
         values ($1,$2,$3,$4,'ready',$5,'https://example.com/x',$6,$7) returning id`,
        [branchId, custA, babyA, maHopDongA, `fixture-bb313a-${runId}`, maHopDongA, [maHopDongA]],
      );
      galA = g[0].id;
    }

    // --- Bộ B -----------------------------------------------------------
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Khách Thật B`, soGia()],
      );
      custB = kh[0].id;
      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url)
         values ($1,$2,$3,'ready',$4,'https://example.com/x') returning id`,
        [branchId, custB, `${NHAN} B raw title`, `fixture-bb313b-${runId}`],
      );
      galB = g[0].id;
    }

    // --- Bộ C (tên khách rỗng — CHỈ trường hợp này lùi về mã hợp đồng) ---
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, " ", soGia()],
      );
      custC = kh[0].id;
      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, lark_contract_code)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',$5) returning id`,
        [branchId, custC, maHopDongC, `fixture-bb313c-${runId}`, maHopDongC],
      );
      galC = g[0].id;
    }

    // --- Bộ D (mục 2 — thành phần hợp đồng sửa được) ---------------------
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Khách D`, soGia()],
      );
      custD = kh[0].id;
      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, lark_contract_code)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',$5) returning id`,
        [branchId, custD, `${NHAN} D`, `fixture-bb313d-${runId}`, maHopDongD],
      );
      galD = g[0].id;
      const { rows: cha } = await pg.query(
        `insert into gallery_items (gallery_id, product_id, quantity, unit_price, lark_contract_code, lark_record_id)
         values ($1,$2,1,2000000,$3,$4) returning id`,
        [galD, shootPackageProductId, maHopDongD, `fixture-bb313d-cha-${runId}`],
      );
      parentItemD = cha[0].id;
      const { rows: con } = await pg.query(
        `insert into gallery_items (gallery_id, product_id, parent_item_id, quantity, lark_contract_code, lark_record_id)
         values ($1,$2,$3,15,$4,$5) returning id`,
        [galD, editFileProductId, parentItemD, maHopDongD, `fixture-bb313d-con-${runId}`],
      );
      childItemD = con[0].id;
      // Dòng RIÊNG (dịch vụ, không đụng hạn mức ảnh) chỉ để canh "xoá có xác
      // nhận" + cảnh báo "đến từ hợp đồng Lark" — tách khỏi cặp cha/con ở
      // trên vì cặp đó bị TÁCH KHỎI LARK ngay sau bước sửa số lượng (đúng
      // thiết kế), nên không còn cảnh báo này khi xoá tiếp.
      const { rows: xoaTest } = await pg.query(
        `insert into gallery_items (gallery_id, product_id, quantity, unit_price, lark_contract_code, lark_record_id)
         values ($1,$2,1,300000,$3,$4) returning id`,
        [galD, serviceProductId, maHopDongD, `fixture-bb313d-xoa-${runId}`],
      );
      xoaTestItemD = xoaTest[0].id;
    }

    // --- Bộ E (mục 3 — trình thiết kế bìa) -------------------------------
    {
      const { rows: kh } = await pg.query(
        `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
        [branchId, `${NHAN} Khách E`, soGia()],
      );
      custE = kh[0].id;
      const { rows: be } = await pg.query(
        `insert into babies (customer_id, full_name, nickname) values ($1,$2,$3) returning id`,
        [custE, `${NHAN} Bé E`, "Sushi"],
      );
      babyE = be[0].id;
      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, baby_id, title, status, drive_folder_id, drive_folder_url,
                                photo_count, included_quota)
         values ($1,$2,$3,$4,'ready',$5,'https://example.com/x',6,10) returning id`,
        [branchId, custE, babyE, `${NHAN} E`, `fixture-bb313e-${runId}`],
      );
      galE = g[0].id;
      // BB-313 (chấm lại 28/09/2026, mục 1) — ảnh giả CẢ NGANG LẪN DỌC, có
      // width/height đúng tỉ lệ (KHÔNG ảnh bé thật, AGENTS.md §6): dọc 2:3
      // (1000×1500, đúng đề bài gốc) xen kẽ ngang 3:2 (1500×1000) — bìa
      // thường chọn ảnh DỌC làm ảnh chính nhưng dải "Vài khoảnh khắc trong
      // bộ" (bìa "Bên cạnh", máy tính) phải xếp được cả hai tỉ lệ.
      for (let i = 1; i <= 6; i++) {
        const doc = i % 2 === 1;
        const { rows: anh } = await pg.query(
          `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
           values ($1,$2,$3,'image/jpeg',$4,'active',$5,$6) returning id`,
          [galE, `bb313e-${runId}-${i}`, `BB313E_${String(i).padStart(3, "0")}.jpg`, i, doc ? 1000 : 1500, doc ? 1500 : 1000],
        );
        anhIdsE.push(anh[0].id);
      }
    }
  });

  test.afterAll(async () => {
    for (const galId of [galA, galB, galC, galD, galE]) {
      if (!galId) continue;
      await pg.query("delete from activity_logs where gallery_id = $1", [galId]).catch(() => {});
      await pg.query("delete from gallery_items where gallery_id = $1", [galId]).catch(() => {});
      await pg.query("delete from photos where gallery_id = $1", [galId]).catch(() => {});
      await pg.query("delete from galleries where id = $1", [galId]);
    }
    for (const babyId of [babyA, babyE]) {
      if (babyId) await pg.query("delete from babies where id = $1", [babyId]).catch(() => {});
    }
    for (const custId of [custA, custB, custC, custD, custE]) {
      if (custId) await pg.query("delete from customers where id = $1", [custId]).catch(() => {});
    }
    if (ownerId) await pg.query("delete from staff_profiles where id = $1", [ownerId]).catch(() => {});
    await pg.end();
    if (ownerId) await suKienAdmin().auth.admin.deleteUser(ownerId);
  });

  test("Mục 1a: có nickname → tiêu đề 'Bé Bin' (Playfair), mã hợp đồng CHỈ ở dòng phụ (không lặp), breadcrumb hiện đúng '#'", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(MAY_TINH);
    await dangNhapNhanVien(page, emailOwner, password);

    await page.goto(`/admin/galleries/${encodeURIComponent(maHopDongA)}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Trạng thái").first().waitFor({ state: "attached", timeout: 20_000 });

    const h1 = page.locator("h1").first();
    // BB-325 ("tên hiển thị" 29/09/2026) THAY luật cũ: tiêu đề quản trị là TÊN MẸ,
    // tên bé "Bé Bin" xuống dòng thông tin ngay dưới.
    await expect(h1).toHaveText(`${NHAN} Khách A`);
    await expect(page.getByText(/Bé Bin/).first()).toBeVisible();
    // Không lặp "Bé Bé" (BB-308 mục #8, vẫn phải đúng sau khi đổi sang tinhTieuDeBoAnhQuanTri).
    await expect(h1).not.toHaveText(/Bé Bé/);
    const fontHo = await h1.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontHo).toContain("Playfair");

    // Mã hợp đồng: đúng MỘT LẦN trong NỘI DUNG trang (dòng phụ dưới tiêu đề),
    // kèm nút chép — không đếm breadcrumb (điều hướng, không phải nội dung)
    // hay chip tên màn ẩn trên điện thoại (cùng chữ, không hiện ở khổ này).
    const dongMa = page.getByTestId("dong-ma-hop-dong");
    await expect(dongMa).toHaveCount(1);
    await expect(dongMa).toContainText(maHopDongA);
    await expect(dongMa.getByRole("button", { name: "Chép mã hợp đồng" })).toBeVisible();

    // Breadcrumb: đọc theo mã hợp đồng trên URL, phải hiện "#" chứ không "%23".
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb).toContainText(maHopDongA);
    await expect(breadcrumb).not.toContainText("%23");

    await chup(page, "1a-tieu-de-ten-be-may-tinh");
  });

  test("Mục 1b: không có bé nhưng có tên khách → tiêu đề là TÊN KHÁCH, không lùi thẳng về mã hợp đồng", async ({ page }) => {
    await page.setViewportSize(MAY_TINH);
    await dangNhapNhanVien(page, emailOwner, password);
    await page.goto(`/admin/galleries/${galB}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Trạng thái").first().waitFor({ state: "attached", timeout: 20_000 });

    const h1 = page.locator("h1").first();
    await expect(h1).toHaveText(`${NHAN} Khách Thật B`);
    await expect(h1).not.toHaveText(/raw title/);
  });

  test("Mục 1c: không tên bé lẫn tên khách → CHỈ LÚC ĐÓ lùi về mã hợp đồng, đổi phông (không Playfair)", async ({ page }) => {
    await page.setViewportSize(MAY_TINH);
    await dangNhapNhanVien(page, emailOwner, password);
    await page.goto(`/admin/galleries/${galC}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Trạng thái").first().waitFor({ state: "attached", timeout: 20_000 });

    const h1 = page.locator("h1").first();
    await expect(h1).toHaveText(maHopDongC);
    const fontHo = await h1.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontHo).not.toContain("Playfair");
    // Nút chép đứng NGAY CẠNH tiêu đề trong trường hợp này (không có dòng phụ lặp lại).
    await expect(h1.getByRole("button", { name: "Chép mã hợp đồng" })).toBeVisible();
    // Chỉ đúng MỘT lần trên trang — không lặp ở dòng phụ.
    await expect(page.getByText(maHopDongC, { exact: false })).toHaveCount(1);

    await chup(page, "1c-tieu-de-ma-hop-dong-khong-playfair");
  });

  test("Mục 2: sửa số lượng dòng hàng, hạn mức tính lại ngay, xoá có xác nhận, dòng tách khỏi Lark", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(MAY_TINH);
    await dangNhapNhanVien(page, emailOwner, password);
    await page.goto(`/admin/galleries/${galD}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Trạng thái").first().waitFor({ state: "attached", timeout: 20_000 });

    const theHanMuc = page.getByText("Khách đã chọn").locator("..");
    await expect(theHanMuc).toContainText("/ 15 tấm");

    // Sửa số lượng dòng CON "Edit file" 15 → 16 (đúng kịch bản báo cáo: khách
    // mua thêm 1 file, nhân viên xác nhận thu tiền xong nâng lên 16). Dòng
    // CHA (gói chụp) cũng có ô sửa số lượng CÙNG nhãn — phải chọn đúng dòng
    // CON qua chú thích "(đây là hạn mức ảnh)" chỉ gắn ở dòng edited_photo.
    // `li` ngoài (dòng cha) CŨNG khớp `hasText` vì chứa `li` con trong cây văn
    // bản của nó — lấy phần tử TRONG CÙNG (`.last()`) mới đúng dòng con.
    const dongConEditFile = page.locator("li", { hasText: "đây là hạn mức ảnh" }).last();
    const oSoLuong = dongConEditFile.getByLabel("Số ảnh trong gói");
    await oSoLuong.fill("16");
    await dongConEditFile.getByRole("button", { name: "lưu" }).click();

    await expect(page.getByText(/Hạn mức đã đổi: 15 → 16/)).toBeVisible({ timeout: 15_000 });
    await expect(theHanMuc).toContainText("/ 16 tấm");
    await chup(page, "2-sua-so-luong-han-muc-16");

    // Kiểm ngược qua DB: dòng con VÀ dòng cha phải đã TÁCH khỏi hợp đồng Lark
    // (lark_contract_code = null) — nếu không, lần đồng bộ Lark sau sẽ xoá
    // ghi đè mất số 16 vừa sửa (đọc chú thích PATCH, items/route.ts).
    const { rows: sauSua } = await pg.query(
      "select id, quantity, lark_contract_code from gallery_items where id in ($1,$2) order by id",
      [parentItemD, childItemD],
    );
    for (const r of sauSua) expect(r.lark_contract_code).toBeNull();
    const con = sauSua.find((r) => r.id === childItemD)!;
    expect(con.quantity).toBe(16);

    // Xoá phải hỏi lại. Dùng dòng RIÊNG `xoaTestItemD` (chưa đụng ở bước sửa
    // số lượng trên — cặp cha/con đã TÁCH khỏi Lark rồi nên không còn cảnh
    // báo "đến từ hợp đồng Lark" nữa, đúng thiết kế) — dòng này còn nguyên
    // `lark_contract_code`, nên xoá xong phải thấy cảnh báo đó. Nút "bỏ"
    // CUỐI CÙNG trên trang ứng với dòng thêm sau cùng trong `beforeAll`.
    const nutBoDongXoaTest = page.getByRole("button", { name: "Bỏ sản phẩm này" }).last();
    page.once("dialog", (d) => void d.dismiss());
    await nutBoDongXoaTest.click();
    await page.waitForTimeout(500);
    const { rows: vanCon } = await pg.query("select 1 from gallery_items where id = $1", [xoaTestItemD]);
    expect(vanCon.length).toBe(1);

    // Bấm lại và ĐỒNG Ý lần này — dòng biến mất, kèm cảnh báo Lark.
    page.once("dialog", (d) => void d.accept());
    await nutBoDongXoaTest.click();
    await expect(page.getByText(/Dòng này đến từ hợp đồng Lark/)).toBeVisible({ timeout: 15_000 });
    const { rows: daXoa } = await pg.query("select 1 from gallery_items where id = $1", [xoaTestItemD]);
    expect(daXoa.length).toBe(0);
  });

  for (const ten of ["dien-thoai", "may-tinh"] as const) {
    test(`Mục 3 (${ten}): trình thiết kế bìa — bấm ô lưới đổi ngay ảnh xem trước, không chữ đè kín ảnh`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(MAY_TINH); // trang quản trị luôn mở ở khổ máy tính thật — khung xem trước TỰ mô phỏng khổ điện thoại bên trong (không resize cửa sổ)
      await dangNhapNhanVien(page, emailOwner, password);
      await page.goto(`/admin/galleries/${galE}`, { waitUntil: "domcontentloaded" });
      await page.getByText("Trạng thái").first().waitFor({ state: "attached", timeout: 20_000 });

      await page.getByRole("button", { name: "Mở trình thiết kế bìa" }).click();
      const hopThoai = page.getByRole("dialog", { name: "Thiết kế bìa bộ ảnh" });
      await expect(hopThoai).toBeVisible();

      if (ten === "dien-thoai") {
        await hopThoai.getByRole("button", { name: "Điện thoại" }).click();
      } else {
        await hopThoai.getByRole("button", { name: "Máy tính" }).click();
      }

      // Chờ lưới ảnh tải xong rồi bấm Ô THỨ HAI.
      const luoi = hopThoai.locator("img[src*='/api/img/']").first();
      await luoi.waitFor({ state: "visible", timeout: 20_000 });
      const oAnh = hopThoai.locator("button:has(img[src*='/api/img/'])").nth(1);
      await oAnh.click();

      // (d) ô đang chọn có viền rõ.
      await expect(oAnh).toHaveClass(/border-\[var\(--bb-accent\)\]/);

      const khungXemTruoc = page.locator("[style*='container-type']");
      await expect(khungXemTruoc).toBeVisible();
      const anhBia = khungXemTruoc.locator("[data-testid='bia-khoi-anh']");
      const khoiChu = khungXemTruoc.locator("[data-testid='bia-khoi-chu']");
      await expect(anhBia).toBeVisible();
      await expect(khoiChu).toBeVisible();

      // (c) bấm ô lưới → xem trước đổi NGAY sang đúng ảnh đó.
      const idDaChon = await oAnh.evaluate((el) => el.querySelector("img")?.getAttribute("src"));
      const srcXemTruoc = await anhBia.locator("img").first().getAttribute("src");
      expect(srcXemTruoc?.split("?")[0]).toBe(idDaChon?.split("?")[0]);

      const hopAnh = await anhBia.boundingBox();
      const hopChu = await khoiChu.boundingBox();
      expect(hopAnh).not.toBeNull();
      expect(hopChu).not.toBeNull();

      if (ten === "may-tinh") {
        // (b) máy tính: hai cột TÁCH RIÊNG (ảnh phải, chữ trái theo BB-298) —
        // khối chữ có NỀN KEM riêng, không đè lên ảnh: hai hộp không chồng lấp
        // theo chiều ngang quá 4px (biên làm tròn số thực).
        const chongLapNgang = Math.min(hopAnh!.x + hopAnh!.width, hopChu!.x + hopChu!.width) - Math.max(hopAnh!.x, hopChu!.x);
        expect(chongLapNgang).toBeLessThan(4);
        // Ảnh không bị "phủ trắng mờ": khối ảnh phải chiếm phần LỚN chiều
        // rộng khung xem trước (không bị ép về 0).
        const khung = await khungXemTruoc.boundingBox();
        expect(hopAnh!.width).toBeGreaterThan(khung!.width * 0.3);
        // BB-313 (chấm lại 28/09/2026, mục 1, P0) — bìa từng chỉ cao ~40%
        // khung máy tính, phần còn lại là dải trắng lớn (min-height khối ảnh
        // rơi về nội dung cột chữ, không ghim theo khung mô phỏng — xem chú
        // thích `--bb-bia-khung-cao` ở bia-bo-anh.tsx). Nay bìa phải PHỦ KÍN
        // gần hết chiều cao khung — cho phép sai số nhỏ vì lưới ảnh xem trước
        // (border) làm khung hơi cao hơn nội dung một chút.
        expect(hopAnh!.height).toBeGreaterThan(khung!.height * 0.85);
      } else {
        // (a)/(b) điện thoại: ảnh TRÀN gần hết bề rộng khung (không bị đẩy
        // sang mép phải, còn lại một dải hẹp) — đúng lỗi "ảnh bị đẩy sang mép
        // phải" trong ảnh chụp app thật.
        const khung = await khungXemTruoc.boundingBox();
        expect(hopAnh!.width).toBeGreaterThan(khung!.width * 0.85);
        // Chữ tiêu đề không được cao hơn quá 70% khối ảnh (đè kín ảnh) — vẫn
        // cho phép đè MỘT PHẦN ở đáy theo đúng thiết kế tạp chí của bìa mobile.
        expect(hopChu!.height).toBeLessThan(hopAnh!.height * 0.7);
      }

      await chup(page, `3-${ten}-trinh-thiet-ke-bia`);
    });
  }

  // BB-313 (chấm lại 28/09/2026, mục 1) — "Làm luôn cho 3 bố cục còn lại
  // (Tạp chí, Tối giản, Đè chéo): dùng cùng lớp @container, để đổi bố cục
  // nào cũng không vỡ." Ba bố cục này không tách khối ảnh/khối chữ riêng
  // (`data-testid`) như "Bên cạnh" — chữ đè lên ẢNH NỀN toàn khung, nên canh
  // bằng CHÍNH `<section>` xem trước: phải PHỦ GẦN KÍN chiều cao khung mô
  // phỏng ở cả hai khổ (không còn dải trắng, không mất nội dung).
  const BON_BO_CUC = [
    { id: "tap-chi", nhan: "Tạp chí" },
    { id: "toi-gian", nhan: "Tối giản" },
    { id: "de-cheo", nhan: "Đè chéo" },
  ] as const;
  for (const boCuc of BON_BO_CUC) {
    for (const ten of ["dien-thoai", "may-tinh"] as const) {
      test(`Mục 3 (${boCuc.id}, ${ten}): bố cục "${boCuc.nhan}" phủ kín khung mô phỏng, không dải trắng`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.setViewportSize(MAY_TINH);
        await dangNhapNhanVien(page, emailOwner, password);
        await page.goto(`/admin/galleries/${galE}`, { waitUntil: "domcontentloaded" });
        await page.getByText("Trạng thái").first().waitFor({ state: "attached", timeout: 20_000 });

        await page.getByRole("button", { name: "Mở trình thiết kế bìa" }).click();
        const hopThoai = page.getByRole("dialog", { name: "Thiết kế bìa bộ ảnh" });
        await expect(hopThoai).toBeVisible();

        await hopThoai.getByRole("button", { name: boCuc.nhan, exact: true }).click();
        if (ten === "dien-thoai") {
          await hopThoai.getByRole("button", { name: "Điện thoại" }).click();
        } else {
          await hopThoai.getByRole("button", { name: "Máy tính" }).click();
        }

        const luoi = hopThoai.locator("img[src*='/api/img/']").first();
        await luoi.waitFor({ state: "visible", timeout: 20_000 });
        const oAnh = hopThoai.locator("button:has(img[src*='/api/img/'])").nth(1);
        await oAnh.click();

        const khungXemTruoc = page.locator("[style*='container-type']");
        await expect(khungXemTruoc).toBeVisible();
        const khoiBia = khungXemTruoc.locator("section").first();
        await expect(khoiBia).toBeVisible();
        await luoi.evaluate((img: HTMLImageElement) =>
          img.complete ? undefined : new Promise<void>((r) => img.addEventListener("load", () => r(), { once: true })),
        );

        const hopBia = await khoiBia.boundingBox();
        const khung = await khungXemTruoc.boundingBox();
        expect(hopBia).not.toBeNull();
        // Phủ gần kín chiều cao khung (không còn dải trắng lớn) VÀ không
        // TRÀN quá khung (mất do overflow-hidden cắt, đúng lỗi "mất chữ" cũ).
        expect(hopBia!.height).toBeGreaterThan(khung!.height * 0.85);
        expect(hopBia!.height).toBeLessThan(khung!.height * 1.15);

        await chup(page, `3-${boCuc.id}-${ten}-trinh-thiet-ke-bia`);
      });
    }
  }
});
