/**
 * BB-321 — "đợt chọn": khách mua thêm ảnh theo từng đợt + nút "Mở lại" luôn chạy
 * được ở phía quản trị.
 *
 * ---------------------------------------------------------------------------
 * VIẾT NHƯNG CHƯA CHẠY — chờ migration 0077
 * ---------------------------------------------------------------------------
 * Migration `0077-dot-chon-anh.sql` chưa được áp lên bb-dev (Claude sẽ soát rồi
 * áp). Tệp này TỰ SKIP khi bảng `selection_rounds` chưa có. Sau khi áp, chạy:
 *
 *   MOCK_DRIVE_TRE=1 PW_PORT=3181 npx playwright test tests/e2e/bb-321-dot-chon.spec.ts --workers=1
 *
 * và ảnh chụp đối chiếu (390×844 và 1440×900) sẽ nằm ở
 * `babybean-assets\BB-321\chup\`:
 *   dot2-chon-*        màn chọn thêm (lưới màn chính): ảnh đợt 1 có huy hiệu khoá "Đợt 1", tick ảnh mới
 *   dot2-xac-nhan-*    hộp xác nhận: tên bé/số ảnh/số tiền
 *   dot-trang-thai-*   trạng thái từng đợt (chờ xác nhận / đã xác nhận / từ chối kèm lý do)
 *   quan-tri-dot-*     thẻ "Khách mua thêm đợt N" với Xác nhận / Từ chối (lý do)
 *   quan-tri-mo-lai-*  banner có nút "Mở lại" ở in_retouch, cảnh báo hậu kỳ, ô chọn đợt
 *
 * Dữ liệu: chỉ "Fixture BB-321 …", dọn sạch ở afterAll (AGENTS §6: bb-dev là dữ
 * liệu thật). Không bắn Lark thật (chốt `khongGuiRaLarkThat` + phép thử trình
 * duyệt của dự án).
 */

import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-321 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const emailNhanVien = `test_bb321_${runId}@demo.babybean.vn`;
const matKhauNhanVien = "Password123!";
const GIA_ANH = 30000;

const DT = { width: 390, height: 844 };
const MT = { width: 1440, height: 900 };

const CHUP = "C:\\Users\\binh\\Downloads\\claude code\\babybean-assets\\BB-321\\chup";
fs.mkdirSync(CHUP, { recursive: true });

async function chupHaiKho(page: Page, ten: string, sauKhiDoiKho?: () => Promise<void>) {
  for (const [nhan, kt] of [
    ["390x844", DT],
    ["1440x900", MT],
  ] as const) {
    await page.setViewportSize(kt);
    if (sauKhiDoiKho) await sauKhiDoiKho();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${CHUP}/${ten}-${nhan}.png` });
  }
}

test.describe.serial("BB-321: đợt chọn — khách mua thêm, CSKH xác nhận, mở lại", () => {
  let pg: Client;
  let coBang = false;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";
  let selectionId = "";
  const anh: string[] = [];

  const suKienAdmin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  async function trangThaiDot(soDot: number) {
    const { rows } = await pg.query(
      "select trang_thai from selection_rounds where gallery_id = $1 and so_dot = $2",
      [galleryId, soDot],
    );
    return rows[0]?.trang_thai as string | undefined;
  }

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const { rows: kt } = await pg.query(`select to_regclass('public.selection_rounds') as bang`);
    coBang = kt[0]?.bang !== null;
    if (!coBang) return;

    await pg.query(`delete from galleries where title like 'Fixture BB-321%' and created_at < now() - interval '6 hours'`);
    await pg.query(`delete from customers where full_name like 'Fixture BB-321%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { data, error } = await suKienAdmin().auth.admin.createUser({
      email: emailNhanVien,
      password: matKhauNhanVien,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      userId,
      `${NHAN} NV`,
      emailNhanVien,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [userId, branchId]);

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000321') returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    // Đợt 1 đã chốt và được CSKH xác nhận → 'in_retouch', hạn mức 3 ảnh.
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price, download_enabled)
       values ($1,$2,$3,'in_retouch',$4,'https://example.com/x',8,3,$5,false) returning id`,
      [branchId, customerId, `${NHAN} Bộ ảnh`, `fixture-bb321-${runId}`, GIA_ANH],
    );
    galleryId = g[0].id;

    maLink = randomBytes(32).toString("base64url");
    const { rows: lk } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active') returning id`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
    const { rows: sel } = await pg.query(
      `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, submitted_by_name)
       values ($1,$2,true,now(),'Mẹ Fixture') returning id`,
      [galleryId, lk[0].id],
    );
    selectionId = sel[0].id;

    for (let i = 1; i <= 8; i++) {
      const { rows: ph } = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, width, height, status)
         values ($1,$2,$3,'image/jpeg',$4,3000,2000,'active') returning id`,
        [galleryId, `bb321-${runId}-${i}`, `BB321_00${i}.jpg`, i],
      );
      anh.push(ph[0].id);
    }
    for (let i = 0; i < 3; i++) {
      await pg.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`,
        [selectionId, anh[i], galleryId],
      );
    }
  });

  test.afterAll(async () => {
    if (pg) {
      if (coBang && galleryId) {
        await pg.query("delete from thong_bao_khach where gallery_id = $1", [galleryId]);
        await pg.query("delete from push_dang_ky where gallery_id = $1", [galleryId]);
        await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
        await pg.query("delete from notifications where payload::text like $1", [`%${galleryId}%`]);
        await pg.query("delete from selection_rounds where gallery_id = $1", [galleryId]);
        await pg.query("delete from selections where gallery_id = $1", [galleryId]);
        await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
        await pg.query("delete from photos where gallery_id = $1", [galleryId]);
        await pg.query("delete from galleries where id = $1", [galleryId]);
      }
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
      if (userId) {
        await pg.query("delete from staff_branches where staff_id = $1", [userId]);
        await pg.query("delete from staff_profiles where id = $1", [userId]);
      }
      await pg.end();
    }
    if (userId) await suKienAdmin().auth.admin.deleteUser(userId);
  });

  test("1. KHÁCH: ảnh đợt 1 có huy hiệu khoá, chọn thêm 2 ảnh, hộp xác nhận nêu số ảnh + tiền, chốt đợt 2", async ({ page }) => {
    test.skip(!coBang, "Chờ áp migration 0077 (selection_rounds chưa có).");
    test.setTimeout(120_000);

    await page.setViewportSize(DT);
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maLink}`);

    const the = page.getByTestId("chon-them-anh");
    await expect(the).toBeVisible({ timeout: 30_000 });
    await expect(the).toContainText("không cần xin mở lại");

    // Màn đợt (bản vẽ BB-321 anh duyệt 29/09): ĐÚNG lưới màn chính — tấm đợt 1 mang
    // huy hiệu khoá "Đợt 1" THAY CHỖ tim (không có nút bấm), tấm còn lại có tim.
    await the.getByRole("button", { name: "Chọn thêm ảnh" }).click();
    const man = page.getByTestId("man-chon-them-anh");
    await expect(man).toBeVisible();
    await expect(man.getByTestId("dong-dau-man-dot")).toContainText("30.000");

    const huyHieu = man.getByTestId("huy-hieu-khoa");
    await expect(huyHieu).toHaveCount(3);
    await expect(huyHieu.first()).toHaveText("Đợt 1");
    await expect(man.getByRole("button", { name: "Bỏ chọn" })).toHaveCount(0);

    // Chọn thêm hai ảnh mới: hai tim "Chọn ảnh này" đầu tiên theo thứ tự lưới = ảnh 4 và 5.
    // Luật 29/09: đợt 2 tính tiền TỪ ẢNH ĐẦU TIÊN → 2 × 30.000.
    const tim = man.getByRole("button", { name: "Chọn ảnh này" });
    await tim.first().evaluate((el) => (el as HTMLElement).click());
    await tim.first().evaluate((el) => (el as HTMLElement).click());
    await expect(man.getByTestId("cau-tong-dot")).toHaveText(/^2 tấm mới · 60\.000\s₫$/);
    await chupHaiKho(page, "dot2-chon");

    await page.setViewportSize(DT);
    await man.getByTestId("nut-chot-dot").click();
    const hop = page.getByTestId("hop-xac-nhan-dot");
    await expect(hop).toBeVisible();
    // BB-358 / BB-400: đơn vị đếm ảnh ở màn khách là "tấm".
    await expect(hop.getByTestId("noi-dung-xac-nhan")).toContainText("2 tấm");
    await expect(hop.getByTestId("tong-tien-dot")).toContainText("60.000");
    await chupHaiKho(page, "dot2-xac-nhan");

    await page.setViewportSize(DT);
    await hop.getByTestId("nut-xac-nhan-chot-dot").click();

    // Trang tải lại; trạng thái đợt 2 = chờ xác nhận.
    const dot2 = page.getByTestId("trang-thai-dot-2");
    await expect(dot2).toBeVisible({ timeout: 30_000 });
    await expect(dot2).toContainText("Đợt 2 · 2 tấm");
    await expect(dot2).toContainText("Bean đang xác nhận đợt này ạ");
    await expect(page.getByTestId("man-chon-them-anh")).toHaveCount(0); // chốt xong quay về màn chính
    await dot2.scrollIntoViewIfNeeded();
    await chupHaiKho(page, "dot-trang-thai-cho", async () => {
      await page.getByTestId("trang-thai-cac-dot").scrollIntoViewIfNeeded();
    });

    expect(await trangThaiDot(2)).toBe("cho_xac_nhan");
    const { rows } = await pg.query("select dot from selection_items where selection_id = $1 and photo_id = $2", [
      selectionId,
      anh[3],
    ]);
    expect(rows[0].dot).toBe(2);
  });

  test("2. KHÁCH chốt tiếp đợt 3 NGAY khi đợt 2 còn chờ — không cần xin mở lại (luật doanh thu)", async ({ page }) => {
    test.skip(!coBang, "Chờ áp migration 0077.");
    test.setTimeout(120_000);
    await page.setViewportSize(DT);
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maLink}`);
    const the = page.getByTestId("chon-them-anh");
    await expect(the).toBeVisible({ timeout: 30_000 });
    await the.getByRole("button", { name: "Chọn thêm ảnh" }).click();
    const man = page.getByTestId("man-chon-them-anh");
    // Ảnh 1–5 đã khoá (đợt 1 + đợt 2 đang chờ) → tim đầu tiên còn chọn được là ảnh 6.
    await expect(man.getByTestId("huy-hieu-khoa").filter({ hasText: "Đợt 2" })).toHaveCount(2);
    await man.getByRole("button", { name: "Chọn ảnh này" }).first().evaluate((el) => (el as HTMLElement).click());
    await expect(man.getByTestId("cau-tong-dot")).toHaveText(/^1 tấm mới · 30\.000\s₫$/);
    await man.getByTestId("nut-chot-dot").click();
    await page.getByTestId("nut-xac-nhan-chot-dot").click();
    await expect(page.getByTestId("trang-thai-dot-3")).toBeVisible({ timeout: 30_000 });
    expect(await trangThaiDot(3)).toBe("cho_xac_nhan");
    expect(await trangThaiDot(2)).toBe("cho_xac_nhan");
  });

  test("3. QUẢN TRỊ: thẻ 'Khách mua thêm đợt N', Xác nhận đợt 2, Từ chối đợt 3 kèm lý do, xuất chỉ đợt 2", async ({ page, context }) => {
    test.skip(!coBang, "Chờ áp migration 0077.");
    test.setTimeout(150_000);

    await page.setViewportSize(MT);
    await dangNhapNhanVien(page, emailNhanVien, matKhauNhanVien);
    await page.goto(`/admin/galleries/${galleryId}`);

    const khoi = page.getByTestId("dot-chon-quan-tri");
    await expect(khoi).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("the-dot-2")).toContainText("Khách mua thêm đợt 2: 2 ảnh");
    await expect(page.getByTestId("the-dot-3")).toContainText("Khách mua thêm đợt 3: 1 ảnh");
    await chupHaiKho(page, "quan-tri-dot", async () => {
      await khoi.scrollIntoViewIfNeeded();
    });
    await page.setViewportSize(MT);

    // Xuất "chỉ đợt 2": đúng hai ảnh mới, không lẫn ảnh đợt 1.
    const xuat = await context.request.get(`/api/admin/galleries/${galleryId}/export?dot=2`);
    expect(xuat.status()).toBe(200);
    expect((await xuat.text()).split(/\r?\n/).filter(Boolean)).toEqual(["BB321_004.jpg", "BB321_005.jpg"]);

    // Xác nhận đợt 2.
    await page.getByTestId("the-dot-2").getByRole("button", { name: "Xác nhận", exact: true }).click();
    await expect.poll(() => trangThaiDot(2), { timeout: 15_000 }).toBe("da_xac_nhan");

    // Từ chối đợt 3 phải có lý do.
    const the3 = page.getByTestId("the-dot-3");
    await the3.getByRole("button", { name: "Từ chối (lý do)" }).click();
    const nutXacNhanTuChoi = the3.getByRole("button", { name: "Xác nhận từ chối" });
    await expect(nutXacNhanTuChoi).toBeDisabled();
    await the3.getByRole("textbox").fill("Tấm này trùng đợt trước, ba mẹ chọn tấm khác giúp em nhé");
    await nutXacNhanTuChoi.click();
    await expect.poll(() => trangThaiDot(3), { timeout: 15_000 }).toBe("tu_choi");

    // "Việc cần xử lý" hết việc ở tab Khách mua thêm.
    await page.goto("/admin/viec-can-xu-ly?tab=khach-mua-them");
    await expect(page.getByTestId("khach-mua-them-report")).toBeVisible({ timeout: 20_000 });
  });

  test("4. KHÁCH thấy từng đợt: đợt 2 đã xác nhận, đợt 3 bị từ chối kèm lý do, ảnh trả về điền sẵn", async ({ page }) => {
    test.skip(!coBang, "Chờ áp migration 0077.");
    test.setTimeout(120_000);
    await page.setViewportSize(DT);
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maLink}`);

    await expect(page.getByTestId("trang-thai-dot-2")).toContainText("Bean đã xác nhận đợt này ạ", { timeout: 30_000 });
    const dot3 = page.getByTestId("trang-thai-dot-3");
    await expect(dot3).toContainText("Bean chưa nhận đợt này");
    await expect(page.getByTestId("ly-do-dot-3")).toContainText("Tấm này trùng đợt trước");
    await chupHaiKho(page, "dot-trang-thai-xac-nhan-tu-choi", async () => {
      await page.getByTestId("trang-thai-cac-dot").scrollIntoViewIfNeeded();
    });

    // Ảnh của đợt bị từ chối đã trả về và điền sẵn: nút "Tiếp tục đợt 4".
    await page.setViewportSize(DT);
    await page.getByRole("button", { name: "Tiếp tục đợt 4" }).click();
    const man = page.getByTestId("man-chon-them-anh");
    await expect(man.getByTestId("cau-tong-dot")).toHaveText(/^1 tấm mới · 30\.000\s₫$/);
    await expect(man.getByRole("button", { name: "Bỏ chọn" })).toHaveCount(1); // đúng tấm của đợt bị trả
  });

  test("5. QUẢN TRỊ mở lại ở in_retouch: banner CÓ nút chạy được, cảnh báo hậu kỳ, chọn đợt; delivered thì giải thích, không nút chết", async ({ page }) => {
    test.skip(!coBang, "Chờ áp migration 0077.");
    test.setTimeout(150_000);

    // Khách xin đổi ảnh đã chốt (đợt 2).
    await pg.query(
      `insert into activity_logs (actor_type, actor_label, action, entity_type, entity_id, gallery_id, metadata)
       values ('customer','khách','gallery.reopen_requested','gallery',$1,$1,$2)`,
      [galleryId, JSON.stringify({ lyDo: "Đổi tấm số 4 giúp em", trangThaiLucXin: "in_retouch", soDot: 2 })],
    );

    await page.setViewportSize(MT);
    await dangNhapNhanVien(page, emailNhanVien, matKhauNhanVien);
    await page.goto(`/admin/galleries/${galleryId}`);

    const banner = page.getByTestId("yeu-cau-mo-lai-banner");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    const nutMo = banner.getByRole("button", { name: "Mở lại cho khách" });
    await expect(nutMo).toBeVisible(); // lỗi chủ studio báo: in_retouch từng KHÔNG có nút này
    await nutMo.click();
    await expect(banner.getByTestId("canh-bao-mo-lai-hau-ky")).toContainText("Hậu kỳ có thể đã bắt đầu chỉnh");
    await expect(banner.getByLabel("Mở lại đợt nào")).toHaveValue("2"); // khách nói đợt 2 → chọn sẵn
    await chupHaiKho(page, "quan-tri-mo-lai", async () => {
      await banner.scrollIntoViewIfNeeded();
    });
    await page.setViewportSize(MT);
    await banner.getByRole("button", { name: "Xác nhận mở lại" }).click();
    await expect.poll(() => trangThaiDot(2), { timeout: 15_000 }).toBe("da_mo_lai");
    const { rows } = await pg.query("select status::text s from galleries where id = $1", [galleryId]);
    expect(rows[0].s).toBe("in_retouch"); // mở đợt 2 không đụng hậu kỳ của đợt 1

    // delivered: không nút chết.
    await pg.query("update galleries set status = 'delivered' where id = $1", [galleryId]);
    await pg.query(
      `insert into activity_logs (actor_type, actor_label, action, entity_type, entity_id, gallery_id, metadata)
       values ('customer','khách','gallery.reopen_requested','gallery',$1,$1,$2)`,
      [galleryId, JSON.stringify({ lyDo: "Đổi lại tấm bìa", trangThaiLucXin: "delivered" })],
    );
    await page.reload();
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner.getByTestId("giai-thich-khong-mo-lai")).toContainText("đợt mới");
    await expect(banner.getByRole("button", { name: "Mở lại cho khách" })).toHaveCount(0);
  });
});
