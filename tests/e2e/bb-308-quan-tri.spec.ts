/**
 * BB-308 — làm nốt các chỗ màn quản trị còn lệch bản vẽ BB-301 (đã admin
 * duyệt 28/09/2026), cộng bốn việc thêm từ báo cáo chấm vòng 4
 * (`scratchpad/danh-gia/6-vong4-khach-kho-tinh.md`, phần C).
 *
 * Canh NĂM điều ĐO ĐƯỢC:
 *  1. Chi tiết bộ ảnh: nút "⋯" (aria-label "Thao tác khác") gom Đồng bộ lại /
 *     Đổi thư mục / Làm nóng ảnh / Mở lại cho khách chọn / Tạo link mới /
 *     Gia hạn — các thẻ "Thư mục ảnh gốc" và "Link khách" ở cột phải KHÔNG
 *     còn hiện các nút này trực tiếp khi menu đang đóng.
 *  2. Bảng điều khiển: `BranchSelector` (trước đây có sẵn trong dự án nhưng
 *     chưa gắn vào trang nào) giờ đứng cạnh nút "+ Tạo bộ ảnh"; đổi chi
 *     nhánh phát lại đúng lượt gọi `/api/admin/dashboard` kèm `branchId`.
 *  3. Khách hàng: avatar chỉ còn MỘT chữ cái — chữ đầu của TỪ CUỐI họ tên
 *     (tên gọi), không phải hai chữ (đầu họ + đầu tên) như BB-294 cũ.
 *  4. (vòng 4, #5) `GET .../items` trả `sessionType` (từ `shoots.concept`) —
 *     trước đây route KHÔNG đọc cột này, nên khung xem trước bìa quản trị
 *     luôn thiếu dòng "Thôi nôi" dù bìa khách có.
 *  5. (vòng 4, #6) Trang Cài đặt chặn quyền Ở TẦNG TRANG: nhân viên không có
 *     `settings:system` chỉ thấy `KhongCoQuyen`, KHÔNG còn thấy form + thanh
 *     "Huỷ"/"Lưu thay đổi" bấm được đè lên dòng lỗi 403 như trước.
 *
 * Khối "Việc hôm nay" (chip Tất cả/Nhắc khách/Duyệt & giao) KHÔNG canh được
 * bằng dữ liệu Fixture qua API `/api/admin/dashboard`: `locBoAnhThat`
 * (src/lib/bao-cao/loc-chung.ts) cố tình loại mọi bộ ảnh tên "Fixture%" khỏi
 * khối này (đúng luật §6 — không để dữ liệu thử lẫn số liệu quản trị thật).
 * Logic phân nhóm (`nhomThaoTacViec`) được canh riêng, trực tiếp, ở
 * tests/unit/bb-308-nhom-thao-tac-viec.test.ts. Hàm `tenGoiBe` (vòng 4, #8)
 * cũng được canh riêng, trực tiếp, ở tests/unit/bb-308-ten-goi-be.test.ts.
 *
 * Dữ liệu: chỉ "Fixture BB-308 …", dọn theo tuổi ≥6h ở `beforeAll`, dọn sạch
 * phần của lượt chạy này ở `afterAll`.
 *
 * Lưu ý 28/09/2026: giám đốc có thể chạy `npm run db:cleanup -- --write` bất
 * cứ lúc nào trong lúc phép thử đang chạy — nếu một ca đỏ vì "không tìm thấy
 * bộ ảnh"/"không tìm thấy khách", chạy lại một mình trước khi kết luận lỗi mã.
 *
 * Chạy: `PW_PORT=3166 npx playwright test tests/e2e/bb-308-quan-tri.spec.ts --workers=1`.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const THU_MUC_ANH = "test-results/bb-308";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-308 ${runId}`;
const emailOwner = `test_bb308_owner_${runId}@demo.babybean.vn`;
const password = "Password123!";

const suKienAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

test.describe("BB-308: màn quản trị — menu ⋯, bộ chọn chi nhánh, avatar một chữ", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let ownerId = "";
  let shootId = "";
  let branchManagerId = "";
  const emailBranchManager = `test_bb308_bm_${runId}@demo.babybean.vn`;

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    await client.query(
      `delete from galleries where title like 'Fixture BB-308%' and created_at < now() - interval '6 hours'`,
    );
    await client.query(
      `delete from customers where full_name like 'Fixture BB-308%' and created_at < now() - interval '6 hours'`,
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

    // BB-308 mục 3 — "tên gọi" là TỪ CUỐI của họ tên đầy đủ ("Mai"), avatar
    // phải hiện đúng MỘT chữ "M" (không phải "NM" như BB-294 cũ). Cùng khách
    // này dùng luôn cho bộ ảnh ở mục 1 để đỡ tạo thêm dòng.
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Nguyễn Thị Mai`, "0901000308"],
    );
    customerId = kh[0].id;

    // BB-308 vòng 4 mục 4 — buổi chụp có `concept` ("Thôi nôi") để kiểm
    // `sessionType` trong phản hồi `GET .../items` (khung xem trước bìa
    // quản trị dùng trường này, xem bia-bo-anh-editor.tsx).
    const { rows: sh } = await client.query(
      `insert into shoots (branch_id, customer_id, shoot_date, concept) values ($1,$2, now(), 'Thôi nôi') returning id`,
      [branchId, customerId],
    );
    shootId = sh[0].id;

    // BB-308 mục 1 — status "submitted" (nút chính "Xác nhận và chuyển sang
    // chỉnh ảnh" + menu ⋯ đủ điều kiện hiện "Mở lại cho khách chọn", vì chỉ
    // "expired"/"submitted" mới hiện mục đó). Có thư mục Drive để "Đồng bộ
    // lại" không bị khoá do thiếu `driveFolderUrl`.
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, shoot_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, submitted_at)
       values ($1,$2,$3,$4,'submitted',$5,'https://example.com/fixture-bb308',24, now()) returning id`,
      [branchId, customerId, shootId, NHAN, `fixture-bb308-${runId}`],
    );
    galleryId = g[0].id;

    // Link đã "expired" (không phải "active") — để menu ⋯ đủ điều kiện hiện
    // "Gia hạn" (điều kiện `coTheGiaHan` trong MenuThaoTacPhu: có link VÀ
    // trạng thái khác "active").
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status, expires_at)
       values ($1, md5(random()::text), 'bb308x', 'owner', 'expired', now() - interval '1 day')`,
      [galleryId],
    );

    // BB-308 vòng 4 mục 5 — tài khoản "branch_manager": có quyền vào được
    // các trang quản trị khác (customers:read…) nhưng KHÔNG có
    // `settings:system` (xem db/migrations/0052-vai-tro-dong.sql) — đúng ca
    // thật báo cáo chấm bắt được (`emailQl`), không phải một vai bịa ra chỉ
    // để test đỏ dễ dàng.
    const bmRes = await suKienAdmin().auth.admin.createUser({
      email: emailBranchManager,
      password,
      email_confirm: true,
    });
    if (bmRes.error) throw bmRes.error;
    branchManagerId = bmRes.data.user!.id;
    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'branch_manager')`,
      [branchManagerId, `${NHAN} BranchManager`, emailBranchManager],
    );
    await client.query(`insert into staff_branches (staff_id, branch_id) values ($1,$2)`, [
      branchManagerId,
      branchId,
    ]);
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) await client.query("delete from share_links where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (shootId) await client.query("delete from shoots where id = $1", [shootId]);
      if (branchManagerId) await client.query("delete from staff_branches where staff_id = $1", [branchManagerId]);
      if (branchManagerId) await client.query("delete from staff_profiles where id = $1", [branchManagerId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (ownerId) await client.query("delete from staff_profiles where id = $1", [ownerId]);
      await client.end();
    }
    if (ownerId) await suKienAdmin().auth.admin.deleteUser(ownerId);
    if (branchManagerId) await suKienAdmin().auth.admin.deleteUser(branchManagerId);
  });

  test("mục 1: menu ⋯ gom thao tác phụ; cột phải chỉ còn thẻ thông tin", async ({ page }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, emailOwner, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/galleries/${galleryId}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    // Menu ĐÓNG: các thao tác phụ không được nằm trần trên trang nữa — nếu
    // hoàn nguyên bản vá BB-308 (trả các nút này về thẻ cột phải như trước),
    // các dòng dưới đây phải ĐỎ.
    await expect(page.getByRole("button", { name: "Đồng bộ lại" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Đổi thư mục" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Chuẩn bị ảnh bìa" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Gia hạn/ })).toHaveCount(0);
    // BB-320: link CŨ không khôi phục được có MỘT nút "Tạo link mới" ngay trong thẻ Link app
    // (chủ dự án yêu cầu, có chú thích riêng) — đó là nút duy nhất được phép trần; mọi nút khác vẫn phải nằm trong menu ⋯.
    const soNutTrongThe = await page.getByTestId("link-cu-khong-khoi-phuc").getByRole("button").count();
    await expect(page.getByRole("button", { name: /Tạo link mới|Tạo link app/ })).toHaveCount(soNutTrongThe);

    await page.screenshot({ path: `${THU_MUC_ANH}/1-mt-chi-tiet-menu-dong.png`, fullPage: true });

    // Mở menu ⋯.
    const nutMenu = page.getByRole("button", { name: "Thao tác khác" });
    await expect(nutMenu).toBeVisible();
    await nutMenu.click();

    const menu = page.getByRole("menu", { name: "Thao tác khác" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Đồng bộ lại" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Đổi thư mục" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Chuẩn bị ảnh bìa" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Mở lại cho khách chọn" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Tạo link mới (ĐỔI địa chỉ)" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Gia hạn (giữ nguyên địa chỉ)" })).toBeVisible();

    await page.screenshot({ path: `${THU_MUC_ANH}/1-mt-chi-tiet-menu-mo.png` });

    // "Đổi thư mục" từ menu vẫn mở đúng form cũ (cùng ô nhập, cùng hàm
    // `doiThuMuc`) — chỉ đổi chỗ bấm mở, không đổi hành vi.
    await menu.getByRole("menuitem", { name: "Đổi thư mục" }).click();
    const oNhapThuMuc = page.getByLabel("Địa chỉ thư mục ảnh gốc");
    await expect(oNhapThuMuc).toBeVisible();
    await page.getByRole("button", { name: "Huỷ" }).click();
    await expect(oNhapThuMuc).toBeHidden();

    // "Mở lại cho khách chọn" từ menu mở đúng form cũ (bắt buộc lý do —
    // ReopenForm không đổi), có nút Đóng để ẩn lại không cần tải lại trang.
    await nutMenu.click();
    await menu.getByRole("menuitem", { name: "Mở lại cho khách chọn" }).click();
    await expect(page.getByRole("heading", { name: "Mở lại cho khách chọn tiếp" })).toBeVisible();
    await expect(page.getByLabel("Lý do mở lại")).toBeVisible();
    await page.getByRole("button", { name: "Đóng" }).click();
    await expect(page.getByRole("heading", { name: "Mở lại cho khách chọn tiếp" })).toBeHidden();

    // Cột phải vẫn còn thẻ thông tin theo bản vẽ BB-301 (Bìa, Thư mục ảnh
    // gốc, Link khách — "Xuất danh sách" chỉ hiện khi có ảnh đã chọn, fixture
    // này không tạo lượt chọn nên thẻ đó không áp dụng ở đây).
    await expect(page.getByRole("heading", { name: "Bìa bộ ảnh" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thư mục ảnh gốc" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Link app" })).toBeVisible();

    // Màn "chi tiết" -> chụp thêm khổ điện thoại (390×844) theo yêu cầu bàn giao.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: `${THU_MUC_ANH}/1-dt-chi-tiet-menu-dong.png`, fullPage: true });
    const nutMenuDt = page.getByRole("button", { name: "Thao tác khác" });
    await nutMenuDt.click();
    await page.screenshot({ path: `${THU_MUC_ANH}/1-dt-chi-tiet-menu-mo.png` });
  });

  test("mục 2: bộ chọn chi nhánh cạnh nút + Tạo bộ ảnh, đổi chi nhánh gọi lại API kèm branchId", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, emailOwner, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin");
    await page.waitForLoadState("networkidle").catch(() => {});

    const nutTao = page.getByRole("button", { name: /Tạo bộ ảnh/i }).first();
    await expect(nutTao).toBeVisible();

    // BranchSelector tự ẩn khi chỉ có ≤1 chi nhánh — BabyBean có 3 chi nhánh
    // thật (Quận 1/3/7) nên chủ studio (owner, thấy mọi chi nhánh) phải thấy
    // nó. Nếu hoàn nguyên bản vá (bỏ `<BranchSelector />` khỏi dashboard.tsx),
    // dòng dưới đây phải ĐỎ.
    const boChon = page.getByLabel("Chọn chi nhánh");
    await expect(boChon).toBeVisible();
    await page.screenshot({ path: `${THU_MUC_ANH}/2-mt-ngay-sau-khi-vao.png` });

    // Bộ chọn đứng CẠNH nút "+ Tạo bộ ảnh" (cùng hàng, bên trái nó theo DOM).
    const hopBoChon = await boChon.boundingBox();
    const hopNutTao = await nutTao.boundingBox();
    expect(hopBoChon, "không đo được bộ chọn chi nhánh").not.toBeNull();
    expect(hopNutTao, "không đo được nút Tạo bộ ảnh").not.toBeNull();
    if (hopBoChon && hopNutTao) {
      expect(
        Math.abs(hopBoChon.y - hopNutTao.y),
        "bộ chọn chi nhánh không cùng hàng với nút Tạo bộ ảnh",
      ).toBeLessThanOrEqual(hopBoChon.height);
    }

    // Đổi chi nhánh -> dashboard gọi lại API kèm ĐÚNG branchId vừa chọn
    // (route đã hỗ trợ sẵn `branchId`, xem src/app/api/admin/dashboard/route.ts).
    const cacGiaTri = await boChon.locator("option").all();
    const giaTriHienTai = await boChon.inputValue();
    const cacGiaTriText = await Promise.all(cacGiaTri.map((o) => o.getAttribute("value")));
    const giaTriKhac = cacGiaTriText.find((v) => v && v !== giaTriHienTai);
    test.skip(!giaTriKhac, "bb-dev chỉ có một chi nhánh khả dụng cho tài khoản này lúc chạy — bỏ qua đoạn đổi chi nhánh.");
    if (giaTriKhac) {
      const choGoiLai = page.waitForResponse(
        (res) => res.url().includes("/api/admin/dashboard") && res.url().includes(`branchId=${giaTriKhac}`),
        { timeout: 10_000 },
      );
      await boChon.selectOption(giaTriKhac);
      await choGoiLai;
      await page.waitForLoadState("networkidle").catch(() => {});
      // Bộ chọn vẫn còn NGUYÊN trên trang sau khi đổi chi nhánh — đổi dữ liệu
      // không được phép làm rụng mất control đang dùng để đổi nó.
      await expect(boChon).toBeVisible();
      await expect(boChon).toHaveValue(giaTriKhac);
    }

    await page.screenshot({ path: `${THU_MUC_ANH}/2-mt-bang-dieu-khien-bo-chon-chi-nhanh.png`, fullPage: true });
  });

  test("mục 3: avatar khách hàng — một chữ cái của tên gọi (chữ cuối họ tên)", async ({ page }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, emailOwner, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle").catch(() => {});

    const oTim = page.getByPlaceholder("Tên khách hoặc số điện thoại").first();
    if (await oTim.count()) {
      const choPhanHoi = page.waitForResponse(
        (res) => res.url().includes("/api/admin/customers?q=") && res.status() === 200,
        { timeout: 10_000 },
      );
      await oTim.fill(NHAN);
      await choPhanHoi;
      await page.waitForTimeout(400);
    }

    const hang = page.locator("tr", { hasText: "Nguyễn Thị Mai" }).first();
    await expect(hang).toBeVisible();
    const chuCai = hang.getByTestId("chu-cai-dau").first();
    await expect(chuCai).toBeVisible();
    // "Fixture BB-308 xxxxxxxx Nguyễn Thị Mai" -> từ cuối "Mai" -> "M". Nếu
    // hoàn nguyên bản vá (trả về HAI chữ đầu họ+đầu tên của BB-294 cũ), dòng
    // dưới đây phải ĐỎ ("NM" !== "M").
    await expect(chuCai).toHaveText("M");

    await page.screenshot({ path: `${THU_MUC_ANH}/3-mt-khach-hang-avatar.png`, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    const oTimDt = page.getByPlaceholder("Tên khách hoặc số điện thoại").first();
    if (await oTimDt.count()) {
      const choPhanHoiDt = page.waitForResponse(
        (res) => res.url().includes("/api/admin/customers?q=") && res.status() === 200,
        { timeout: 10_000 },
      );
      await oTimDt.fill(NHAN);
      await choPhanHoiDt;
      await page.waitForTimeout(400);
    }
    const theDt = page.locator("li", { hasText: "Nguyễn Thị Mai" }).first();
    if (await theDt.count()) {
      await expect(theDt.getByTestId("chu-cai-dau").first()).toHaveText("M");
    }
    await page.screenshot({ path: `${THU_MUC_ANH}/3-dt-khach-hang-avatar.png`, fullPage: true });
  });

  test("mục 4 (vòng 4, #5): GET .../items trả sessionType từ shoots.concept", async ({ page }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, emailOwner, password);
    const phanHoi = await page.request.get(`/api/admin/galleries/${galleryId}/items`, {
      headers: { cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ") },
    });
    const json = await phanHoi.json();
    // Phản hồi API THẬT — dán vào bàn giao (AGENTS.md §1 mục 6).
    // eslint-disable-next-line no-console
    console.log("BB-308 vòng 4 mục 4 — GET items:", JSON.stringify({
      sessionType: json.data?.sessionType,
      shootDate: json.data?.shootDate,
    }));
    // Trước bản vá, route không đọc `shoots.concept` nên `sessionType` luôn
    // `undefined` — khung xem trước bìa quản trị (BiaBoAnhEditor) không bao
    // giờ hiện "Thôi nôi". Nếu hoàn nguyên, dòng dưới đây phải ĐỎ.
    expect(json.data.sessionType).toBe("Thôi nôi");
    expect(json.data.shootDate).toBeTruthy();
  });

  test("mục 5 (vòng 4, #6): Cài đặt ẩn Huỷ/Lưu khi không có quyền settings:system", async ({ page }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, emailBranchManager, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Trước bản vá: trang luôn dựng `SettingsManager`, gọi `GET
    // /api/admin/settings` (đòi `settings:system`) hỏng 403, chỉ hiện dòng
    // lỗi ĐÈ LÊN form — thanh "Huỷ"/"Lưu thay đổi" dính đáy vẫn nguyên vẹn,
    // bấm được. Nếu hoàn nguyên `settings/page.tsx` về bản không kiểm quyền,
    // hai dòng expect `toHaveCount(0)` dưới đây phải ĐỎ.
    await expect(page.getByRole("heading", { name: "Không có quyền" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Huỷ" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Lưu thay đổi|Đang lưu/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Về bảng điều khiển" })).toBeVisible();

    await page.screenshot({ path: `${THU_MUC_ANH}/5-mt-cai-dat-khong-co-quyen.png`, fullPage: true });

    // Đối chứng: owner (CÓ settings:system) vẫn thấy đủ form + thanh lưu —
    // bản vá không được siết quá tay, chỉ chặn đúng người thiếu quyền.
    await dangNhapNhanVien(page, emailOwner, password);
    await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByRole("button", { name: "Huỷ" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Lưu thay đổi|Đang lưu/ })).toBeVisible();
  });
});
