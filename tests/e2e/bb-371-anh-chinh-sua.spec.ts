/**
 * BB-371 — vòng ảnh chỉnh sửa trong app (anh yêu cầu 06/10).
 *
 * Kịch bản nối tiếp trên MỘT bộ ảnh Fixture (4 ảnh gốc "JPG" + 2 ảnh trong thư mục
 * con "anh chinh sua"):
 *   1. Trước khi CSKH gửi: màn khách KHÔNG có ảnh chỉnh (không chip lọc, không
 *      khối "Ảnh đã chỉnh"), lưới đủ 4 ảnh gốc.
 *   2. CSKH: Việc cần xử lý → tab "Ảnh chỉnh sửa" có dòng "Có 2 ảnh chỉnh sửa —
 *      kiểm rồi gửi khách" → mở bộ → "Gửi khách duyệt".
 *   3. Khách: khối "Ảnh đã chỉnh" 2 tấm, thanh tiến độ ở "Duyệt ảnh", mở lớn → so
 *      với ảnh gốc (thanh trượt) → "Yêu cầu sửa": chọn tấm, ghi chú, khoanh vùng
 *      (khi đã áp 0091), ghi chú chung → gửi → "Bean đã nhận yêu cầu sửa lần 1".
 *   4. CSKH: chi tiết bộ ảnh thấy lần sửa 1 với từng tấm + ghi chú (+ vùng khoanh
 *      khi đã áp 0091); tab Việc cần xử lý có "Khách yêu cầu sửa lần 1".
 *
 * Lark: máy chủ thử chạy với PHEP_THU_TRINH_DUYET=1 — `ghiTrangThaiSuaLenLark` và thẻ
 * tin nhóm tự tắt. Dữ liệu: nền Fixture riêng, dọn theo id ở afterAll.
 *
 * Chạy: PW_PORT=3371 npx playwright test tests/e2e/bb-371-anh-chinh-sua.spec.ts --workers=1
 */
import { type Page } from "@playwright/test";
// BB-388 — mỗi ca một IP riêng: mở link khách bị giới hạn 10 lần/IP/15 phút (helper ghi rõ vì
// sao). Từ `::1` chung, ca 3 đỏ 429 "Bean chưa mở được bộ ảnh" khi cùng server vừa chạy spec khác.
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import path from "node:path";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { dungBoBb371, dungNenBb371, type BoBb371 } from "../fixtures/bb-371";

const password = "Password123!";
function thuMucAnh(): string {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const thu = path.join(d, "babybean-assets");
    if (fs.existsSync(thu)) return path.join(thu, "dot17", "bb371");
    d = path.dirname(d);
  }
  return path.resolve(__dirname, "../../test-results", "bb371");
}
const THU_MUC_ANH = thuMucAnh();
const chup = async (page: Page, ten: string) => {
  fs.mkdirSync(THU_MUC_ANH, { recursive: true });
  await page.screenshot({ path: path.join(THU_MUC_ANH, ten), fullPage: false });
};

/**
 * Đăng nhập CSKH. Bàn làm việc có lúc dựng chậm hơn 15 giây khi nhiều đội cùng chạy
 * phép thử trên bb-dev (sự kiện "load" tới muộn dù đã vào /admin) — chờ thêm theo
 * "commit" thay vì kết luận hỏng.
 */
async function dangNhapCs(page: Page, email: string) {
  try {
    await dangNhapNhanVien(page, email, password);
  } catch (e) {
    await page.waitForURL("**/admin**", { waitUntil: "commit", timeout: 60_000 }).catch(() => {
      throw e;
    });
  }
}

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

test.describe("BB-371: ảnh chỉnh sửa — CSKH gửi duyệt, khách xem/so sánh/xin sửa trong app", () => {
  let pg: Client;
  let nen: NenFixture;
  let bo: BoBb371;
  let emailCs = "";
  let staffId = "";
  let coBangChiTiet = false;

  const admin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    nen = (await dungNenBb371(pg)).nen;
    // Đúng ca ảnh anh chụp 06/10: bộ còn "Chờ xác nhận" mà ảnh chỉnh đã về thư mục con.
    bo = await dungBoBb371(pg, nen, "Bo", { status: "submitted" });
    coBangChiTiet = !!(await pg.query(`select to_regclass('public.revision_request_items')::text t`)).rows[0].t;

    emailCs = `test_bb371_cs_${nen.runId}@demo.babybean.vn`;
    const { data, error } = await admin().auth.admin.createUser({ email: emailCs, password, email_confirm: true });
    if (error) throw error;
    staffId = data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      staffId,
      `Fixture BB-371 ${nen.runId} CSKH`,
      emailCs,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [staffId, nen.branchId]);
  });

  test.afterAll(async () => {
    test.setTimeout(90_000);
    if (!pg) return;
    try {
      await pg.query(`delete from staff_branches where staff_id = $1`, [staffId]).catch(() => {});
      await donNenFixture(pg, { galleryIds: [bo?.id], branchIds: [nen?.branchId], staffIds: [staffId] });
    } finally {
      await pg.end();
    }
  });

  test("1. chưa gửi: khách không thấy ảnh chỉnh, lưới đủ 4 ảnh gốc, không chip 'anh chinh sua'", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${bo.maBaMe}`);
    await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("the-anh")).toHaveCount(4);
    await expect(page.getByTestId("khoi-anh-chinh")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /anh chinh sua/i })).toHaveCount(0);
  });

  test("2. CSKH: Việc cần xử lý báo 2 ảnh chỉnh → mở bộ → Gửi khách duyệt", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapCs(page, emailCs);
    await page.goto(`/admin/viec-can-xu-ly?tab=anh-chinh-sua`);
    const dong = page.getByTestId("dong-anh-chinh-sua").filter({ hasText: `Fixture BB-371 ${nen.runId}` });
    await expect(dong).toHaveCount(1, { timeout: 30_000 });
    await expect(dong).toContainText("Có 2 ảnh chỉnh sửa — kiểm rồi gửi khách");
    await expect(dong).toHaveAttribute("data-loai", "cho_gui");
    await chup(page, "1-viec-can-xu-ly-anh-chinh-1440.png");

    await dong.getByRole("link").click();
    const khoi = page.getByTestId("khoi-anh-chinh-admin");
    await expect(khoi).toBeVisible({ timeout: 120_000 });
    await expect(khoi.getByTestId("trang-thai-gui-anh-chinh")).toContainText("2 tấm mới chưa gửi khách");
    await khoi.scrollIntoViewIfNeeded();
    await chup(page, "2-quan-tri-truoc-gui-1440.png");
    // Hộp hỏi lại: bộ còn Chờ xác nhận → nói rõ sẽ xác nhận + khoá. Chưa đồng ý thì
    // KHÔNG có lời gọi API nào.
    const goiGui: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/anh-chinh-sua/gui-khach")) goiGui.push(r.method());
    });
    await khoi.getByTestId("nut-gui-khach-duyet").click();
    const hop = khoi.getByTestId("hop-hoi-gui-khach");
    await expect(hop).toContainText("Danh sách chọn của khách sẽ được xác nhận và khoá");
    await chup(page, "2b-hop-hoi-xac-nhan-va-khoa-1440.png");
    await hop.getByTestId("huy-gui-khach").click();
    await expect(hop).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(goiGui).toEqual([]);
    expect((await pg.query(`select status from galleries where id = $1`, [bo.id])).rows[0].status).toBe("submitted");

    await khoi.getByTestId("nut-gui-khach-duyet").click();
    await khoi.getByTestId("dong-y-gui-khach").click();
    await expect(khoi).toContainText("Đã gửi 2 ảnh cho khách duyệt", { timeout: 60_000 });
    const { rows } = await pg.query(`select status from galleries where id = $1`, [bo.id]);
    expect(rows[0].status).toBe("awaiting_approval");
  });

  test("3. khách: xem ảnh đã chỉnh, so với ảnh gốc, gửi yêu cầu sửa chi tiết", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${bo.maBaMe}`);
    const khoi = page.getByTestId("khoi-anh-chinh");
    await expect(khoi).toBeVisible({ timeout: 120_000 });
    await expect(khoi.getByTestId("o-anh-chinh")).toHaveCount(2);
    // Thanh tiến độ ở "Duyệt ảnh", không kẹt "Chờ xác nhận".
    await expect(page.locator('[aria-current="step"]').first()).toContainText("Duyệt ảnh");
    await khoi.scrollIntoViewIfNeeded();
    for (const im of await khoi.getByTestId("o-anh-chinh").locator("img").all()) {
      await expect
        .poll(() => im.evaluate((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth), {
          timeout: 20_000,
        })
        .toBeGreaterThan(0);
    }
    await chup(page, "3-khach-anh-da-chinh-390.png");

    // Mở lớn tấm 1 → so với ảnh gốc.
    await khoi.getByTestId("o-anh-chinh").first().click();
    const xem = page.getByTestId("xem-lon-anh-chinh");
    await expect(xem).toBeVisible();
    await xem.getByTestId("nut-so-sanh-goc").click();
    await expect(xem.getByTestId("so-sanh-truoc-sau")).toBeVisible();
    await xem.getByTestId("thanh-truot-so-sanh").fill("30");
    // Khung so sánh có kích thước thật và CẢ HAI ảnh đã tải (không phải khung 0px / ảnh hỏng).
    const khung = xem.getByTestId("so-sanh-truoc-sau");
    expect((await khung.boundingBox())!.height).toBeGreaterThan(200);
    for (const im of await khung.locator("img").all()) {
      await expect
        .poll(() => im.evaluate((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth), {
          timeout: 20_000,
        })
        .toBeGreaterThan(0);
    }
    await chup(page, "4-khach-so-sanh-truoc-sau-390.png");
    await xem.getByRole("button", { name: "Đóng" }).click();

    // Yêu cầu sửa — BB-401: ngay trong màn xem lớn ("Cần sửa tấm này"), không còn nút
    // "Yêu cầu sửa" dưới lưới.
    await khoi.getByTestId("o-anh-chinh").first().click();
    await xem.getByTestId("nut-can-sua-tam").click();
    await expect(xem.getByTestId("nut-can-sua-tam")).toHaveCount(0); // bảng ghi chú thay thanh duyệt
    await expect(xem.getByTestId("bang-sua-tam")).toBeVisible();
    await xem.getByRole("textbox", { name: "Ba mẹ muốn Bean sửa gì ở tấm này ạ?" }).fill("Fixture BB-371 da bé sáng hơn");
    if (coBangChiTiet) {
      await xem.getByTestId("nut-khoanh-vung").click();
      const anh = xem.getByTestId("anh-khoanh");
      const hop = (await anh.boundingBox())!;
      await page.mouse.click(hop.x + hop.width * 0.4, hop.y + hop.height * 0.3);
      await expect(anh).toHaveAttribute("data-so-vung", "1");
    } else {
      // Chưa áp 0091: không lưu được vùng khoanh → không mời ba mẹ khoanh.
      await expect(xem.getByTestId("nut-khoanh-vung")).toHaveCount(0);
    }
    await chup(page, "5-khach-ghi-chu-tam-390.png");
    await xem.getByTestId("nut-xong-ghi-chu").click();
    await expect(xem.getByTestId("trang-thai-tam-xem-lon")).toHaveAttribute("data-trang-thai", "xin_sua");
    await xem.getByTestId("nut-gui-yeu-cau-sua").click();
    const tomTat = page.getByTestId("tom-tat-gui-sua");
    await expect(tomTat.getByTestId("so-tam-can-sua")).toContainText("1 tấm cần sửa");
    await tomTat.getByLabel("Ba mẹ muốn nhắn thêm gì cho Bean không ạ?").fill("Fixture BB-371 cảm ơn Bean");
    await tomTat.getByTestId("nut-xac-nhan-gui-sua").click();
    // BB-401 — lời xin lỗi anh chốt hiện ngay, đóng thì về khung "đã nhận".
    const loiXinLoi = page.getByTestId("xac-nhan-da-gui-sua");
    await expect(loiXinLoi.getByTestId("loi-xin-loi-sua")).toContainText("Bean thành thật xin lỗi", { timeout: 30_000 });
    await loiXinLoi.getByTestId("nut-dong-ket-qua").click();

    // BB-388 — BB-384 (anh 06/10) thay khung "đã nhận" bằng khung xác nhận rõ: tiêu đề
    // `anhChinh.daNhanTieuDe` ("… lần N ạ") + danh sách tấm cần sửa + lời xin lỗi (BB-387).
    // Câu cũ "… lần N của ba mẹ ạ." nay chỉ là dòng báo trạng thái, không nằm trong khung này.
    const daNhan = page.getByTestId("da-nhan-yeu-cau-sua");
    await expect(daNhan).toContainText("Bean đã nhận yêu cầu sửa lần 1 ạ", { timeout: 30_000 });
    await expect(daNhan.getByTestId("da-nhan-cac-tam")).toContainText("1 tấm cần sửa");
    await expect(daNhan.getByTestId("da-nhan-cac-tam")).toContainText("IMG_0001-Edit.jpg");
    await expect(page.getByTestId("khoi-anh-chinh")).toHaveCount(0);
    await page.getByTestId("da-nhan-yeu-cau-sua").scrollIntoViewIfNeeded();
    await chup(page, "6-khach-da-nhan-yeu-cau-390.png");

    const { rows } = await pg.query(`select round, note from revision_requests where gallery_id = $1`, [bo.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toContain("IMG_0001-Edit.jpg: Fixture BB-371 da bé sáng hơn");
  });

  test("4. CSKH thấy đủ: từng tấm, ghi chú, (vùng khoanh); Việc cần xử lý báo khách xin sửa lần 1", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapCs(page, emailCs);
    const loiTrinhDuyet: string[] = [];
    page.on("pageerror", (e) => loiTrinhDuyet.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") loiTrinhDuyet.push(`console: ${m.text().slice(0, 300)}`);
    });
    await page.goto(`/admin/galleries/${bo.id}`);
    const khoi = page.getByTestId("khoi-anh-chinh-admin");
    await expect(khoi).toBeVisible({ timeout: 120_000 });
    const vong = khoi.getByTestId("vong-sua-admin").first();
    await expect(vong).toContainText("Khách yêu cầu sửa lần 1");
    await expect(vong).toContainText("Lark: Sửa");
    await expect(vong).toContainText("Fixture BB-371 cảm ơn Bean");
    if (coBangChiTiet) {
      // BB-375 — đã áp 0091: ghi chú của tấm nằm NGAY DƯỚI ảnh của tấm đó; dòng ghép
      // "• tên: ghi chú" của `revision_requests.note` không vẽ lại (đó là bản lùi khi chưa có 0091).
      const muc = vong.getByTestId("muc-sua-admin");
      await expect(muc).toHaveCount(1);
      await expect(muc).toContainText("IMG_0001-Edit.jpg");
      await expect(muc.getByTestId("ghi-chu-muc-sua")).toHaveText("Fixture BB-371 da bé sáng hơn");
      await expect(vong.getByTestId("vung-khoanh")).toHaveCount(1);
    } else {
      await expect(vong).toContainText("IMG_0001-Edit.jpg: Fixture BB-371 da bé sáng hơn");
    }
    // Khối cũ (link Drive) ẩn — ghi chú xin sửa chỉ hiện MỘT lần.
    await expect(page.getByRole("heading", { name: "Vòng duyệt ảnh đã chỉnh" })).toHaveCount(0);
    await expect(page.getByText("Fixture BB-371 da bé sáng hơn", { exact: false })).toHaveCount(1);
    await vong.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    console.log(`[BB-371] lỗi trình duyệt ở chi tiết bộ ảnh: ${JSON.stringify(loiTrinhDuyet)}`);
    // BB-375 — trang chi tiết bộ ảnh không còn lỗi hydration (vd `<p>` bọc Badge `<div>`).
    expect(loiTrinhDuyet.filter((l) => /hydrat|cannot be a descendant|cannot contain a nested/i.test(l))).toEqual([]);
    await chup(page, "7-quan-tri-yeu-cau-sua-1440.png");

    await page.goto(`/admin/viec-can-xu-ly?tab=anh-chinh-sua`);
    const dong = page.getByTestId("dong-anh-chinh-sua").filter({ hasText: `Fixture BB-371 ${nen.runId}` });
    await expect(dong).toContainText("Khách yêu cầu sửa lần 1", { timeout: 30_000 });
    await chup(page, "8-viec-can-xu-ly-khach-sua-1440.png");
  });
});
