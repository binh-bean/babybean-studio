/**
 * BB-294 — màn quản trị: sửa các mục thẩm mỹ nêu trong báo cáo chấm độc lập
 * (4-cham-lai-doc-lap.md, mục 3 "25 việc" + bảng 44 mục cũ).
 *
 * Canh những điều ĐO ĐƯỢC:
 *  1. (#2, P0) Chi tiết bộ ảnh: thẻ "Mua thêm" hiện ĐÚNG tổng mua thêm thật
 *     của lần chốt (từ `selection_addons`), KHÔNG phải tiền vượt hạn mức —
 *     dán fixture chốt có mua thêm 60.000đ, dán phản hồi API thật.
 *  2. (#18, mục cũ #36) Chốt lúc không tràn thẻ ở 390px.
 *  3. (#19) Nút chính trong quản trị là MỘT màu mực (#2E2A27), không còn
 *     san hô/hồng — đo `background-color` tính toán thật của trình duyệt.
 *  4. (#17) Tên khách trên điện thoại không bị ép hẹp bởi chi nhánh cùng
 *     hàng — chi nhánh nằm ở hàng dưới, cùng hàng với SĐT.
 *
 * Dữ liệu: chỉ "Fixture BB-294 …", dọn theo tuổi ≥6h ở `beforeAll`, dọn sạch
 * phần của lượt chạy này ở `afterAll`.
 *
 * Chạy: `PW_PORT=3168 npx playwright test tests/e2e/bb-294-quan-tri.spec.ts`.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const THU_MUC_ANH = "test-results/bb-294";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-294 ${runId}`;
const emailOwner = `test_bb294_owner_${runId}@demo.babybean.vn`;
const password = "Password123!";

const suKienAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

test.describe("BB-294: màn quản trị — sửa mục thẩm mỹ chấm độc lập", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let customerId2 = "";
  let galleryId = "";
  let ownerId = "";
  let shareLinkId = "";
  let selectionId = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    await client.query(
      `delete from galleries where title like 'Fixture BB-294%' and created_at < now() - interval '6 hours'`,
    );
    await client.query(
      `delete from customers where full_name like 'Fixture BB-294%' and created_at < now() - interval '6 hours'`,
    );

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const ownerRes = await suKienAdmin().auth.admin.createUser({
      email: emailOwner,
      password,
      email_confirm: true,
    });
    if (ownerRes.error) throw ownerRes.error;
    ownerId = ownerRes.data.user!.id;
    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`,
      [ownerId, `${NHAN} Owner`, emailOwner],
    );

    // Khách #1 — bộ ảnh ĐÃ CHỐT, KHÔNG vượt hạn mức (snapshot_extra_amount=0)
    // nhưng có mua thêm 3 món x 20.000đ = 60.000đ ở `selection_addons` — đúng
    // ca người chấm độc lập ghi lại ("Mua thêm 3 món · 60.000 ₫" ở màn khách,
    // "Mua thêm 0 ₫" sai ở màn quản trị trước bản vá này).
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách`, "0901000294"],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, submitted_at)
       values ($1,$2,$3,'submitted',$4,'https://example.com/x',12, now()) returning id`,
      [branchId, customerId, NHAN, `fixture-bb294-${runId}`],
    );
    galleryId = g[0].id;

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb294x', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkId = lk[0].id;

    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, snapshot_extra_amount)
       values ($1,$2,true, now(), 0) returning id`,
      [galleryId, shareLinkId],
    );
    selectionId = sel[0].id;

    const { rows: sp } = await client.query(`select id from products where is_active limit 1`);
    await client.query(
      `insert into selection_addons (selection_id, product_id, quantity, unit_price)
       values ($1,$2,3,20000)`,
      [selectionId, sp[0].id],
    );

    // Khách #2 — chỉ để phép thử #17: tên khách kèm chi nhánh trên điện thoại.
    const { rows: kh2 } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Nguyễn Thị Phương Thảo Khách Hai`, "0901000295"],
    );
    customerId2 = kh2[0].id;
  });

  test.afterAll(async () => {
    if (client) {
      if (selectionId) await client.query("delete from selection_addons where selection_id = $1", [selectionId]);
      if (galleryId) await client.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from share_links where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (customerId2) await client.query("delete from customers where id = $1", [customerId2]);
      if (ownerId) await client.query("delete from staff_profiles where id = $1", [ownerId]);
      await client.end();
    }
    if (ownerId) await suKienAdmin().auth.admin.deleteUser(ownerId);
  });

  test("#2 P0: thẻ Mua thêm hiện đúng tổng selection_addons (60.000 ₫), không phải dueAmount (0)", async ({
    page,
  }) => {
    await dangNhapNhanVien(page, emailOwner, password);

    const phanHoi = await page.request.get(`/api/admin/galleries/${galleryId}/items`, {
      headers: { cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ") },
    });
    const json = await phanHoi.json();
    // Phản hồi API THẬT — dán vào bàn giao.
    // eslint-disable-next-line no-console
    console.log("BB-294 #2 — GET items:", JSON.stringify({ dueAmount: json.data?.dueAmount, addonsAmount: json.data?.addonsAmount }));
    expect(json.data.dueAmount).toBe(0);
    expect(json.data.addonsAmount).toBe(60000);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/galleries/${galleryId}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    // Thẻ "Mua thêm" hiện đúng 60.000 ₫ — KHÔNG phải "0 ₫" trần (chú ý:
    // "60.000 ₫" tự nó CHỨA chuỗi con "0 ₫" ở cuối, nên không thể dùng
    // `not.toContainText("0 ₫")` — phải khớp đúng dạng số tiền hiện có.
    // BB-307: BB-296 mục #6 thêm khối chi tiết "Mua thêm" (h2) bên dưới —
    // giờ có HAI chỗ chứa chữ "Mua thêm" trên trang (thẻ số liệu đầu trang +
    // khối chi tiết), nên `text=Mua thêm` một mình khớp 2 phần tử (strict
    // mode). `.first()` giữ đúng ý canh cũ: thẻ số liệu đầu trang, đứng
    // trước trong DOM.
    const theMuaThem = page.locator("text=Mua thêm").first().locator("..").locator("..");
    await expect(theMuaThem).toContainText("60.000");
    await expect(theMuaThem).not.toContainText(/Mua thêm\s*0\s*₫/);

    await page.screenshot({ path: `${THU_MUC_ANH}/02-mt-chi-tiet-mua-them-sau.png`, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: `${THU_MUC_ANH}/02-dt-chi-tiet-mua-them-sau.png`, fullPage: true });
  });

  test("#18 + mục cũ #36: Chốt lúc không tràn thẻ ở 390px", async ({ page }) => {
    await dangNhapNhanVien(page, emailOwner, password);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/galleries/${galleryId}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    const theChotLuc = page.locator("text=Chốt lúc").locator("..").locator("..");
    const hopThe = await theChotLuc.boundingBox();
    const hopNoiDung = await theChotLuc.locator("div").last().boundingBox();
    expect(hopThe, "không tìm thấy thẻ Chốt lúc").not.toBeNull();
    if (hopThe && hopNoiDung) {
      expect(
        hopNoiDung.x + hopNoiDung.width,
        `nội dung "Chốt lúc" tràn khỏi mép phải thẻ (mép thẻ=${hopThe.x + hopThe.width}, mép nội dung=${hopNoiDung.x + hopNoiDung.width})`,
      ).toBeLessThanOrEqual(hopThe.x + hopThe.width + 1);
    }

    await page.screenshot({ path: `${THU_MUC_ANH}/18-dt-chot-luc-sau.png`, fullPage: true });
  });

  test("#19: nút chính trong quản trị là màu mực #2E2A27, không phải hồng đất", async ({ page }) => {
    await dangNhapNhanVien(page, emailOwner, password);
    // Nút "Tạo bộ ảnh" ở gallery-filters.tsx (`lg:hidden`, KHÔNG override
    // className — đúng ca để canh luật CSS `.giao-dien-quan-tri button.bg-…`
    // trong tokens.css) chỉ hiện dưới 1024px; nút ở bo-anh-page-header.tsx đã
    // tự vá màu riêng từ trước (không canh được quy tắc chung này).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/galleries");
    await page.waitForLoadState("networkidle").catch(() => {});

    const nutTaoBoAnh = page.getByRole("button", { name: /Tạo bộ ảnh/i }).first();
    await expect(nutTaoBoAnh).toBeVisible();
    const mau = await nutTaoBoAnh.evaluate((el) => getComputedStyle(el).backgroundColor);
    // #2E2A27 = rgb(46, 42, 39)
    expect(mau, `màu nút "Tạo bộ ảnh" = ${mau}, kỳ vọng mực rgb(46, 42, 39)`).toBe("rgb(46, 42, 39)");

    await page.screenshot({ path: `${THU_MUC_ANH}/19-dt-nut-chinh-sau.png` });
  });

  test("#17: tên khách điện thoại không bị ép hẹp — chi nhánh xuống hàng dưới cùng SĐT", async ({ page }) => {
    await dangNhapNhanVien(page, emailOwner, password);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle").catch(() => {});

    const theKhach = page.locator("li", { hasText: `${NHAN} Nguyễn Thị Phương Thảo Khách Hai` }).first();
    await expect(theKhach).toBeVisible();
    const tenSpan = theKhach.locator("div.line-clamp-2").first();
    const hopTen = await tenSpan.boundingBox();
    // Tên không còn bị ép còn ~70px (báo cáo #17) — phải rộng hơn nhiều so
    // với ngưỡng đó khi chiếm trọn bề rộng thẻ.
    expect(hopTen?.width ?? 0, `bề rộng khối tên = ${hopTen?.width}`).toBeGreaterThan(150);
    // SĐT và tên chi nhánh cùng nằm ở HÀNG DƯỚI tên (không còn cạnh nhau
    // ngang hàng với tên).
    // BB-303 (luật phông + khach-hang.png): SĐT giờ hiện nhóm 4-3-3
    // ("0901 000 295"), không còn liền số — xem formatSdt().
    await expect(theKhach).toContainText("0901 000 295");

    await page.screenshot({ path: `${THU_MUC_ANH}/17-dt-khach-hang-sau.png`, fullPage: true });
  });
});
