/**
 * BB-384 — vòng khách duyệt LUÔN trong app (anh 07/10: "vòng khách duyệt anh muốn như
 * yêu cầu của anh ở bản yêu cầu").
 *
 * VIẾT, CHƯA CHẠY (luật Đợt 19: không chạy e2e khi có khách) — Claude chạy khi vắng khách.
 *
 * Kịch bản trên nền Fixture riêng (dùng lại khuôn dữ liệu BB-371: 4 ảnh gốc + 2 ảnh
 * trong thư mục con "anh chinh sua"):
 *   1. Bộ A — đúng ca ảnh chụp của anh: `awaiting_approval` do CSKH dán link Drive (đường
 *      cũ), ảnh chỉnh CHƯA gửi trong app. Khách: lời Bean "đang chuẩn bị", KHÔNG link
 *      Drive, KHÔNG nút "Duyệt, cho in"; thanh đáy là thanh duyệt (không "Yêu cầu sửa
 *      lại"); máy chủ từ chối duyệt mù.
 *   2. CSKH: khối "Ảnh chỉnh sửa" cảnh báo "Khách chưa xem được ảnh chỉnh"; route cũ
 *      `retouch-done` trên bộ B (0 ảnh chỉnh) bị chặn với câu "Đồng bộ ảnh"; bộ A bấm
 *      "Gửi khách duyệt".
 *   3. Khách bộ A: thanh đáy "Xem & duyệt 2 ảnh chỉnh" → khối duyệt; xin sửa một tấm có
 *      ghi chú → thấy lời Bean nói ai sửa / khi nào báo; sau khi gửi thấy xác nhận rõ
 *      (số tấm, tên tấm, ghi chú) và lịch sử theo tấm.
 *   4. CSKH thấy lần sửa 1 (Lark: "Sửa"); gửi lại; khách duyệt → lời mời in thêm với
 *      ảnh đã chỉnh (bh-04), KHÔNG có lời mời lúc mới gửi ảnh chỉnh.
 *
 * Lark: máy chủ thử chạy với PHEP_THU_TRINH_DUYET=1 — không ghi Lark thật.
 *
 * Chạy: PW_PORT=3384 npx playwright test tests/e2e/bb-384-vong-duyet.spec.ts --workers=1
 */
// BB-388 — mỗi ca một IP riêng (giới hạn 10 lần mở link/IP/15 phút, xem helper), kể cả trang
// khách mở thêm ở ca 4 (`ipMoi()`): từ `::1` chung thì chạy lại trong 15 phút là 429.
import { test, expect, ipMoi } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { dungBoBb371, dungNenBb371, type BoBb371 } from "../fixtures/bb-371";

const password = "Password123!";

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

test.describe("BB-384: vòng duyệt luôn trong app", () => {
  let pg: Client;
  let nen: NenFixture;
  let boA: BoBb371;
  let boB: BoBb371;
  let emailCs = "";
  let staffId = "";

  const admin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    nen = (await dungNenBb371(pg)).nen;
    boA = await dungBoBb371(pg, nen, "A384", { status: "awaiting_approval" });
    boB = await dungBoBb371(pg, nen, "B384", { status: "in_retouch" });
    // Bộ A: đường cũ — link Drive ảnh chỉnh, mốc giao TRƯỚC lúc ảnh chỉnh về app (khách
    // không thấy tấm nào). Bộ B: không có ảnh chỉnh nào trong app.
    await pg.query(
      `insert into deliveries (gallery_id, branch_id, status, final_drive_url, updated_at)
       values ($1,$2,'ready','https://drive.google.com/drive/folders/SEED_FOLDER_ID_BB384', now() - interval '3 hours')`,
      [boA.id, nen.branchId],
    );
    await pg.query(`delete from photos where gallery_id = $1 and subfolder = 'anh chinh sua'`, [boB.id]);

    emailCs = `test_bb384_cs_${nen.runId}@demo.babybean.vn`;
    const { data, error } = await admin().auth.admin.createUser({ email: emailCs, password, email_confirm: true });
    if (error) throw error;
    staffId = data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      staffId,
      `Fixture BB-384 ${nen.runId} CSKH`,
      emailCs,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [staffId, nen.branchId]);
  });

  test.afterAll(async () => {
    test.setTimeout(90_000);
    if (!pg) return;
    try {
      await pg.query(`delete from staff_branches where staff_id = $1`, [staffId]).catch(() => {});
      await donNenFixture(pg, { galleryIds: [boA?.id, boB?.id], branchIds: [nen?.branchId], staffIds: [staffId] });
    } finally {
      await pg.end();
    }
  });

  test("1. chờ duyệt mà app chưa có ảnh chỉnh: lời Bean, không khung cũ, không duyệt mù", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${boA.maBaMe}`);
    await expect(page.getByTestId("bean-dang-chuan-bi-duyet")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Mở thư mục ảnh đã chỉnh")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Duyệt, cho in" })).toHaveCount(0);
    await expect(page.getByTestId("khoi-anh-chinh")).toHaveCount(0);
    // Thanh đáy: bước duyệt, không phải "Đủ trong gói · Yêu cầu sửa lại".
    await expect(page.getByTestId("thanh-duyet-dong")).toContainText("Bean đang chuẩn bị");
    await expect(page.getByTestId("nut-xem-duyet-anh-chinh")).toHaveCount(0);
    await expect(page.getByTestId("thanh-noi")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Yêu cầu sửa lại" })).toHaveCount(0);
    // Máy chủ: không duyệt mù.
    const res = await page.request.post("/api/g/review", { data: { decision: "approve" } });
    expect(res.status()).toBe(400);
    expect((await pg.query(`select status from galleries where id = $1`, [boA.id])).rows[0].status).toBe("awaiting_approval");
  });

  test("2. CSKH: cảnh báo khách chưa xem được ảnh chỉnh; route cũ chặn khi 0 ảnh; gửi bộ A trong app", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapNhanVien(page, emailCs, password);

    const chan = await page.request.post(`/api/admin/galleries/${boB.id}/retouch-done`, {
      data: { finalDriveUrl: "https://drive.google.com/drive/folders/SEED_FOLDER_ID_BB384B" },
    });
    expect(chan.status()).toBe(400);
    expect(JSON.stringify(await chan.json())).toContain("Đồng bộ ảnh");
    expect((await pg.query(`select status from galleries where id = $1`, [boB.id])).rows[0].status).toBe("in_retouch");

    await page.goto(`/admin/galleries/${boA.id}`);
    const khoi = page.getByTestId("khoi-anh-chinh-admin");
    await expect(khoi).toBeVisible({ timeout: 120_000 });
    await expect(khoi.getByTestId("canh-bao-khach-chua-xem-anh-chinh")).toContainText("Khách chưa xem được ảnh chỉnh");
    await expect(page.getByPlaceholder("Link thư mục ảnh đã chỉnh")).toHaveCount(0);
    await khoi.getByTestId("nut-gui-khach-duyet").click();
    await khoi.getByTestId("dong-y-gui-khach").click();
    await expect(khoi.getByTestId("canh-bao-khach-chua-xem-anh-chinh")).toHaveCount(0, { timeout: 30_000 });
  });

  test("3. khách: thanh đáy dẫn vào duyệt; xin sửa có lời Bean hạ hoả và xác nhận rõ", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${boA.maBaMe}`);
    const nut = page.getByTestId("nut-xem-duyet-anh-chinh");
    await expect(nut).toHaveText("Xem & duyệt 2 ảnh chỉnh", { timeout: 60_000 });
    await nut.click();
    const khoi = page.getByTestId("khoi-anh-chinh");
    await expect(khoi).toBeInViewport();
    await expect(page.getByTestId("bean-dang-chuan-bi-duyet")).toHaveCount(0);

    await khoi.getByRole("button", { name: "Yêu cầu sửa" }).click();
    await expect(khoi.getByTestId("ai-se-sua")).toContainText("trong khoảng 3 ngày");
    await khoi.getByTestId("o-anh-chinh").first().click();
    await page.getByTestId("chon-can-sua").click();
    await page.getByRole("textbox", { name: "Ba mẹ muốn Bean sửa gì ở tấm này ạ?" }).fill("Da bé sáng hơn chút");
    await page.getByTestId("xem-lon-anh-chinh").getByRole("button", { name: "Đóng" }).click();
    await khoi.getByRole("button", { name: "Gửi yêu cầu sửa" }).click();

    // Bộ về "đang sửa": khung thông tin xác nhận rõ đã nhận gì.
    const daNhan = page.getByTestId("da-nhan-yeu-cau-sua");
    await expect(daNhan).toBeVisible({ timeout: 30_000 });
    await expect(daNhan.getByTestId("da-nhan-cac-tam")).toContainText("1 tấm cần sửa");
    await expect(daNhan.getByTestId("da-nhan-cac-tam")).toContainText("IMG_0001-Edit.jpg");
    await expect(daNhan.getByTestId("da-nhan-cac-tam")).toContainText("Da bé sáng hơn chút");
    await expect(daNhan.getByTestId("ai-dang-sua")).toBeVisible();
    await expect(page.getByTestId("thanh-duyet")).toHaveCount(0);
  });

  test("4. CSKH thấy lần sửa 1 (Lark: Sửa), gửi lại; khách duyệt → mời in thêm đúng lúc", async ({ page, browser }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapNhanVien(page, emailCs, password);
    await page.goto(`/admin/galleries/${boA.id}`);
    const khoi = page.getByTestId("khoi-anh-chinh-admin");
    const vong = khoi.getByTestId("vong-sua-admin").first();
    await expect(vong).toContainText("Khách yêu cầu sửa lần 1", { timeout: 120_000 });
    await expect(vong).toContainText("Lark: Sửa");
    await khoi.getByTestId("nut-gui-khach-duyet").click();
    await khoi.getByTestId("dong-y-gui-khach").click();
    await expect(khoi.getByTestId("trang-thai-gui-anh-chinh")).toContainText("Đã gửi khách", { timeout: 30_000 });

    const khach = await browser.newPage({ extraHTTPHeaders: { "x-forwarded-for": ipMoi() } });
    await chanLh3TrenTrinhDuyet(khach);
    await khach.goto(`/g/${boA.maBaMe}`);
    const khoiKhach = khach.getByTestId("khoi-anh-chinh");
    await expect(khoiKhach).toBeVisible({ timeout: 60_000 });
    // Lúc mới gửi ảnh chỉnh: KHÔNG mời in thêm.
    await expect(khach.getByTestId("loi-moi-in-them")).toHaveCount(0);
    // Lịch sử theo tấm: lần 1 · Bean đã sửa.
    await expect(khoiKhach.getByTestId("vong-sua-khach").first()).toContainText("Bean đã sửa");
    await khoiKhach.getByRole("button", { name: "Duyệt, cho in" }).click();
    await expect(khach.getByTestId("loi-moi-in-them")).toBeVisible({ timeout: 30_000 });
    await expect(khach.getByTestId("anh-moi-in")).toHaveCount(2);
    expect((await pg.query(`select status from galleries where id = $1`, [boA.id])).rows[0].status).toBe("approved");
    await khach.close();
  });
});
