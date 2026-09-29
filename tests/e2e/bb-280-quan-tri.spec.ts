/**
 * BB-280 — sắp xếp lại menu quản trị theo tư duy quản trị hệ thống + thống
 * nhất cỡ chữ tiêu đề trang.
 *
 * Bốn điều canh:
 *  1. Sidebar có đúng bốn nhóm, đúng thứ tự (Tổng quan/Vận hành/Báo cáo/Hệ
 *     thống) — với vai owner (thấy trọn menu).
 *  2. Đường dẫn cũ (/admin/reports/*, /admin/roles) vẫn chuyển hướng đúng
 *     tab/trang mới, không phải 404.
 *  3. photoshop_ctv không thấy các mục hệ thống bị khoá (Nhân sự & vai trò,
 *     Cài đặt, Nhật ký thao tác, Báo cáo điều hành) — RÀNG BUỘC QUYỀN giữ
 *     nguyên như trước BB-280, chỉ đổi chỗ đặt trong cây menu. (Lưu ý: "Chi
 *     nhánh" KHÔNG bị ẩn với vai nào — ai cũng xem được danh sách chi nhánh,
 *     xem docs/05-rbac.md §2 — nên nhóm "Hệ thống" không ẩn hoàn toàn với
 *     photoshop_ctv. Việc lọc mục RỖNG-thì-ẩn-nhóm được canh riêng bằng đơn vị
 *     ở tests/unit/admin-sidebar-menu.test.ts, vì không có vai thật nào hiện
 *     có làm cả nhóm Hệ thống trống.)
 *  4. Tiêu đề trang (`<h1>` của `PageHeader`) CÙNG MỘT `font-size` tính bằng
 *     `getComputedStyle`, đo ở 1440×900 và ở 390×844, trên mọi trang quản trị.
 *
 * Dữ liệu: chỉ "Fixture BB-280 …", dọn theo id + tuổi ≥6h ở đầu `beforeAll`,
 * dọn sạch phần của lượt chạy này ở `afterAll`.
 *
 * Chạy: `PW_PORT=3167 npx playwright test tests/e2e/bb-280-quan-tri.spec.ts`.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const THU_MUC_ANH = "test-results/bb-280";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-280 ${runId}`;
const emailOwner = `test_bb280_owner_${runId}@demo.babybean.vn`;
const emailCtv = `test_bb280_ctv_${runId}@demo.babybean.vn`;
const password = "Password123!";

const suKienAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

test.describe("BB-280: menu quản trị + thang chữ", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let ownerId = "";
  let ctvId = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    // Rác của lần chạy cũ hơn sáu giờ.
    await client.query(
      `delete from galleries where title like 'Fixture BB-280%' and created_at < now() - interval '6 hours'`,
    );
    await client.query(
      `delete from customers where full_name like 'Fixture BB-280%' and created_at < now() - interval '6 hours'`,
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

    const ctvRes = await suKienAdmin().auth.admin.createUser({
      email: emailCtv,
      password,
      email_confirm: true,
    });
    if (ctvRes.error) throw ctvRes.error;
    ctvId = ctvRes.data.user!.id;
    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'photoshop_ctv')`,
      [ctvId, `${NHAN} Ctv`, emailCtv],
    );
    await client.query(
      `insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`,
      [ctvId, branchId],
    );

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách`, "0901000280"],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',2,5,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-bb280-${runId}`],
    );
    galleryId = g[0].id;
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) await client.query("delete from photos where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (ctvId) await client.query("delete from staff_branches where staff_id = $1", [ctvId]);
      if (ctvId) await client.query("delete from staff_profiles where id = $1", [ctvId]);
      if (ownerId) await client.query("delete from staff_profiles where id = $1", [ownerId]);
      await client.end();
    }
    if (ctvId) await suKienAdmin().auth.admin.deleteUser(ctvId);
    if (ownerId) await suKienAdmin().auth.admin.deleteUser(ownerId);
  });

  test("sidebar có đúng bốn nhóm, đúng thứ tự (vai owner)", async ({ page }) => {
    await dangNhapNhanVien(page, emailOwner, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin");

    // Tiêu đề nhóm nhỏ, chỉ trong <aside> (sidebar máy tính) — Sheet menu điện
    // thoại dùng lại cùng `<NavLinks>` nhưng nằm trong hộp thoại riêng.
    const nhomHeadings = page.locator("aside").getByTestId("nav-group-label");
    await expect(nhomHeadings.first()).toBeVisible();
    const tenNhom = await nhomHeadings.allTextContents();
    expect(tenNhom.map((s) => s.trim())).toEqual(["Tổng quan", "Vận hành", "Báo cáo", "Hệ thống"]);

    // Mục "Nhân sự & vai trò" đã gộp — không còn "Vai trò" rời.
    await expect(page.getByRole("link", { name: "Nhân sự & vai trò" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Vai trò", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Việc cần xử lý" })).toBeVisible();

    await page.screenshot({ path: `${THU_MUC_ANH}/sau-sidebar-owner.png`, fullPage: true });
  });

  test("đường dẫn cũ chuyển hướng đúng trang/tab mới", async ({ page }) => {
    await dangNhapNhanVien(page, emailOwner, password);

    await page.goto("/admin/reports/loi-dong-bo");
    await expect(page).toHaveURL(/\/admin\/viec-can-xu-ly\?tab=loi-dong-bo/);

    await page.goto("/admin/reports/link-sap-het-han");
    await expect(page).toHaveURL(/\/admin\/viec-can-xu-ly\?tab=link-sap-het-han/);

    await page.goto("/admin/reports/over-quota");
    await expect(page).toHaveURL(/\/admin\/viec-can-xu-ly\?tab=over-quota/);

    await page.goto("/admin/roles");
    await expect(page).toHaveURL(/\/admin\/staff\?tab=vai-tro/);
    // Trang đích thật sự mở đúng tab, không phải chỉ đổi URL rồi trơ.
    await expect(page.getByRole("tab", { name: "Vai trò" })).toHaveAttribute("aria-selected", "true");
  });

  test("photoshop_ctv không thấy các mục hệ thống bị khoá", async ({ page }) => {
    await dangNhapNhanVien(page, emailCtv, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin");

    await expect(page.getByRole("link", { name: "Nhân sự & vai trò" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Cài đặt" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Nhật ký thao tác" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Báo cáo điều hành" })).toHaveCount(0);

    // Vẫn thấy việc của mình: Bộ ảnh, và "Việc cần xử lý" (chỉ tab Ảnh vượt
    // hạn mức bên trong — hai tab kia bị khoá, giữ nguyên luật cũ).
    await expect(page.getByRole("link", { name: "Quản lý bộ ảnh" })).toBeVisible();
    await page.getByRole("link", { name: "Việc cần xử lý" }).click();
    await page.waitForURL("**/admin/viec-can-xu-ly*");
    await expect(page.getByRole("tab", { name: /Ảnh vượt hạn mức/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Bộ ảnh lỗi tải/ })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Link sắp hết hạn/ })).toHaveCount(0);

    await page.screenshot({ path: `${THU_MUC_ANH}/sau-viec-can-xu-ly-ctv.png`, fullPage: true });
  });

  // BB-283, điểm 1 (chỉnh lại sau soát 27/09/2026): huy hiệu sidebar VÀ khối
  // "Cần xử lý ngay" ở Bảng điều khiển giờ đọc CÙNG một công thức
  // (`src/lib/utils/can-xu-ly.ts`) — gộp GET /api/admin/can-xu-ly (lỗi Drive
  // + chưa có ảnh) với GET /api/admin/dashboard (dueSoon/overdue). Chặn CẢ
  // HAI route để canh chính xác, không phụ thuộc dữ liệu thật lúc CI chạy.
  async function chanCanXuLy(
    page: import("@playwright/test").Page,
    canXuLy: { driveChuaChiaSe: unknown[]; chuaCoAnh: unknown[] },
    dueSoon = 0,
    overdue = 0,
  ) {
    await page.route("**/api/admin/can-xu-ly*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: canXuLy }) })
    );
    await page.route("**/api/admin/dashboard*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            stats: {
              waitingForSelection: 5,
              dueSoon,
              overdue,
              waitingForRetouch: 2,
              deliveredThisMonth: 10,
              totalGalleries: 20,
            },
            soSanhKy: {},
            tienDoChiNhanh: [],
            actionRequired: [],
            chartData: [],
          },
        }),
      })
    );
  }

  test("huy hiệu 'Việc cần xử lý' hiện đúng số khi API trả >0, ẩn khi trả 0", async ({ page }) => {
    await dangNhapNhanVien(page, emailOwner, password);
    await page.setViewportSize({ width: 1440, height: 900 });

    await chanCanXuLy(page, {
      driveChuaChiaSe: [{ id: "x1" }, { id: "x2" }],
      chuaCoAnh: [{ id: "x3" }],
    });
    await page.goto("/admin");
    const huyHieu = page.locator("aside").getByTestId("badge-viec-can-xu-ly");
    await expect(huyHieu).toBeVisible();
    await expect(huyHieu).toHaveText("3");
    await page.screenshot({ path: `${THU_MUC_ANH}/sau-huy-hieu-can-xu-ly.png` });

    // Trả 0 việc ở CẢ hai nguồn — huy hiệu phải biến mất, không hiện "0".
    await chanCanXuLy(page, { driveChuaChiaSe: [], chuaCoAnh: [] });
    await page.goto("/admin");
    await expect(page.locator("aside").getByTestId("badge-viec-can-xu-ly")).toHaveCount(0);
  });

  // Điểm 1 của phản hồi giám đốc 27/09/2026: khối "Cần xử lý ngay" phải khớp
  // huy hiệu — không còn một khối nói "không có gì" trong khi huy hiệu báo
  // có việc. Canh cả TỔNG các dòng lẫn số của từng loại.
  test("khối 'Cần xử lý ngay' ở Bảng điều khiển: tổng các dòng khớp ĐÚNG số trên huy hiệu", async ({
    page,
  }) => {
    await dangNhapNhanVien(page, emailOwner, password);
    await page.setViewportSize({ width: 1440, height: 900 });

    await chanCanXuLy(
      page,
      { driveChuaChiaSe: [{ id: "x1" }, { id: "x2" }], chuaCoAnh: [{ id: "x3" }] },
      4,
      2,
    );
    await page.goto("/admin");

    const huyHieu = page.locator("aside").getByTestId("badge-viec-can-xu-ly");
    await expect(huyHieu).toHaveText("9"); // 2 + 1 + 4 + 2

    const dong = page.getByTestId("can-xu-ly-ngay-rows").locator("li");
    await expect(dong).toHaveCount(3);
    await expect(page.getByRole("link", { name: /Bộ ảnh lỗi tải Drive/ })).toContainText("2");
    await expect(page.getByRole("link", { name: /Bộ ảnh chưa có ảnh/ })).toContainText("1");
    await expect(page.getByRole("link", { name: /Sắp hết hạn chọn/ })).toContainText("6"); // 4 + 2

    // BB-303 (luật phông 28/09/2026): số dòng đổi từ `.font-mono` sang
    // `.tabular-nums` (Be Vietnam Pro) — không còn phông đơn cách trong khu
    // quản trị, xem dashboard.tsx.
    const soCacDong = await dong.evaluateAll((els) =>
      els.map((el) => Number(el.querySelector(".tabular-nums")?.textContent?.trim() || "0"))
    );
    const tongDong = soCacDong.reduce((a, b) => a + b, 0);
    expect(tongDong).toBe(9);
    await expect(huyHieu).toHaveText(String(tongDong));
  });

  test("h1 của PageHeader cùng font-size ở 1440×900 và 390×844, trên mọi trang quản trị", async ({
    page,
  }) => {
    // BB-303: nới từ 180s lên 240s. Phép thử này đã CHẠM TRẦN cũ ngay trên
    // nền sạch (đo 28/09/2026: 2,8-2,9 phút/3 phút) — tải 11 trang × 2 cỡ máy
    // qua bb-dev thật, mỗi trang gọi `/api/admin/dashboard` (huy hiệu sidebar)
    // + route riêng của trang. BB-303 thêm "Việc hôm nay"/"Mua thêm 7 ngày"
    // cho ĐÚNG MỘT trang (Bảng điều khiển) — đã tách qua `?full=1` để các
    // trang còn lại không trả giá (xem `canDayDu` ở route.ts), nhưng lượt gọi
    // `full=1` của chính trang Bảng điều khiển giờ nặng hơn trước (~1-2s,
    // đọc thêm selections/selection_addons/babies/packages/customers) — đủ
    // để một phép thử vốn đã sát trần cũ vượt ngưỡng. Không đổi phép thử đo
    // GÌ, chỉ đổi NGÂN SÁCH thời gian cho hợp với một trang có thêm việc thật
    // để làm.
    test.setTimeout(240_000);
    await dangNhapNhanVien(page, emailOwner, password);

    const trang = [
      "/admin",
      "/admin/galleries",
      "/admin/galleries/create",
      `/admin/galleries/${galleryId}`,
      "/admin/customers",
      "/admin/viec-can-xu-ly",
      "/admin/bao-cao",
      "/admin/branches",
      "/admin/staff",
      "/admin/settings",
      "/admin/reports/nhat-ky",
    ];

    async function coH1FontSize(path: string, kichThuoc: { width: number; height: number }) {
      await page.setViewportSize(kichThuoc);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      const h1 = page.locator("h1").first();
      await h1.waitFor({ state: "attached", timeout: 15_000 });
      return h1.evaluate((el) => window.getComputedStyle(el).fontSize);
    }

    const loiLech: string[] = [];
    for (const path of trang) {
      const desktop = await coH1FontSize(path, { width: 1440, height: 900 });
      const dienThoai = await coH1FontSize(path, { width: 390, height: 844 });
      if (desktop !== dienThoai) {
        loiLech.push(`${path}: máy tính=${desktop} khác điện thoại=${dienThoai}`);
      }
      // Cùng luôn phải khớp cỡ đã chốt (24px = 1.5rem tuỳ base font, so bằng
      // giá trị máy tính của TRANG ĐẦU làm mốc — không hardcode "24px" vì cỡ
      // gốc phụ thuộc `font-size` gốc của <html>).
    }

    expect(loiLech, `Các trang lệch font-size h1 giữa hai kích thước màn hình:\n${loiLech.join("\n")}`).toEqual(
      [],
    );

    // Và mọi trang phải khớp NHAU (không chỉ khớp với chính nó qua hai kích
    // thước) — tức toàn hệ thống dùng đúng MỘT cỡ tiêu đề trang.
    const cacCoChu = new Set<string>();
    for (const path of trang) {
      cacCoChu.add(await coH1FontSize(path, { width: 1440, height: 900 }));
    }
    expect([...cacCoChu], "Các trang quản trị phải dùng chung một cỡ h1").toHaveLength(1);
  });
});
