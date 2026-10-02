/**
 * BB-342 — cập nhật tức thì giữa khách và nhân viên, HAI trình duyệt cùng lúc.
 *
 *   1. Khách chốt đợt 2 → trong 5 giây, màn "Việc cần xử lý" (tab Khách mua
 *      thêm) của nhân viên hiện dòng mới và huy hiệu menu tăng — KHÔNG tải lại.
 *   2. Nhân viên bấm Xác nhận → trong 5 giây, màn khách đổi "Đang chờ studio
 *      xác nhận" thành "Studio đã xác nhận" — KHÔNG tải lại.
 *
 * "Không tải lại" được đo, không đoán: gắn một dấu vào `window` trước khi làm,
 * kiểm dấu còn nguyên sau khi thấy thay đổi (F5/điều hướng là mất dấu).
 *
 * Chạy: PW_PORT=3208 npx playwright test tests/e2e/bb-342-tuc-thi.spec.ts --workers=1
 *
 * Kiểm ngược (đã chạy, dán trong bàn giao): cho `useCapNhatTucThi` thoát ngay
 * (không nghe gì) → cả hai bước ĐỎ vì hết 5 giây.
 *
 * Dữ liệu: chi nhánh/nhân viên/khách/bộ ảnh "Fixture BB-342 …" RIÊNG — nhân
 * viên chỉ gán chi nhánh giả nên màn quản trị không hiện việc của khách thật.
 * Dọn theo id ở afterAll. Không bắn Lark thật (PHEP_THU_TRINH_DUYET).
 */

import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-342 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const emailNhanVien = `test_bb342_${runId}@demo.babybean.vn`;
const matKhauNhanVien = `Bb342!${randomBytes(6).toString("hex")}`;
const TOI_DA_MS = 5_000;

async function soTrenHuyHieu(page: Page): Promise<number> {
  const huyHieu = page.getByTestId("badge-viec-can-xu-ly").first();
  if ((await huyHieu.count()) === 0) return 0;
  const so = Number((await huyHieu.innerText()).replace(/\D/g, ""));
  return Number.isFinite(so) ? so : 0;
}

test.describe.serial("BB-342: cập nhật tức thì khách ↔ nhân viên", () => {
  let pg: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";
  let selectionId = "";
  const anh: string[] = [];

  const quanTriSupabase = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    const { rows: br } = await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [
      `FIXTURE-BB342-${runId}`,
      `${NHAN} Chi nhánh`,
    ]);
    branchId = br[0].id;

    const { data, error } = await quanTriSupabase().auth.admin.createUser({
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
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [
      userId,
      branchId,
    ]);

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000342') returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    // Đợt 1 đã chốt và được xác nhận → in_retouch, hạn mức 3: khách đang ở chế độ "Chọn thêm ảnh".
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price, download_enabled)
       values ($1,$2,$3,'in_retouch',$4,'https://example.com/x',6,3,30000,false) returning id`,
      [branchId, customerId, `${NHAN} Bộ ảnh`, `fixture-bb342-${runId}`],
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

    for (let i = 1; i <= 6; i++) {
      const { rows: ph } = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, width, height, status)
         values ($1,$2,$3,'image/jpeg',$4,3000,2000,'active') returning id`,
        [galleryId, `bb342-${runId}-${i}`, `BB342_00${i}.jpg`, i],
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
      if (galleryId) {
        await pg.query("delete from thong_bao_khach where gallery_id = $1", [galleryId]);
        await pg.query("delete from push_dang_ky where gallery_id = $1", [galleryId]);
        await pg.query("delete from activity_logs where entity_id = $1 or gallery_id = $1", [galleryId]);
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
      if (branchId) await pg.query("delete from branches where id = $1", [branchId]).catch(() => {});
      await pg.end();
    }
    if (userId) await quanTriSupabase().auth.admin.deleteUser(userId);
  });

  test("khách chốt đợt → nhân viên thấy ngay; nhân viên xác nhận → khách thấy ngay (không F5)", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);

    // --- Nhân viên: mở sẵn "Việc cần xử lý" / Khách mua thêm -------------------
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapNhanVien(page, emailNhanVien, matKhauNhanVien);
    await page.goto("/admin/viec-can-xu-ly?tab=khach-mua-them");
    const bao = page.getByTestId("khach-mua-them-report");
    await expect(bao).toBeVisible({ timeout: 30_000 });
    await expect(bao.getByText(`${NHAN} Bộ ảnh`)).toHaveCount(0);
    // Chờ huy hiệu đếm xong lượt đầu (route tab tải xong) rồi mới chụp số "trước".
    await page.waitForLoadState("networkidle");
    const huyHieuTruoc = await soTrenHuyHieu(page);
    await page.evaluate(() => ((window as unknown as { __bb342: string }).__bb342 = "chua-tai-lai"));

    // --- Khách: context RIÊNG (cookie riêng), cùng lúc ---------------------------
    const ctxKhach = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: { "x-forwarded-for": `10.234.${Math.floor(Math.random() * 250) + 1}.42` },
    });
    const khach = await ctxKhach.newPage();
    try {
      await chanLh3TrenTrinhDuyet(khach);
      await khach.goto(`/g/${maLink}`);
      const the = khach.getByTestId("chon-them-anh");
      await expect(the).toBeVisible({ timeout: 30_000 });
      await the.getByRole("button", { name: "Chọn thêm ảnh" }).click();
      const man = khach.getByTestId("man-chon-them-anh");
      await expect(man).toBeVisible();
      await man.getByRole("button", { name: "Chọn ảnh này" }).first().evaluate((el) => (el as HTMLElement).click());
      await expect(man.getByTestId("cau-tong-dot")).toContainText("1 ảnh mới");
      await man.getByTestId("nut-chot-dot").click();
      const hop = khach.getByTestId("hop-xac-nhan-dot");
      await expect(hop).toBeVisible();

      // Bấm chốt — từ ĐÂY đếm 5 giây cho màn nhân viên.
      const choChot = khach.waitForResponse((r) => r.url().includes("/api/g/dot-chon/chot") && r.request().method() === "POST");
      await hop.getByTestId("nut-xac-nhan-chot-dot").click();
      expect((await choChot).status()).toBe(200);
      const lucChot = Date.now();

      // 1. Nhân viên: dòng mới + huy hiệu tăng, trong 5 giây, không tải lại.
      // BB-337 thay danh sách cũ bằng "Khách gửi ảnh chọn" — mỗi bộ ảnh một dòng.
      const dong = bao.getByTestId("dong-khach-gui-anh-chon").filter({ hasText: `${NHAN} Bộ ảnh` });
      await expect(dong).toBeVisible({ timeout: TOI_DA_MS });
      const msNhanVienThay = Date.now() - lucChot;
      const dot2 = khach.getByTestId("trang-thai-dot-2");
      await expect(dot2).toContainText("Bean đang xác nhận đợt này ạ", { timeout: 30_000 });
      await expect.poll(() => soTrenHuyHieu(page), { timeout: TOI_DA_MS }).toBeGreaterThan(huyHieuTruoc);
      expect(await page.evaluate(() => (window as unknown as { __bb342?: string }).__bb342)).toBe("chua-tai-lai");

      // 2. Nhân viên xác nhận → khách thấy trong 5 giây, không tải lại.
      await khach.evaluate(() => ((window as unknown as { __bb342: string }).__bb342 = "chua-tai-lai"));
      const choXacNhan = page.waitForResponse(
        (r) => r.url().includes(`/dot-chon/2/xac-nhan`) && r.request().method() === "POST",
      );
      await dong.getByTestId("nut-xu-ly-viec").click();
      await dong.getByTestId("khoi-dot-2").getByRole("button", { name: "Xác nhận", exact: true }).click();
      expect((await choXacNhan).status()).toBe(200);
      const lucXacNhan = Date.now();
      await expect(dot2).toContainText("Bean đã xác nhận đợt này ạ", { timeout: TOI_DA_MS });
      const msKhachThay = Date.now() - lucXacNhan;
      console.info(`[BB-342 đo] nhân viên thấy sau ${msNhanVienThay} ms · khách thấy sau ${msKhachThay} ms`);
      expect(await khach.evaluate(() => (window as unknown as { __bb342?: string }).__bb342)).toBe("chua-tai-lai");

      // Và việc vừa xử lý rời hàng đợi của nhân viên (chính màn đó tự tải lại).
      await expect(dong).toHaveCount(0, { timeout: TOI_DA_MS });
    } finally {
      await ctxKhach.close();
    }
  });
});
