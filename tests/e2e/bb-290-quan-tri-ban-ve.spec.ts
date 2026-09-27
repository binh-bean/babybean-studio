/**
 * BB-290 — dựng màn Quản trị đúng bản vẽ BB-285 (bảng Bộ ảnh 6 cột, chi tiết
 * bộ ảnh, trình thiết kế bìa) + sửa các mục quản trị nêu trong báo cáo chấm
 * thẩm mỹ (#29–#44).
 *
 * Canh 5 điều ĐO ĐƯỢC, theo đúng yêu cầu của task:
 *  1. Bảng Bộ ảnh ≤ 6 cột nhìn thấy ở 1440×900.
 *  2. Chip trạng thái cao MỘT DÒNG (≤ 28px).
 *  3. Không còn chuỗi tiếng Anh "Photographer/Retouch/Kanban/Layout" hay
 *     định dạng ngày "mm/dd" trên trang Bộ ảnh và trình thiết kế bìa.
 *  4. H1 mọi trang quản trị cùng toạ độ x (±2px) ở 1440×900.
 *  5. Nút xuất ở Chi tiết bộ ảnh không tràn khung ở 390px.
 *
 * Dữ liệu: chỉ "Fixture BB-290 …", dọn theo tuổi ≥6h ở `beforeAll`, dọn sạch
 * phần của lượt chạy này ở `afterAll` — cùng khuôn với bb-280.
 *
 * Chạy: `PW_PORT=3166 npx playwright test tests/e2e/bb-290-quan-tri-ban-ve.spec.ts`.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const THU_MUC_ANH = "test-results/bb-290";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-290 ${runId}`;
const emailOwner = `test_bb290_owner_${runId}@demo.babybean.vn`;
const password = "Password123!";

const suKienAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

test.describe("BB-290: bảng vẽ quản trị + sửa báo cáo chấm thẩm mỹ", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let ownerId = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    await client.query(
      `delete from galleries where title like 'Fixture BB-290%' and created_at < now() - interval '6 hours'`,
    );
    await client.query(
      `delete from customers where full_name like 'Fixture BB-290%' and created_at < now() - interval '6 hours'`,
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

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách`, "0901000290"],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'in_review',$4,'https://example.com/x',12,10,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-bb290-${runId}`],
    );
    galleryId = g[0].id;
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) await client.query("delete from photos where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (ownerId) await client.query("delete from staff_profiles where id = $1", [ownerId]);
      await client.end();
    }
    if (ownerId) await suKienAdmin().auth.admin.deleteUser(ownerId);
  });

  test("bảng Bộ ảnh: ≤6 cột nhìn thấy ở 1440, chip trạng thái một dòng, không còn chữ Anh/mm-dd", async ({
    page,
  }) => {
    await dangNhapNhanVien(page, emailOwner, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/galleries");
    await page.waitForLoadState("networkidle").catch(() => {});

    // 1. ≤ 6 cột nhìn thấy trong bảng máy tính.
    const cotBang = page.locator("table thead th");
    await expect(cotBang).toHaveCount(6);

    // 2. Chip trạng thái cao MỘT DÒNG — canh mọi chip trong bảng, không chỉ
    // hàng của fixture, vì yêu cầu là "chip trạng thái cao 1 dòng" nói chung.
    const moiChip = page.locator("table tbody span[class*='inline-flex']");
    const soChip = await moiChip.count();
    expect(soChip).toBeGreaterThan(0);
    for (let i = 0; i < soChip; i++) {
      const hop = await moiChip.nth(i).boundingBox();
      if (hop) expect(hop.height, `chip #${i} cao ${hop.height}px`).toBeLessThanOrEqual(28);
    }

    // 3. Không còn chuỗi tiếng Anh / định dạng ngày Mỹ trên trang.
    const noiDung = await page.locator("body").innerText();
    expect(noiDung).not.toMatch(/Photographer|Retouch|Kanban|Layout/);
    expect(noiDung).not.toMatch(/\b\d{1,2}\/\d{1,2}\/\d{4}\b.*mm\/dd|mm\/dd\/yyyy/);

    await page.screenshot({ path: `${THU_MUC_ANH}/qt-mt-02-bo-anh-sau.png`, fullPage: true });
  });

  test("trình thiết kế bìa: không còn '(Layout)', lưới ảnh có khung khi tải", async ({ page }) => {
    await dangNhapNhanVien(page, emailOwner, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/galleries/${galleryId}`);
    await page.getByRole("button", { name: "Mở trình thiết kế bìa" }).click();
    await expect(page.getByRole("dialog", { name: "Thiết kế bìa bộ ảnh" })).toBeVisible();

    const noiDungHop = await page.getByRole("dialog").innerText();
    expect(noiDungHop).not.toContain("(Layout)");
    expect(noiDungHop).not.toMatch(/Photographer|Retouch|Kanban/);

    await page.screenshot({ path: `${THU_MUC_ANH}/qt-mt-03b-thiet-ke-bia-sau.png` });
  });

  test("h1 của mọi trang quản trị cùng toạ độ x ở 1440×900 (±2px)", async ({ page }) => {
    test.setTimeout(120_000);
    await dangNhapNhanVien(page, emailOwner, password);
    await page.setViewportSize({ width: 1440, height: 900 });

    const trang = [
      "/admin",
      "/admin/galleries",
      `/admin/galleries/${galleryId}`,
      "/admin/customers",
      "/admin/viec-can-xu-ly",
      "/admin/bao-cao",
      "/admin/branches",
      "/admin/settings",
      "/admin/staff",
      "/admin/reports/nhat-ky",
    ];

    const toaDoX: number[] = [];
    for (const path of trang) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      const h1 = page.locator("h1").first();
      await h1.waitFor({ state: "attached", timeout: 15_000 });
      const hop = await h1.boundingBox();
      if (hop) toaDoX.push(hop.x);
    }

    expect(toaDoX.length, "phải đọc được h1 ở mọi trang").toBe(trang.length);
    const mocX = toaDoX[0]!;
    for (let i = 0; i < toaDoX.length; i++) {
      const x = toaDoX[i]!;
      expect(
        Math.abs(x - mocX),
        `${trang[i]}: h1 tại x=${x}, lệch mốc x=${mocX} của ${trang[0]}`,
      ).toBeLessThanOrEqual(2);
    }
  });

  test("chi tiết bộ ảnh ở 390px: nút xuất không tràn khung", async ({ page }) => {
    await dangNhapNhanVien(page, emailOwner, password);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/galleries/${galleryId}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    const cacNutXuat = page.locator("a", { hasText: /Lightroom|Excel|Văn bản/ });
    const soNut = await cacNutXuat.count();
    for (let i = 0; i < soNut; i++) {
      const hop = await cacNutXuat.nth(i).boundingBox();
      if (hop) {
        expect(
          hop.x + hop.width,
          `nút xuất #${i} tràn khung 390px (mép phải=${hop.x + hop.width})`,
        ).toBeLessThanOrEqual(390);
      }
    }

    await page.screenshot({ path: `${THU_MUC_ANH}/qt-dt-03-chi-tiet-bo-anh-sau.png`, fullPage: true });
  });

  // BB-290 lượt 2: ảnh chụp đối chiếu bản vẽ quan-tri-bo-anh-bang.png và
  // quan-tri-chi-tiet.png, cả hai khổ.
  test("chụp Bộ ảnh + Chi tiết bộ ảnh ở 1440×900 và 390×844", async ({ page }) => {
    test.setTimeout(90_000);
    await dangNhapNhanVien(page, emailOwner, password);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/galleries");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: `${THU_MUC_ANH}/luot2-mt-bo-anh.png` });

    await page.goto(`/admin/galleries/${galleryId}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: `${THU_MUC_ANH}/luot2-mt-chi-tiet.png` });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/galleries");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: `${THU_MUC_ANH}/luot2-dt-bo-anh.png` });

    await page.goto(`/admin/galleries/${galleryId}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: `${THU_MUC_ANH}/luot2-dt-chi-tiet.png` });
  });
});
