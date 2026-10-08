/**
 * BB-294 vòng 2 — CHỈ để chụp ảnh bằng chứng cho các mục đã sửa, KHÔNG nộp
 * làm phép thử canh hồi quy (xem tests/e2e/bb-294-quan-tri.spec.ts cho phần
 * đó). Lý do có file riêng: `test-results/` bị Playwright xoá mỗi lần chạy,
 * nên ảnh phải ghi ra NGOÀI thư mục dự án — chủ dự án yêu cầu lưu tại
 * `C:\Users\binh\Downloads\claude code\babybean-assets\BB-294\chup\`.
 *
 * Ảnh trong lưới: chặn /api/img ở TRÌNH DUYỆT, trả SVG màu nước trừu tượng —
 * kỹ thuật giống hệt tests/e2e/zz-danh-gia-2.spec.ts (worktree danhgia2) — để
 * lưới/xem trước bìa hiện được bố cục thật thay vì ảnh vỡ (drive_file_id giả
 * của fixture không trỏ tới file thật trên Drive).
 *
 * Dữ liệu: chỉ "Fixture BB-294 …", dọn theo tuổi ≥6h ở beforeAll, dọn sạch
 * phần của lượt chạy này ở afterAll.
 *
 * Chạy: `PW_PORT=3168 npx playwright test tests/e2e/bb-294-chup-lai.spec.ts --workers=1`
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const DIR = "C:\\Users\\binh\\Downloads\\claude code\\babybean-assets\\BB-294\\chup";
fs.mkdirSync(DIR, { recursive: true });

const runId = Math.random().toString(36).slice(2, 8);
const NHAN = `Fixture BB-294 ${runId}`;
const emailOwner = `test_bb294b_owner_${runId}@demo.babybean.vn`;
const password = "Password123!";

const KT = {
  dt: { width: 390, height: 844 },
  mt: { width: 1440, height: 900 },
} as const;

const suKienAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

const MAU = [
  ["#F3E6DC", "#E8A598", "#C4645A"],
  ["#EEF1EA", "#7FA99B", "#4F5B45"],
  ["#F7EFE6", "#D9C2A7", "#8C6E54"],
  ["#EDE7F0", "#C9B7CF", "#7E6A86"],
];
function svgAnh(i: number): string {
  const [a, b, c] = MAU[i % MAU.length]!;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
<defs><radialGradient id="g" cx="40%" cy="35%" r="75%">
<stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></radialGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/></svg>`;
}

async function datAnhGia(page: Page) {
  let dem = 0;
  await page.route(
    (url) => url.pathname.startsWith("/api/img/") || url.href.includes("api%2Fimg"),
    async (route) => {
      await route.fulfill({ status: 200, contentType: "image/svg+xml", body: svgAnh(dem++) });
    },
  );
}

/** Chụp toàn bộ nội dung khung `main` (cuộn RIÊNG, không phải cuộn trang) —
 * khác `fullPage` của Playwright (chỉ cuộn document, ở đây document không
 * cuộn, chỉ `<main>` cuộn). */
async function chupMain(page: Page, ten: string) {
  await page.waitForTimeout(400);
  const main = page.locator("main").first();
  await main.screenshot({ path: `${DIR}/${ten}.png` });
  console.log(`CHỤP ${ten}.png`);
}

async function chupTrang(page: Page, ten: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${ten}.png` });
  console.log(`CHỤP ${ten}.png`);
}

test.describe("BB-294 vòng 2: chụp ảnh bằng chứng", () => {
  let client: Client;
  let branchId = "";
  let branchTrongId = "";
  let customerId = "";
  let customerId2 = "";
  let galleryId = "";
  let ownerId = "";
  let shareLinkId = "";
  let selectionId = "";
  const anh: string[] = [];

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    await client.query(
      `delete from galleries where title like 'Fixture BB-294%' and created_at < now() - interval '6 hours'`,
    );
    await client.query(
      `delete from customers where full_name like 'Fixture BB-294%' and created_at < now() - interval '6 hours'`,
    );
    await client.query(
      `delete from branches where code like 'FIXTURE-BB294B-%' and created_at < now() - interval '6 hours'`,
    );

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: brTrong } = await client.query(
      `insert into branches (code, name) values ($1,$2) returning id`,
      [`FIXTURE-BB294B-${runId}`, `${NHAN} Chi nhánh trống`],
    );
    branchTrongId = brTrong[0].id;

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

    // Khách #1 — bộ ảnh ĐÃ CHỐT, có mua thêm 60.000đ (selection_addons),
    // KHÔNG vượt hạn mức (dueAmount=0) — ca #2/#18/#36. Kèm 10 ảnh thật trong
    // `photos` để lưới trình thiết kế bìa (#9) có nội dung.
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách`, "0901000294"],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, submitted_at)
       values ($1,$2,$3,'submitted',$4,'https://example.com/x',10, now()) returning id`,
      [branchId, customerId, NHAN, `fixture-bb294b-${runId}`],
    );
    galleryId = g[0].id;

    for (let i = 0; i < 10; i++) {
      const { rows: p } = await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
        [galleryId, `fixture-bb294b-${runId}-${i}`, `BBS_${String(i).padStart(4, "0")}.jpg`, i],
      );
      anh.push(p[0].id);
    }

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb294b', 'owner', 'active') returning id`,
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

    // Khách #2 — tên dài + chi nhánh, cho ca #17/#40.
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
      if (galleryId) await client.query("delete from photos where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (customerId2) await client.query("delete from customers where id = $1", [customerId2]);
      if (branchTrongId) await client.query("delete from branches where id = $1", [branchTrongId]);
      if (ownerId) await client.query("delete from staff_profiles where id = $1", [ownerId]);
      await client.end();
    }
    if (ownerId) await suKienAdmin().auth.admin.deleteUser(ownerId);
  });

  test("chụp #2, #18, #36: chi tiết bộ ảnh (Mua thêm, Chốt lúc)", async ({ page }) => {
    test.setTimeout(60_000);
    await datAnhGia(page);
    await dangNhapNhanVien(page, emailOwner, password);

    for (const [ten, kt] of Object.entries(KT)) {
      await page.setViewportSize(kt);
      await page.goto(`/admin/galleries/${galleryId}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await chupMain(page, `02-18-36-${ten}-chi-tiet-bo-anh`);
    }
  });

  test("chụp #9: trình thiết kế bìa — chờ ảnh trong lưới tải xong, chọn bìa, xem xem trước", async ({ page }) => {
    test.setTimeout(60_000);
    await datAnhGia(page);
    await dangNhapNhanVien(page, emailOwner, password);

    for (const [ten, kt] of Object.entries(KT)) {
      await page.setViewportSize(kt);
      await page.goto(`/admin/galleries/${galleryId}`);
      await page.waitForLoadState("networkidle").catch(() => {});

      const nutMo = page.getByRole("button", { name: /Mở trình thiết kế bìa|Đổi bìa/ });
      await nutMo.click();
      await expect(page.getByRole("dialog", { name: "Thiết kế bìa bộ ảnh" })).toBeVisible();

      // Chờ khung xương biến mất (lưới thật đã tải), rồi chờ ẢNH THẬT (không
      // chỉ DOM) đã giải mã xong — không suy luận "chắc đang tải".
      await page.waitForSelector(".animate-pulse", { state: "detached", timeout: 15_000 }).catch(() => {});
      await page.waitForFunction(
        () => {
          const imgs = Array.from(document.querySelectorAll('[role="dialog"] img'));
          return imgs.length > 0 && imgs.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0);
        },
        { timeout: 15_000 },
      );

      await chupTrang(page, `09-${ten}-thiet-ke-bia-truoc-khi-chon`);

      // Chọn tấm đầu tiên làm bìa — xem trước phải đổi theo NGAY.
      // BB-396 — lưới ô kiểu bìa (cũng `.grid`) nay đứng trước lưới ảnh: tìm ô ảnh theo tên nút.
      const tamDau = page.getByRole("dialog").getByRole("button", { name: /^Chọn .* làm bìa$/ }).first();
      await tamDau.click();
      await page.waitForTimeout(600);

      await chupTrang(page, `09-${ten}-thiet-ke-bia-da-chon-bia`);

      await page.keyboard.press("Escape");
    }
  });

  test("chụp #17, #40: Khách hàng — tên/avatar", async ({ page }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, emailOwner, password);

    for (const [ten, kt] of Object.entries(KT)) {
      await page.setViewportSize(kt);
      await page.goto("/admin/customers");
      await page.waitForLoadState("networkidle").catch(() => {});
      const oTim = page.getByPlaceholder("Tên khách hoặc số điện thoại").first();
      if (await oTim.count()) {
        // Chờ ĐÚNG phản hồi API của lượt tìm kiếm này (không đoán một
        // khoảng chờ cố định, và không phụ thuộc DOM ẩn/hiện theo khổ màn —
        // ở `lg:hidden`, đôi khi `getByText` khớp đúng nút chữ nhưng đang bị
        // ẩn bởi breakpoint, nên "toBeVisible" sai kết quả).
        const choPhanHoi = page.waitForResponse(
          (res) => res.url().includes("/api/admin/customers?q=") && res.status() === 200,
          { timeout: 10_000 },
        );
        await oTim.fill(NHAN);
        await choPhanHoi;
        await page.waitForTimeout(400);
      }
      await chupMain(page, `17-40-${ten}-khach-hang`);
    }
  });

  test("chụp #19: nút chính màu mực — Bộ ảnh, Cài đặt, Bảng điều khiển trống", async ({ page }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, emailOwner, password);

    // Nút "Tạo bộ ảnh" (gallery-filters.tsx, lg:hidden, KHÔNG override — canh
    // đúng luật CSS chung) chỉ hiện dưới 1024px.
    await page.setViewportSize(KT.dt);
    await page.goto("/admin/galleries");
    await page.waitForLoadState("networkidle").catch(() => {});
    await chupTrang(page, "19-dt-nut-tao-bo-anh");

    // Nút "Lưu thay đổi" ở Cài đặt.
    await page.setViewportSize(KT.mt);
    await page.goto("/admin/settings");
    await page.waitForLoadState("networkidle").catch(() => {});
    await chupMain(page, "19-mt-nut-luu-cai-dat");

    // Nút "Đi tới Quản lý bộ ảnh" ở bảng điều khiển trống.
    await page.goto(`/admin?branchId=${branchTrongId}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await chupMain(page, "19-32-mt-bang-dieu-khien-trong");
  });

  test("chụp #23: Cài đặt — thanh Huỷ/Lưu ghim đáy khung nhìn", async ({ page }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, emailOwner, password);

    for (const [ten, kt] of Object.entries(KT)) {
      await page.setViewportSize(kt);
      await page.goto("/admin/settings");
      await page.waitForLoadState("networkidle").catch(() => {});
      // Cuộn khung `main` xuống đáy trước khi chụp — nội dung Cài đặt dài hơn
      // một màn hình.
      await page.locator("main").first().evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(300);
      await chupTrang(page, `23-${ten}-cai-dat-thanh-huy-luu`);
    }
  });

  test("chụp #32: Bảng điều khiển trống — hàng thẻ số vẫn hiện", async ({ page }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, emailOwner, password);

    for (const [ten, kt] of Object.entries(KT)) {
      await page.setViewportSize(kt);
      await page.goto(`/admin?branchId=${branchTrongId}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await chupMain(page, `32-${ten}-bang-dieu-khien-trong`);
    }
  });

  test("chụp #39: Việc cần xử lý — huy hiệu số tabular", async ({ page }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, emailOwner, password);

    for (const [ten, kt] of Object.entries(KT)) {
      await page.setViewportSize(kt);
      await page.goto("/admin/viec-can-xu-ly");
      await page.waitForLoadState("networkidle").catch(() => {});
      await chupMain(page, `39-${ten}-viec-can-xu-ly`);
    }
  });

  test("chụp #41: Báo cáo — nhãn dễ hiểu, không viết hoa toàn bộ chú thích", async ({ page }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, emailOwner, password);

    for (const [ten, kt] of Object.entries(KT)) {
      await page.setViewportSize(kt);
      await page.goto("/admin/bao-cao");
      await page.waitForLoadState("networkidle").catch(() => {});
      await chupMain(page, `41-${ten}-bao-cao`);
    }
  });
});
