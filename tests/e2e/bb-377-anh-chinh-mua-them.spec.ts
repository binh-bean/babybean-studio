/**
 * BB-377 — ảnh chỉnh sửa của ảnh MUA THÊM đi trọn vòng duyệt (anh 06/10: "App dụng
 * thêm logic vào cả phần ảnh gia đình chọn mua thêm").
 *
 * Bộ Fixture: 4 ảnh gốc trong gói (2 ảnh chỉnh) + ĐỢT 2 mua thêm 2 tấm (IMG_0005,
 * IMG_0006, `selection_rounds` đã xác nhận) với 2 ảnh chỉnh "-Edit" cùng thư mục
 * "anh chinh sua".
 *
 * Hai chế độ, tự nhận theo bb-dev:
 *   · ĐÃ áp 0095 (`anh_chinh_dot`): bộ ĐÃ DUYỆT, ảnh trong gói đã gửi; CSKH bấm "Gửi
 *     khách duyệt Mua thêm đợt 2" → bộ VẪN "approved"; khách thấy khối "Mua thêm đợt
 *     2", so trước/sau, xin sửa 1 tấm có khoanh vùng → vòng sửa gắn `dot_khoa`.
 *   · CHƯA áp 0095: bộ đang chỉnh (in_retouch); CSKH gửi chung cả bộ (vòng BB-371)
 *     → khách vẫn thấy ảnh chia nhãn "Trong gói" / "Mua thêm đợt 2", so trước/sau,
 *     xin sửa 1 tấm mua thêm có khoanh vùng; quản trị thấy tấm đó thuộc "Mua thêm đợt 2".
 *
 * Lark: máy chủ thử chạy với PHEP_THU_TRINH_DUYET=1 — không ghi Lark thật.
 * Chạy: PW_PORT=3377 npx playwright test tests/e2e/bb-377-anh-chinh-mua-them.spec.ts --workers=1
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import path from "node:path";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { dungNenBb371 } from "../fixtures/bb-371";
import { dungBoBb377, type BoBb377 } from "../fixtures/bb-377";

const password = "Password123!";
function thuMucAnh(): string {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const thu = path.join(d, "babybean-assets");
    if (fs.existsSync(thu)) return path.join(thu, "dot17", "bb377");
    d = path.dirname(d);
  }
  return path.resolve(__dirname, "../../test-results", "bb377");
}
const THU_MUC_ANH = thuMucAnh();
const chup = async (page: Page, ten: string) => {
  fs.mkdirSync(THU_MUC_ANH, { recursive: true });
  await page.screenshot({ path: path.join(THU_MUC_ANH, ten), fullPage: false });
};

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

test.describe("BB-377: ảnh chỉnh của ảnh mua thêm — CSKH gửi đợt, khách xem/so sánh/xin sửa, quản trị thấy đúng đợt", () => {
  let pg: Client;
  let nen: NenFixture;
  let bo: BoBb377;
  let emailCs = "";
  let staffId = "";
  let theoDot = false;

  const admin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    theoDot = !!(await pg.query(`select to_regclass('public.anh_chinh_dot')::text t`)).rows[0].t;
    console.log(`[BB-377] chế độ: ${theoDot ? "ĐÃ áp 0095 — vòng duyệt riêng từng đợt" : "CHƯA áp 0095 — vòng chung cả bộ"}`);
    nen = (await dungNenBb371(pg)).nen;
    bo = theoDot
      ? await dungBoBb377(pg, nen, "MuaThem", { status: "approved", guiTrongGoi: true })
      : await dungBoBb377(pg, nen, "MuaThem", { status: "in_retouch" });

    emailCs = `test_bb377_cs_${nen.runId}@demo.babybean.vn`;
    const { data, error } = await admin().auth.admin.createUser({ email: emailCs, password, email_confirm: true });
    if (error) throw error;
    staffId = data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      staffId,
      `Fixture BB-377 ${nen.runId} CSKH`,
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

  test("1. CSKH: khối Ảnh chỉnh sửa chia 'Trong gói' / 'Mua thêm đợt 2' → gửi khách duyệt", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapCs(page, emailCs);

    await page.goto(`/admin/viec-can-xu-ly?tab=anh-chinh-sua`);
    const dong = page.getByTestId("dong-anh-chinh-sua").filter({ hasText: `Fixture BB-371 ${nen.runId}` });
    if (theoDot) {
      await expect(dong.and(page.locator('[data-khoa="dot:2"]'))).toContainText(
        "Có 2 ảnh chỉnh sửa (Mua thêm đợt 2) — kiểm rồi gửi khách",
        { timeout: 30_000 },
      );
    } else {
      await expect(dong.first()).toContainText("Có 4 ảnh chỉnh sửa — kiểm rồi gửi khách", { timeout: 30_000 });
    }
    await chup(page, "1-viec-can-xu-ly-1440.png");

    await page.goto(`/admin/galleries/${bo.id}`);
    const khoi = page.getByTestId("khoi-anh-chinh-admin");
    await expect(khoi).toBeVisible({ timeout: 120_000 });
    const nhomMt = khoi.locator('[data-testid="nhom-anh-chinh-admin"][data-khoa="dot:2"]');
    await expect(nhomMt).toContainText("Mua thêm đợt 2 (2 tấm)");
    await expect(nhomMt.locator("img")).toHaveCount(2);
    await expect(khoi.locator('[data-testid="nhom-anh-chinh-admin"][data-khoa="goc"]')).toContainText("Trong gói (2 tấm)");
    await khoi.scrollIntoViewIfNeeded();
    await chup(page, "2-quan-tri-chia-dot-1440.png");

    if (theoDot) {
      await expect(nhomMt.getByTestId("trang-thai-nhom")).toHaveText("2 tấm mới chưa gửi");
      await nhomMt.getByTestId("nut-gui-dot").click();
      await expect(khoi.getByTestId("hop-hoi-gui-dot")).toContainText("Trạng thái bộ ảnh giữ nguyên");
      await khoi.getByTestId("dong-y-gui-dot").click();
      await expect(khoi).toContainText("Đã gửi 2 ảnh Mua thêm đợt 2 cho khách duyệt", { timeout: 60_000 });
      const { rows } = await pg.query(`select status from galleries where id = $1`, [bo.id]);
      expect(rows[0].status).toBe("approved");
    } else {
      await expect(khoi.getByTestId("goi-y-0095")).toBeVisible();
      await khoi.getByTestId("nut-gui-khach-duyet").click();
      await khoi.getByTestId("dong-y-gui-khach").click();
      await expect(khoi).toContainText("Đã gửi 4 ảnh cho khách duyệt", { timeout: 60_000 });
    }
    await chup(page, "3-quan-tri-da-gui-1440.png");
  });

  test("2. khách: thấy nhãn 'Mua thêm đợt 2', so trước/sau, xin sửa 1 tấm mua thêm có khoanh vùng", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${bo.maBaMe}`);
    const khoi = page.getByTestId("khoi-anh-chinh");
    await expect(khoi).toBeVisible({ timeout: 120_000 });
    const nhomMt = khoi.locator('[data-testid="nhom-anh-chinh"][data-khoa="dot:2"]');
    await expect(nhomMt.getByTestId("nhan-dot")).toHaveText("Mua thêm đợt 2");
    await expect(nhomMt.getByTestId("o-anh-chinh")).toHaveCount(2);
    await expect(khoi.locator('[data-testid="nhom-anh-chinh"][data-khoa="goc"]').getByTestId("nhan-dot")).toHaveText(
      "Trong gói",
    );
    await nhomMt.scrollIntoViewIfNeeded();
    for (const im of await nhomMt.getByTestId("o-anh-chinh").locator("img").all()) {
      await expect
        .poll(() => im.evaluate((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth), {
          timeout: 20_000,
        })
        .toBeGreaterThan(0);
    }
    await chup(page, "4-khach-nhan-mua-them-390.png");

    // Mở lớn tấm mua thêm đầu → nhãn đợt + so với ảnh gốc.
    await nhomMt.getByTestId("o-anh-chinh").first().click();
    const xem = page.getByTestId("xem-lon-anh-chinh");
    await expect(xem.getByTestId("nhan-dot-xem-lon")).toHaveText("Mua thêm đợt 2");
    await xem.getByTestId("nut-so-sanh-goc").click();
    const khung = xem.getByTestId("so-sanh-truoc-sau");
    await expect(khung).toBeVisible();
    await xem.getByTestId("thanh-truot-so-sanh").fill("35");
    for (const im of await khung.locator("img").all()) {
      await expect
        .poll(() => im.evaluate((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth), {
          timeout: 20_000,
        })
        .toBeGreaterThan(0);
    }
    await chup(page, "5-khach-so-sanh-mua-them-390.png");
    await xem.getByRole("button", { name: "Đóng" }).click();

    // Xin sửa — BB-401: ngay trong màn xem lớn ("Cần sửa tấm này"); đã áp 0095 thì gửi vào
    // vòng của đợt "Mua thêm đợt 2", chưa áp thì vòng chung cả bộ (kế hoạch gửi tự chia).
    await nhomMt.getByTestId("o-anh-chinh").first().click();
    await xem.getByTestId("nut-can-sua-tam").click();
    await xem.getByRole("textbox", { name: "Ba mẹ muốn Bean sửa gì ở tấm này ạ?" }).fill("Fixture BB-377 tấm mua thêm sáng hơn");
    await xem.getByTestId("nut-khoanh-vung").click();
    const anh = xem.getByTestId("anh-khoanh");
    const hop = (await anh.boundingBox())!;
    await page.mouse.click(hop.x + hop.width * 0.5, hop.y + hop.height * 0.4);
    await expect(anh).toHaveAttribute("data-so-vung", "1");
    await chup(page, "6-khach-khoanh-mua-them-390.png");
    await xem.getByTestId("nut-xong-ghi-chu").click();
    await xem.getByTestId("nut-gui-yeu-cau-sua").click();
    const tomTat = page.getByTestId("tom-tat-gui-sua");
    await expect(tomTat.getByTestId("so-tam-can-sua")).toContainText("1 tấm cần sửa");
    await tomTat.getByTestId("nut-xac-nhan-gui-sua").click();
    await expect(page.getByTestId("xac-nhan-da-gui-sua")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("nut-dong-ket-qua").click();
    await expect(page.getByText("Bean đã nhận yêu cầu sửa lần 1 của ba mẹ ạ.").first()).toBeVisible({ timeout: 30_000 });
    await chup(page, "7-khach-da-gui-yeu-cau-390.png");

    const { rows } = await pg.query(`select * from revision_requests where gallery_id = $1`, [bo.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].round).toBe(1);
    expect(rows[0].note).toContain("IMG_0005-Edit.jpg: Fixture BB-377 tấm mua thêm sáng hơn");
    const { rows: ct } = await pg.query(`select photo_id, marks from revision_request_items where revision_request_id = $1`, [
      rows[0].id,
    ]);
    expect(ct).toHaveLength(1);
    expect(ct[0].photo_id).toBe(bo.chinhMuaThem[0]!.id);
    expect((ct[0].marks as unknown[]).length).toBe(1);
    const { rows: g } = await pg.query(`select status from galleries where id = $1`, [bo.id]);
    if (theoDot) {
      expect(rows[0].dot_khoa).toBe("dot:2");
      expect(rows[0].note).toContain("[Mua thêm đợt 2]");
      // Đợt mua thêm có vòng riêng — bộ đã duyệt vẫn giữ nguyên.
      expect(g[0].status).toBe("approved");
    } else {
      expect(g[0].status).toBe("in_retouch");
    }
  });

  test("3. quản trị: vòng sửa lần 1 ghi đúng tấm 'Mua thêm đợt 2' + vùng khoanh; Việc cần xử lý báo khách xin sửa", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapCs(page, emailCs);
    await page.goto(`/admin/galleries/${bo.id}`);
    const khoi = page.getByTestId("khoi-anh-chinh-admin");
    await expect(khoi).toBeVisible({ timeout: 120_000 });
    const vong = khoi.getByTestId("vong-sua-admin").first();
    await expect(vong).toContainText("Khách yêu cầu sửa lần 1");
    await expect(vong).toContainText("Lark: Sửa");
    const muc = vong.getByTestId("muc-sua-admin");
    await expect(muc).toHaveCount(1);
    await expect(muc).toContainText("IMG_0005-Edit.jpg");
    await expect(muc.getByTestId("dot-muc-sua")).toHaveText("Mua thêm đợt 2");
    await expect(muc.getByTestId("ghi-chu-muc-sua")).toHaveText("Fixture BB-377 tấm mua thêm sáng hơn");
    await expect(vong.getByTestId("vung-khoanh")).toHaveCount(1);
    if (theoDot) {
      await expect(vong.getByTestId("dot-vong-sua")).toContainText("Mua thêm đợt 2");
      await expect(
        khoi.locator('[data-testid="nhom-anh-chinh-admin"][data-khoa="dot:2"]').getByTestId("trang-thai-nhom"),
      ).toHaveText("Khách yêu cầu sửa");
    }
    await vong.scrollIntoViewIfNeeded();
    await chup(page, "8-quan-tri-yeu-cau-sua-mua-them-1440.png");

    await page.goto(`/admin/viec-can-xu-ly?tab=anh-chinh-sua`);
    const dong = page.getByTestId("dong-anh-chinh-sua").filter({ hasText: `Fixture BB-371 ${nen.runId}` });
    await expect(dong.filter({ hasText: "Khách yêu cầu sửa lần 1" })).toHaveCount(1, { timeout: 30_000 });
    if (theoDot) await expect(dong.filter({ hasText: "Khách yêu cầu sửa lần 1" })).toContainText("(Mua thêm đợt 2)");
    await chup(page, "9-viec-can-xu-ly-khach-sua-1440.png");
  });
});
