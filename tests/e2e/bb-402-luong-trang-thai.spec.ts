/**
 * BB-402 — luồng trạng thái: quản trị và màn khách cùng một giai đoạn; nút chính đúng giai đoạn.
 *
 * VIẾT, CHƯA CHẠY (luật Đợt 19: không chạy e2e khi có khách) — Claude chạy khi vắng khách.
 *
 * Lỗi anh báo 08/10 (bộ HD_20260924#5261 — ở đây dựng lại bằng dữ liệu GIẢ trên nền
 * Fixture riêng, khuôn BB-371: 4 ảnh gốc + 2 ảnh chỉnh đã gửi khách):
 *   1. Bộ A `approved`, Lark NULL. Khách: thẻ tiến trình ở bước "In/nhận ảnh" (đã qua
 *      "Duyệt ảnh"), câu "Ảnh đã chốt, Bean đang chuẩn bị in ạ"; nút chính thanh đáy là
 *      "Chọn thêm ảnh", KHÔNG có "Yêu cầu sửa lại".
 *   2. CSKH mở cùng bộ: huy hiệu "Đã chốt, chờ in" và dòng "Khách đang thấy: In & giao ·
 *      Ảnh đã chốt, Bean đang chuẩn bị in ạ" — cùng giai đoạn với màn khách.
 *   4. (vòng 2) Bộ D ĐÃ GIAO: có thanh đáy, nút chính "Chọn thêm ảnh"; thẻ đợt không có nút chính thứ hai.
 *   5. (vòng 2) Bộ E ĐANG CHỈNH: nút chính "Chọn thêm ảnh", không "Yêu cầu sửa lại"; lối phụ
 *      "Nhắn Bean" khi chi nhánh có kênh chat.
 *   3. Bộ C chưa ai mở (sent_at / first_viewed_at trống, chưa có lượt chọn): khách mở lần
 *      đầu → hai mốc được ghi; mở lần hai không đổi mốc.
 *
 * Lark: máy chủ thử chạy với PHEP_THU_TRINH_DUYET=1 — không ghi Lark thật.
 *
 * Chạy: PW_PORT=3402 npx playwright test tests/e2e/bb-402-luong-trang-thai.spec.ts --workers=1
 */
import { test, expect, ipMoi } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { dungBoBb371, dungNenBb371, type BoBb371 } from "../fixtures/bb-371";

const password = "Password123!";
const CAU_CHO_IN = "Ảnh đã chốt, Bean đang chuẩn bị in ạ";

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

test.describe("BB-402: luồng trạng thái hai màn", () => {
  let pg: Client;
  let nen: NenFixture;
  let boA: BoBb371;
  let boC: BoBb371;
  let boD: BoBb371;
  let boE: BoBb371;
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
    // Bộ A — đúng hình dạng bộ anh báo: đã duyệt, ảnh chỉnh đã gửi, Lark chưa đổi.
    boA = await dungBoBb371(pg, nen, "A402", { status: "approved", daGui: true });
    await pg.query(
      `update galleries set lark_trang_thai = null, submitted_at = now() - interval '2 hours' where id = $1`,
      [boA.id],
    );
    // Bộ C — chưa ai mở: bỏ lượt chọn fixture tạo sẵn, hai mốc trống.
    boC = await dungBoBb371(pg, nen, "C402", { status: "in_review" });
    await pg.query(`delete from selections where gallery_id = $1`, [boC.id]);
    await pg.query(`update galleries set sent_at = null, first_viewed_at = null where id = $1`, [boC.id]);
    // Vòng 2 — bộ D đã giao, bộ E đang chỉnh (studio đã xác nhận).
    boD = await dungBoBb371(pg, nen, "D402", { status: "delivered", daGui: true });
    boE = await dungBoBb371(pg, nen, "E402", { status: "in_retouch" });
    await pg.query(`update galleries set submitted_at = now() - interval '2 hours' where id = any($1::uuid[])`, [
      [boD.id, boE.id],
    ]);

    emailCs = `test_bb402_cs_${nen.runId}@demo.babybean.vn`;
    const { data, error } = await admin().auth.admin.createUser({ email: emailCs, password, email_confirm: true });
    if (error) throw error;
    staffId = data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      staffId,
      `Fixture BB-402 ${nen.runId} CSKH`,
      emailCs,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [staffId, nen.branchId]);
  });

  test.afterAll(async () => {
    test.setTimeout(90_000);
    if (!pg) return;
    try {
      await pg.query(`delete from staff_branches where staff_id = $1`, [staffId]).catch(() => {});
      await donNenFixture(pg, { galleryIds: [boA?.id, boC?.id, boD?.id, boE?.id], branchIds: [nen?.branchId], staffIds: [staffId] });
    } finally {
      await pg.end();
    }
  });

  test("1. khách, bộ đã duyệt: bước In/nhận ảnh + nút 'Chọn thêm ảnh', không 'Yêu cầu sửa'", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${boA.maBaMe}`);
    const buocHienTai = page.locator('[aria-current="step"]').first();
    // Nhãn bước xuống dòng ở khoảng trắng đầu (`the-hanh-trinh.tsx`, pre-line): "In/nhận\nảnh".
    await expect(buocHienTai).toContainText(/In\/nhận\s+ảnh/, { timeout: 60_000 });
    await expect(page.getByText(CAU_CHO_IN).first()).toBeVisible();
    await expect(page.getByText("đang chờ chỉnh")).toHaveCount(0);

    const thanh = page.getByTestId("thanh-noi");
    // Thanh nổi ẩn (aria-hidden + inert) khi bìa còn chiếm màn (BB-258) — cuộn khỏi bìa trước.
    await page.mouse.wheel(0, 900);
    await expect(thanh.getByRole("button", { name: "Chọn thêm ảnh" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Yêu cầu sửa/ })).toHaveCount(0);
    // Thẻ đợt trước lưới: còn lối vào nhưng nút kiểu PHỤ — một nút chính trên màn.
    await expect(page.locator('[data-testid="chon-them-anh"] [data-kieu-nut="chinh"]')).toHaveCount(0);

    // Bấm: mở màn đợt mua thêm, hoặc (đợt trước còn chờ) đưa tới thẻ các đợt.
    await thanh.getByRole("button", { name: "Chọn thêm ảnh" }).click();
    await expect(page.getByText(/Chọn thêm ảnh cho|Thêm ảnh cho/).first()).toBeVisible({ timeout: 30_000 });
  });

  test("2. quản trị cùng bộ: huy hiệu 'Đã chốt, chờ in' + 'Khách đang thấy' cùng giai đoạn", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapNhanVien(page, emailCs, password);
    await page.goto(`/admin/galleries/${boA.id}`);
    await expect(page.getByText("Đã chốt, chờ in").first()).toBeVisible({ timeout: 120_000 });
    const khach = page.getByTestId("khach-dang-thay");
    await expect(khach).toContainText("In & giao");
    await expect(khach).toContainText(CAU_CHO_IN);
    await expect(page.getByText("Đã chọn ảnh · chờ chỉnh sửa")).toHaveCount(0);
  });

  test("3. khách mở bộ lần đầu: ghi first_viewed_at + sent_at; mở lại không đổi mốc", async ({ browser }) => {
    const khach = await browser.newPage({ extraHTTPHeaders: { "x-forwarded-for": ipMoi() } });
    await chanLh3TrenTrinhDuyet(khach);
    await khach.goto(`/g/${boC.maBaMe}`);
    await expect
      .poll(
        async () =>
          (await pg.query(`select first_viewed_at, sent_at from galleries where id = $1`, [boC.id])).rows[0],
        { timeout: 60_000 },
      )
      .toMatchObject({ first_viewed_at: expect.any(Date), sent_at: expect.any(Date) });
    const lan1 = (await pg.query(`select first_viewed_at, sent_at from galleries where id = $1`, [boC.id])).rows[0];
    await khach.reload();
    await khach.waitForLoadState("networkidle");
    const lan2 = (await pg.query(`select first_viewed_at, sent_at from galleries where id = $1`, [boC.id])).rows[0];
    expect(lan2.first_viewed_at.toISOString()).toBe(lan1.first_viewed_at.toISOString());
    expect(lan2.sent_at.toISOString()).toBe(lan1.sent_at.toISOString());
    await khach.close();
  });

  test("4. (vòng 2) bộ ĐÃ GIAO: thanh đáy có nút chính 'Chọn thêm ảnh', không hai nút", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${boD.maBaMe}`);
    const thanh = page.getByTestId("thanh-noi");
    // Thanh nổi có mặt ngay (ẩn bằng CSS/aria khi bìa còn chiếm màn — BB-258).
    await expect(thanh.locator("button", { hasText: "Chọn thêm ảnh" })).toBeAttached({ timeout: 60_000 });
    // Cuộn khỏi bìa: thanh hiện. Thẻ đợt (nếu có) nằm SAU lưới; nút của nó là kiểu PHỤ.
    await page.mouse.wheel(0, 900);
    await expect(thanh.getByRole("button", { name: "Chọn thêm ảnh" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Yêu cầu sửa/ })).toHaveCount(0);
    await expect(page.locator('[data-testid="chon-them-anh"] [data-kieu-nut="chinh"]')).toHaveCount(0);
  });

  test("5. (vòng 2) bộ ĐANG CHỈNH: nút chính 'Chọn thêm ảnh', không 'Yêu cầu sửa lại'", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${boE.maBaMe}`);
    const thanh = page.getByTestId("thanh-noi");
    await expect(thanh.locator("button", { hasText: "Chọn thêm ảnh" })).toBeAttached({ timeout: 60_000 });
    await page.mouse.wheel(0, 900);
    await expect(thanh.getByRole("button", { name: "Chọn thêm ảnh" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Yêu cầu sửa/ })).toHaveCount(0);
    // Lối phụ chỉ có khi chi nhánh có link chat; có thì nó là liên kết "Nhắn Bean".
    const loiPhu = thanh.getByTestId("loi-phu-thanh-day");
    if ((await loiPhu.count()) > 0) await expect(loiPhu).toHaveText("Nhắn Bean");
    // Thẻ đợt trước lưới vẫn có lối vào + giá, nhưng nút của nó là kiểu PHỤ (một nút chính).
    const the = page.getByTestId("chon-them-anh");
    await expect(the).toContainText("không cần xin mở lại");
    await expect(the.locator('[data-kieu-nut="phu"]')).toHaveCount(1);
    await expect(the.locator('[data-kieu-nut="chinh"]')).toHaveCount(0);
  });
});
