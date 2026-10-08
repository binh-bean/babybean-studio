/**
 * BB-400 — mọi lượt chọn dùng CÙNG bộ công cụ (anh 08/10/2026: "lượt sau chỉ còn thả
 * tim, không còn đủ chức năng như lượt đầu").
 *
 * VIẾT, CHƯA CHẠY (luật Đợt 19: không chạy gì chạm bb-dev). Claude chạy lần lượt khi vắng:
 *
 *   MOCK_DRIVE_TRE=1 PW_PORT=3181 npx playwright test tests/e2e/bb-400-dong-bo-luot-chon.spec.ts --workers=1
 *
 * Nền dữ liệu: `dungNenFixture` (chi nhánh + khách "Fixture BB-400 …" RIÊNG), dọn theo id
 * ở afterAll bằng `donNenFixture` (AGENTS §6). Không bắn Lark thật (chốt `khongGuiRaLarkThat`).
 *
 * Ca:
 *   1. Đợt 2 (ba mẹ): chip lọc + So sánh + ghi chú + "Đặt in" theo ảnh như đợt 1; ghi chú
 *      của tấm mới đi kèm lúc chốt và nằm trong `selection_items.retouch_note`.
 *   2. Đợt 2: so sánh 2 tấm mở đúng màn so sánh của đợt 1.
 *   3. Người thân gợi ý (suggester): xem lớn có Tim · Ghi chú · Đặt in; KHÔNG có nút chốt.
 *   4. Gia đình được mời (viewer): xem lớn có "Đặt in" → mở MÀN MUA MỚI (thay cả trang, lưới chung).
 *   5. Vòng 2 — người gợi ý ở đợt N gợi ý một tấm (tim gia đình chung) → ba mẹ thấy dấu trên lưới đợt.
 *   6–8. Vòng 4 — "Trên tường" cố định ở màn xem lớn: gia đình (đặt → màn mua gia đình), đợt 2
 *        (thêm vào giỏ đợt), bộ đã giao (đặt → "Chọn thêm ảnh").
 */

import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const DT = { width: 390, height: 844 };
const GHI_CHU = "Làm mịn da nhẹ, giữ màu áo";

test.describe.serial("BB-400: đồng bộ các lượt chọn", () => {
  let pg: Client;
  let nen: NenFixture | null = null;
  let coBang = false;
  const galleryIds: string[] = [];

  // Bộ A — đợt 1 đã xác nhận (in_retouch): ba mẹ chọn thêm đợt 2.
  let maBaMeA = "";
  let selectionA = "";
  const anhA: string[] = [];
  // Bộ B — đang chọn đợt 1 (in_review): người gợi ý + gia đình được mời.
  let maGoiYB = "";
  let maGiaDinhB = "";
  // Bộ C — đã giao.
  let maBaMeC = "";

  async function taoBo(p: { ten: string; status: string; soAnh: number; daChon: number }) {
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price, download_enabled)
       values ($1,$2,$3,$4,$5,'https://example.com/bb400',$6,5,30000,false) returning id`,
      [nen!.branchId, nen!.customerId, `Fixture BB-400 ${nen!.runId} ${p.ten}`, p.status, `fixture-bb400-${nen!.runId}-${p.ten}`, p.soAnh],
    );
    const id = g[0].id as string;
    galleryIds.push(id);
    const anh: string[] = [];
    for (let i = 1; i <= p.soAnh; i++) {
      const { rows } = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, width, height, status)
         values ($1,$2,$3,'image/jpeg',$4,3000,2000,'active') returning id`,
        [id, `bb400-${nen!.runId}-${p.ten}-${i}`, `BB400${p.ten}_00${i}.jpg`, i],
      );
      anh.push(rows[0].id as string);
    }
    const ma = randomBytes(32).toString("base64url");
    const { rows: l } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active') returning id`,
      [id, sha256(ma), ma.slice(0, 6)],
    );
    const { rows: s } = await pg.query(
      `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, submitted_by_name)
       values ($1,$2,true,${p.daChon > 0 && p.status === "in_retouch" ? "now()" : "null"},'Mẹ Fixture') returning id`,
      [id, l[0].id],
    );
    for (let i = 0; i < p.daChon; i++) {
      await pg.query(`insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`, [
        s[0].id,
        anh[i],
        id,
      ]);
    }
    return { id, ma, selectionId: s[0].id as string, anh };
  }

  async function themLink(galleryId: string, role: "suggester" | "viewer") {
    const ma = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,$4,$5,'active')`,
      [galleryId, sha256(ma), ma.slice(0, 6), role, `Fixture BB-400 ${role}`],
    );
    return ma;
  }

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const { rows: kt } = await pg.query(`select to_regclass('public.selection_rounds') as bang`);
    coBang = kt[0]?.bang !== null;
    if (!coBang) return;
    nen = await dungNenFixture(pg, "BB-400");

    const a = await taoBo({ ten: "A", status: "in_retouch", soAnh: 8, daChon: 3 });
    maBaMeA = a.ma;
    selectionA = a.selectionId;
    anhA.push(...a.anh);

    const b = await taoBo({ ten: "B", status: "in_review", soAnh: 6, daChon: 0 });
    maGoiYB = await themLink(b.id, "suggester");
    maGiaDinhB = await themLink(b.id, "viewer");

    // Bộ C — đã giao (delivered): xem trên tường vẫn được ở bộ đã khoá (BB-400 vòng 4).
    const c = await taoBo({ ten: "C", status: "delivered", soAnh: 4, daChon: 2 });
    maBaMeC = c.ma;
  });

  test.afterAll(async () => {
    if (!pg) return;
    try {
      if (nen) {
        await pg.query(`delete from selection_rounds where gallery_id = any($1::uuid[])`, [galleryIds]);
        await donNenFixture(pg, { galleryIds, customerIds: [nen.customerId], branchIds: [nen.branchId] });
      }
    } finally {
      await pg.end();
    }
  });

  test("1. Đợt 2: chip lọc, So sánh, ghi chú, Đặt in như đợt 1 — ghi chú đi kèm lúc chốt", async ({ page }) => {
    test.skip(!coBang, "Chờ migration 0077 (selection_rounds).");
    test.setTimeout(120_000);
    await page.setViewportSize(DT);
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maBaMeA}`);

    const the = page.getByTestId("chon-them-anh");
    await expect(the).toBeVisible({ timeout: 30_000 });
    await the.getByRole("button", { name: "Chọn thêm ảnh" }).click();
    const man = page.getByTestId("man-chon-them-anh");
    await expect(man).toBeVisible();

    // Đầu màn: CÙNG hàng chip + nút So sánh như đợt 1.
    for (const loai of ["all", "selected", "unselected"]) {
      await expect(man.getByTestId(`chip-loc-${loai}`)).toBeVisible();
    }
    await expect(man.getByRole("button", { name: "So sánh" }).first()).toBeVisible();

    // Thả tim tấm mới đầu tiên (ảnh 4), rồi mở xem lớn đúng tấm đó.
    await man.getByRole("button", { name: "Chọn ảnh này" }).first().evaluate((el) => (el as HTMLElement).click());
    await man.getByRole("button", { name: "Xem ảnh 4" }).evaluate((el) => (el as HTMLElement).click());

    // Màn xem lớn: Tim · Ghi chú · Đặt in (ba cột như đợt 1).
    const thanh = page.getByTestId("thanh-day-3-cot");
    await expect(thanh).toBeVisible();
    await expect(thanh.getByRole("button", { name: "Ghi chú cho thợ chỉnh ảnh" })).toBeVisible();
    await expect(thanh.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" })).toBeVisible();

    // Ghi chú: gõ rồi rời ô — lưu ngay vào nháp đợt.
    await thanh.getByRole("button", { name: "Ghi chú cho thợ chỉnh ảnh" }).click();
    await page.locator("#ghi-chu-anh").fill(GHI_CHU);
    await page.locator("#ghi-chu-anh").blur();

    // "Đặt in" mở bảng "Tấm này dùng cho…" (cùng bảng của đợt 1).
    await thanh.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" }).click();
    await expect(page.getByRole("dialog", { name: "In ảnh này" })).toBeVisible();
    await page.getByRole("dialog", { name: "In ảnh này" }).getByRole("button", { name: "Đóng" }).click();

    // Tấm đã chốt đợt 1 (ảnh 1): ghi chú chỉ đọc, tim khoá.
    await page.keyboard.press("Escape");
    await man.getByRole("button", { name: "Xem ảnh 1" }).evaluate((el) => (el as HTMLElement).click());
    await expect(page.getByTestId("thanh-day-3-cot").getByRole("button", { name: "Bỏ chọn" })).toBeDisabled();
    await page.keyboard.press("Escape");

    // Chốt đợt 2 → ghi chú nằm trong selection_items của tấm mới.
    await man.getByTestId("nut-chot-dot").click();
    await page.getByTestId("nut-xac-nhan-chot-dot").click();
    await expect(page.getByTestId("trang-thai-dot-2")).toBeVisible({ timeout: 30_000 });
    const { rows } = await pg.query(
      "select dot, retouch_note from selection_items where selection_id = $1 and photo_id = $2",
      [selectionA, anhA[3]],
    );
    expect(rows[0]?.dot).toBe(2);
    expect(rows[0]?.retouch_note).toBe(GHI_CHU);
  });

  test("2. Đợt 3: So sánh 2 tấm mở đúng màn so sánh của đợt 1", async ({ page }) => {
    test.skip(!coBang, "Chờ migration 0077.");
    test.setTimeout(90_000);
    await page.setViewportSize(DT);
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maBaMeA}`);
    await page.getByTestId("chon-them-anh").getByRole("button", { name: "Chọn thêm ảnh" }).click();
    const man = page.getByTestId("man-chon-them-anh");
    await man.getByRole("button", { name: "So sánh" }).first().click();
    await expect(page.getByTestId("thanh-dau-so-sanh")).toBeVisible();
    await man.getByRole("button", { name: "Đánh dấu ảnh 6 để so sánh" }).evaluate((el) => (el as HTMLElement).click());
    await man.getByRole("button", { name: "Đánh dấu ảnh 7 để so sánh" }).evaluate((el) => (el as HTMLElement).click());
    const day = page.getByTestId("thanh-day-so-sanh");
    await expect(day).toContainText("Đã chọn 2 tấm để so sánh");
    await day.getByRole("button", { name: /Xem/ }).click();
    await expect(page.getByRole("dialog").filter({ hasText: "So sánh" }).first()).toBeVisible();
  });

  test("3. Người thân gợi ý: xem lớn có Tim · Ghi chú · Đặt in, không có nút chốt", async ({ page }) => {
    test.skip(!coBang, "Chờ migration 0077.");
    test.setTimeout(90_000);
    await page.setViewportSize(DT);
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maGoiYB}`);
    const theAnh = page.getByTestId("the-anh").first();
    await expect(theAnh).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Chốt danh sách" })).toHaveCount(0);
    await expect(page.getByTestId("chip-loc-unselected")).toBeVisible();

    await page.getByRole("button", { name: "Xem ảnh 1" }).evaluate((el) => (el as HTMLElement).click());
    const thanh = page.getByTestId("thanh-day-3-cot");
    await expect(thanh.getByRole("button", { name: "Chọn ảnh này" })).toBeEnabled();
    await expect(thanh.getByRole("button", { name: "Ghi chú cho thợ chỉnh ảnh" })).toBeVisible();
    await expect(thanh.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" })).toBeVisible();
  });

  test("4. Gia đình được mời: 'Đặt in' trong xem lớn mở MÀN MUA MỚI (thay cả trang, lưới chung)", async ({ page }) => {
    test.skip(!coBang, "Chờ migration 0077.");
    test.setTimeout(90_000);
    await page.setViewportSize(DT);
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maGiaDinhB}`);
    await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Xem ảnh 2" }).evaluate((el) => (el as HTMLElement).click());
    const thanh = page.getByTestId("thanh-day-3-cot");
    await expect(thanh.getByRole("button", { name: "Ghi chú cho thợ chỉnh ảnh" })).toHaveCount(0);
    await thanh.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" }).click();
    // BB-400 vòng 4 — strict mode thấy 2 nút: `PhotoLightbox` vẽ `bangSanPham` ở HAI chỗ — cột
    // phải máy tính (`<aside className="hidden … lg:block">`, luôn trong DOM, ẩn bằng CSS ở 390)
    // và tấm trượt điện thoại (`role="dialog" aria-label="In ảnh này"`, chỉ khi bấm "Đặt in").
    // Đúng thiết kế (BB-293), không phải lỗi giao diện: bấm nút TRONG tấm trượt đang mở.
    await page.getByRole("dialog", { name: "In ảnh này" }).getByTestId("nut-dat-in-gia-dinh").click();

    // Màn mua của gia đình: CÙNG lưới + chip + So sánh; tấm vừa "Đặt in" đã được thả tim.
    const man = page.getByTestId("man-mua-gia-dinh");
    await expect(man).toBeVisible();
    await expect(page.getByTestId("tam-chon-anh-mua-them")).toHaveCount(0); // tấm chọn ảnh riêng đã bỏ
    // Cửa hàng mở sẵn cho tấm đó; đóng lại để thấy lưới.
    await page.keyboard.press("Escape");
    await expect(man.getByTestId("the-anh")).toHaveCount(6);
    await expect(man.getByTestId("chip-loc-all")).toBeVisible();
    await expect(man.getByRole("button", { name: "So sánh" }).first()).toBeVisible();
    await expect(man.getByRole("button", { name: "Bỏ chọn" })).toHaveCount(1);
    await expect(man.getByTestId("nut-gui-mua-gia-dinh")).toBeDisabled();

    // Xem lớn trong màn mua: "Đặt in" là bảng sản phẩm chung (không phải lối mở màn mua nữa).
    await man.getByRole("button", { name: "Xem ảnh 2" }).evaluate((el) => (el as HTMLElement).click());
    await page.getByTestId("thanh-day-3-cot").getByRole("button", { name: "Sản phẩm cho tấm ảnh này" }).click();
    await expect(page.getByRole("dialog", { name: "In ảnh này" })).toBeVisible();
    await expect(page.getByTestId("nut-dat-in-gia-dinh")).toHaveCount(0);
  });

  test("5. Người gợi ý ở đợt N: gợi ý một tấm → ba mẹ thấy dấu 'Gia đình' trên lưới đợt", async ({ browser }) => {
    test.skip(!coBang, "Chờ migration 0077.");
    test.setTimeout(120_000);
    const maGoiYA = await themLink(galleryIds[0]!, "suggester");

    // Người gợi ý: vào CÙNG màn đợt, tim = gợi ý, không có nút chốt.
    const ctxGoiY = await browser.newContext({ viewport: DT });
    const goiY = await ctxGoiY.newPage();
    await chanLh3TrenTrinhDuyet(goiY);
    await goiY.goto(`/g/${maGoiYA}`);
    await goiY.getByTestId("nut-goi-y-dot").click();
    const manGoiY = goiY.getByTestId("man-chon-them-anh");
    await expect(manGoiY).toBeVisible();
    await expect(manGoiY.getByTestId("thanh-day-goi-y")).toBeVisible();
    await expect(manGoiY.getByTestId("nut-chot-dot")).toHaveCount(0);
    await manGoiY.getByRole("button", { name: "Chọn ảnh này" }).last().evaluate((el) => (el as HTMLElement).click());
    await expect(manGoiY.getByTestId("thanh-day-goi-y")).toContainText("Đã gợi ý 1 tấm");
    // Gợi ý lưu chung trên máy chủ (bảng tim gia đình), không vào danh sách của ba mẹ.
    await expect
      .poll(async () => (await pg.query("select count(*)::int n from tim_gia_dinh where gallery_id = $1", [galleryIds[0]])).rows[0].n)
      .toBe(1);
    await ctxGoiY.close();

    // Ba mẹ: lưới đợt có dấu "Gia đình" + chip "Gia đình thích".
    const ctxBaMe = await browser.newContext({ viewport: DT });
    const baMe = await ctxBaMe.newPage();
    await chanLh3TrenTrinhDuyet(baMe);
    await baMe.goto(`/g/${maBaMeA}`);
    await baMe.getByTestId("chon-them-anh").getByRole("button", { name: /Chọn thêm ảnh|Tiếp tục đợt/ }).click();
    const man = baMe.getByTestId("man-chon-them-anh");
    await expect(man.getByTestId("chip-loc-giaDinh")).toBeVisible();
    await man.getByTestId("chip-loc-giaDinh").click();
    await expect(man.getByTestId("dau-gia-dinh-thich")).toHaveCount(1);
    await ctxBaMe.close();
  });

  // -------------------------------------------------------------------------
  // BB-400 vòng 4 — "Xem trên tường / bàn nhà" ở MỌI màn, MỌI vai (nút cố định "Trên tường").
  // -------------------------------------------------------------------------

  /** Mở xem lớn tấm thứ n, bấm "Trên tường" → màn treo tường mở. Trả về màn treo. */
  async function moTrenTuong(page: import("@playwright/test").Page, phamVi: import("@playwright/test").Locator, n: number) {
    await phamVi.getByRole("button", { name: `Xem ảnh ${n}` }).evaluate((el) => (el as HTMLElement).click());
    const nut = page.getByTestId("nut-xem-tuong");
    test.skip((await nut.count()) === 0, "Bảng giá bb-dev không có ảnh in đang bán");
    await expect(nut).toHaveText(/Trên tường/);
    await nut.click();
    const man = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
    await expect(man).toBeVisible();
    return man;
  }

  test("6. Gia đình được mời: xem trên tường tấm CHƯA thả tim; nút đặt dẫn sang màn mua của gia đình", async ({ page }) => {
    test.skip(!coBang, "Chờ migration 0077.");
    test.setTimeout(90_000);
    await page.setViewportSize(DT);
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maGiaDinhB}`);
    await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 30_000 });
    const man = await moTrenTuong(page, page.locator("body"), 5);
    await expect(man.getByRole("button", { name: "Thêm vào giỏ" })).toHaveCount(0); // không mua thay ba mẹ
    await man.getByTestId("nut-dat-loi-khac-treo-tuong").click(); // "Đặt in tấm này"
    await expect(page.getByTestId("man-mua-gia-dinh")).toBeVisible();
  });

  test("7. Đợt 2 (ba mẹ): xem trên tường tấm chưa chọn; 'Thêm vào giỏ' vào giỏ của đợt", async ({ page }) => {
    test.skip(!coBang, "Chờ migration 0077.");
    test.setTimeout(90_000);
    await page.setViewportSize(DT);
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maBaMeA}`);
    await page.getByTestId("chon-them-anh").getByRole("button", { name: /Chọn thêm ảnh|Tiếp tục đợt/ }).click();
    const manDot = page.getByTestId("man-chon-them-anh");
    await expect(manDot).toBeVisible();
    const man = await moTrenTuong(page, manDot, 8);
    await expect(man.getByRole("button", { name: "Thêm vào giỏ" })).toBeVisible();
  });

  test("8. Bộ đã giao: xem trên tường vẫn được; nút đặt dẫn sang 'Chọn thêm ảnh' (đợt mới)", async ({ page }) => {
    test.skip(!coBang, "Chờ migration 0077.");
    test.setTimeout(90_000);
    await page.setViewportSize(DT);
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maBaMeC}`);
    await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 30_000 });
    const man = await moTrenTuong(page, page.locator("body"), 1);
    await expect(man.getByRole("button", { name: "Thêm vào giỏ" })).toHaveCount(0); // bộ đã khoá
    await expect(man.getByTestId("nut-dat-loi-khac-treo-tuong")).toHaveText("Chọn thêm ảnh");
  });
});
