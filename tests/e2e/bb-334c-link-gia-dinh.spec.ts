/**
 * BB-334C — màn nhân viên: khối "Link app của gia đình" ở /admin/customers/[id].
 *
 * Kịch bản (chạy nối tiếp, cùng một khách Fixture):
 *   1. CSKH tạo link → thấy link, chép được, "1 link cũ vẫn mở được".
 *   2. Vai không phải CSKH/Admin (quản lý chi nhánh): thấy link nhưng KHÔNG có nút
 *      Đổi/Thu hồi; gọi thẳng API đổi/thu hồi → 403 (máy chủ chặn).
 *   3. Ghi link vào Lark: hộp xác nhận hiện; Huỷ thì không có lời gọi nào. Bấm xác
 *      nhận thì lời gọi bị `page.route` chặn lại và trả giả — KHÔNG BAO GIỜ chạm Lark thật.
 *   4. Đổi link: bấm nút chỉ mở hộp (chưa lời gọi nào); Huỷ / Esc không gọi; xác nhận
 *      mới gọi, với `doiLink` + `xacNhan`; link cũ chết, link mới sống, đúng MỘT link sống.
 *   5. Thu hồi: như trên; xong thì khối về trạng thái "đã thu hồi" và cho tạo lại.
 *   6. Ảnh chụp 1440×900 và 390×844 (ngoài repo, chỉ dữ liệu Fixture).
 *
 * Dữ liệu: "Fixture BB-334A-…" (dùng chung bộ dựng của đội A), dọn theo id ở afterAll.
 * Máy chủ chạy với PHEP_THU_TRINH_DUYET=1 nên mọi đường ghi Lark tự tắt.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import path from "node:path";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { taoBb334a, donBb334a, NHAN_BB334A, type DuLieuBb334a } from "../fixtures/bb-334a";

const password = "Password123!";
/** `babybean-assets/` nằm cạnh repo — đi ngược lên tới khi gặp (chạy được cả ở main lẫn worktree). */
function thuMucAnh(con: string): string {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const thu = path.join(d, "babybean-assets");
    if (fs.existsSync(thu)) return path.join(thu, "BB-334", con);
    d = path.dirname(d);
  }
  return path.resolve(__dirname, "../../test-results", con);
}
const THU_MUC_ANH = thuMucAnh("chup-334c");

test.describe.configure({ mode: "serial" });

test.describe("BB-334C: khối Link app của gia đình ở trang khách hàng", () => {
  let d: DuLieuBb334a;
  let pg: Client;
  let emailCs = "";
  let emailQl = "";
  const userIds: string[] = [];

  const admin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  async function taoNhanVien(email: string, role: string, ten: string) {
    const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    const id = data.user!.id;
    userIds.push(id);
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,$4)`, [id, ten, email, role]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [id, d.branchId]);
  }

  const urlKhach = () => `/admin/customers/${d.khachA}`;
  const soLinkSong = async () =>
    Number(
      (
        await pg.query(
          `select count(*)::int n from share_links where customer_id = $1 and role = 'owner' and status = 'active'`,
          [d.khachA],
        )
      ).rows[0].n,
    );
  const maLinkSong = async () =>
    (await pg.query(`select id from share_links where customer_id = $1 and role = 'owner' and status = 'active'`, [d.khachA])).rows.map(
      (r) => r.id as string,
    );

  /** Ghi lại mọi lời gọi KHÔNG phải GET tới link-gia-dinh của khách này. */
  function theoDoiLoiGoi(page: Page) {
    const log: { method: string; url: string; body: unknown }[] = [];
    page.on("request", (r) => {
      if (!r.url().includes(`/api/admin/customers/${d.khachA}/link-gia-dinh`) || r.method() === "GET") return;
      let body: unknown = null;
      try {
        body = r.postData() ? JSON.parse(r.postData()!) : null;
      } catch {
        body = r.postData();
      }
      log.push({ method: r.method(), url: r.url(), body });
    });
    return log;
  }

  const khoi = (page: Page) => page.getByTestId("khoi-link-gia-dinh");
  const oLink = (page: Page) => page.getByTestId("o-link-gia-dinh");

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    d = await taoBb334a();
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    // Bộ dựng của đội A có sẵn một link gia đình sống — thu hồi để bắt đầu từ "chưa có link".
    await pg.query(`update share_links set status = 'revoked', revoked_at = now() where id = $1`, [d.giaDinhA.id]);

    emailCs = `test_bb334c_cs_${d.runId}@demo.babybean.vn`;
    emailQl = `test_bb334c_ql_${d.runId}@demo.babybean.vn`;
    await taoNhanVien(emailCs, "cs", `${NHAN_BB334A}-${d.runId} CSKH`);
    await taoNhanVien(emailQl, "branch_manager", `${NHAN_BB334A}-${d.runId} Quản lý`);
  });

  test.afterAll(async () => {
    test.setTimeout(90_000);
    const loi: string[] = [];
    try {
      if (d) await donBb334a(d); // dọn khách, bộ, link, nhật ký theo id (và chi nhánh), rồi ĐỌC LẠI
    } catch (e) {
      loi.push((e as Error).message);
    }
    if (pg) {
      for (const id of userIds) {
        await pg.query(`delete from staff_branches where staff_id = $1`, [id]).catch((e: Error) => loi.push(e.message));
        await pg.query(`delete from staff_profiles where id = $1`, [id]).catch((e: Error) => loi.push(e.message));
      }
      await pg.end();
    }
    for (const id of userIds) {
      const { error } = await admin().auth.admin.deleteUser(id);
      if (error) loi.push(error.message);
    }
    if (loi.length) throw new Error(`Dọn Fixture BB-334C THẤT BẠI: ${loi.join(" | ")}`);
  });

  test("1. CSKH tạo link gia đình; thấy link, chép được, thấy '1 link cũ vẫn mở được'", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const log = theoDoiLoiGoi(page);
    await dangNhapNhanVien(page, emailCs, password);
    await page.goto(urlKhach());

    await expect(khoi(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("link-gia-dinh-chua-co")).toBeVisible();
    await expect(page.getByTestId("link-cu-con-song")).toHaveText("1 link cũ theo từng bộ vẫn mở được");
    expect(await soLinkSong()).toBe(0);

    await page.getByTestId("nut-tao-link-gia-dinh").click();
    await expect(oLink(page)).toBeVisible({ timeout: 30_000 });
    const diaChi = await oLink(page).inputValue();
    expect(diaChi).toMatch(/\/k\/[A-Za-z0-9_-]{43}$/);

    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ method: "POST", body: {} });
    expect(await soLinkSong()).toBe(1);
    // Chưa có nút nào của link cũ biến mất: link cũ theo bộ vẫn sống.
    await expect(page.getByTestId("link-cu-con-song")).toBeVisible();

    await page.getByTestId("nut-chep-link-gia-dinh").click();
    await expect(page.getByTestId("nut-chep-link-gia-dinh")).toContainText("Đã chép");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(diaChi);

    await page.getByTestId("nut-chep-tin-nhan").click();
    const tin = await page.evaluate(() => navigator.clipboard.readText());
    expect(tin).toContain(diaChi);

    // Tải lại trang: link hiện lại (đọc từ bản mã hoá), không tạo thêm.
    await page.reload();
    await expect(oLink(page)).toHaveValue(diaChi, { timeout: 30_000 });
    expect(await soLinkSong()).toBe(1);
  });

  test("2. vai không phải CSKH/Admin: không có nút Đổi/Thu hồi; máy chủ cũng chặn", async ({ page }) => {
    await dangNhapNhanVien(page, emailQl, password);
    await page.goto(urlKhach());
    await expect(oLink(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("nut-chep-link-gia-dinh")).toBeVisible();
    await expect(page.getByTestId("nut-ghi-link-lark")).toBeVisible();
    await expect(page.getByTestId("nut-doi-link-gia-dinh")).toHaveCount(0);
    await expect(page.getByTestId("nut-thu-hoi-link-gia-dinh")).toHaveCount(0);
    await expect(page.getByTestId("link-gia-dinh-chi-admin-doi")).toContainText("CSKH hoặc Admin");

    // Gọi thẳng API với đủ xác nhận: vẫn 403, link không đổi.
    const truoc = await maLinkSong();
    const doi = await page.request.post(`/api/admin/customers/${d.khachA}/link-gia-dinh`, { data: { doiLink: true, xacNhan: true } });
    expect(doi.status()).toBe(403);
    const thu = await page.request.delete(`/api/admin/customers/${d.khachA}/link-gia-dinh`, { data: { xacNhan: true } });
    expect(thu.status()).toBe(403);
    expect(await maLinkSong()).toEqual(truoc);
  });

  test("3. ghi link vào Lark: hộp xác nhận; Huỷ không gọi; xác nhận chỉ chạm route giả", async ({ page }) => {
    await dangNhapNhanVien(page, emailCs, password);
    await page.goto(urlKhach());
    await expect(oLink(page)).toBeVisible({ timeout: 30_000 });

    // Chặn MỌI lời gọi ghi-lark: không bao giờ tới máy chủ, càng không tới Lark.
    const toiRouteGia: string[] = [];
    await page.route("**/link-gia-dinh/ghi-lark", async (route) => {
      toiRouteGia.push(route.request().method());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { lark: { tong: 2, ghiDuoc: 2, dong: [] } } }),
      });
    });

    await page.getByTestId("nut-ghi-link-lark").click();
    const hop = page.getByTestId("hop-xac-nhan-link-gia-dinh");
    await expect(hop).toBeVisible();
    await expect(hop).toContainText("Ghi link vào Lark?");
    expect(toiRouteGia).toHaveLength(0);
    await page.getByTestId("hop-link-gia-dinh-huy").click();
    await expect(hop).toHaveCount(0);
    expect(toiRouteGia).toHaveLength(0);

    await page.getByTestId("nut-ghi-link-lark").click();
    await page.getByTestId("hop-link-gia-dinh-xac-nhan").click();
    await expect(page.getByTestId("link-gia-dinh-thong-bao")).toContainText("Đã ghi vào cột Link app của 2 dòng Hậu Kỳ trên Lark.");
    expect(toiRouteGia).toEqual(["POST"]);
  });

  test("4. đổi link: nút chỉ mở hộp; Huỷ/Esc không gọi; xác nhận mới đổi", async ({ page }) => {
    const log = theoDoiLoiGoi(page);
    await dangNhapNhanVien(page, emailCs, password);
    await page.goto(urlKhach());
    await expect(oLink(page)).toBeVisible({ timeout: 30_000 });
    const diaChiCu = await oLink(page).inputValue();
    const [idCu] = await maLinkSong();

    // Bấm "Đổi link" → hộp hiện, CHƯA có lời gọi nào.
    await page.getByTestId("nut-doi-link-gia-dinh").click();
    const hop = page.getByTestId("hop-xac-nhan-link-gia-dinh");
    await expect(hop).toBeVisible();
    await expect(hop).toContainText("Link cũ sẽ ngừng mở ngay");
    expect(log).toHaveLength(0);
    expect(await maLinkSong()).toEqual([idCu]);

    // Huỷ.
    await page.getByTestId("hop-link-gia-dinh-huy").click();
    await expect(hop).toHaveCount(0);
    expect(log).toHaveLength(0);

    // Esc.
    await page.getByTestId("nut-doi-link-gia-dinh").click();
    await expect(hop).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(hop).toHaveCount(0);
    expect(log).toHaveLength(0);
    await expect(oLink(page)).toHaveValue(diaChiCu);

    // Xác nhận.
    await page.getByTestId("nut-doi-link-gia-dinh").click();
    await page.getByTestId("hop-link-gia-dinh-xac-nhan").click();
    await expect(page.getByTestId("link-gia-dinh-thong-bao")).toContainText("Đã đổi link", { timeout: 30_000 });
    await expect(oLink(page)).not.toHaveValue(diaChiCu);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ method: "POST", body: { doiLink: true, xacNhan: true } });

    const song = await maLinkSong();
    expect(song).toHaveLength(1);
    expect(song[0]).not.toBe(idCu);
    const cu = await pg.query(`select status from share_links where id = $1`, [idCu]);
    expect(cu.rows[0].status).toBe("revoked");
  });

  test("5. thu hồi: nút chỉ mở hộp; Huỷ không gọi; xác nhận mới thu hồi; tạo lại được", async ({ page }) => {
    const log = theoDoiLoiGoi(page);
    await dangNhapNhanVien(page, emailCs, password);
    await page.goto(urlKhach());
    await expect(oLink(page)).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("nut-thu-hoi-link-gia-dinh").click();
    const hop = page.getByTestId("hop-xac-nhan-link-gia-dinh");
    await expect(hop).toContainText("Link sẽ ngừng mở ngay");
    expect(log).toHaveLength(0);
    expect(await soLinkSong()).toBe(1);
    await page.getByTestId("hop-link-gia-dinh-huy").click();
    expect(log).toHaveLength(0);
    expect(await soLinkSong()).toBe(1);

    await page.getByTestId("nut-thu-hoi-link-gia-dinh").click();
    await page.getByTestId("hop-link-gia-dinh-xac-nhan").click();
    await expect(page.getByTestId("link-gia-dinh-da-thu-hoi")).toBeVisible({ timeout: 30_000 });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ method: "DELETE", body: { xacNhan: true } });
    expect(await soLinkSong()).toBe(0);
    await expect(oLink(page)).toHaveCount(0);

    // Tạo lại được.
    await page.getByTestId("nut-tao-link-gia-dinh").click();
    await expect(oLink(page)).toBeVisible({ timeout: 30_000 });
    expect(await soLinkSong()).toBe(1);
  });

  test("6. ảnh chụp máy tính 1440×900 và điện thoại 390×844 (Fixture)", async ({ page }) => {
    fs.mkdirSync(THU_MUC_ANH, { recursive: true });
    await dangNhapNhanVien(page, emailCs, password);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(urlKhach());
    await expect(oLink(page)).toBeVisible({ timeout: 30_000 });
    await khoi(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(THU_MUC_ANH, "334c-khoi-link-gia-dinh-1440x900.png") });
    await page.getByTestId("nut-doi-link-gia-dinh").click();
    await expect(page.getByTestId("hop-xac-nhan-link-gia-dinh")).toBeVisible();
    await page.screenshot({ path: path.join(THU_MUC_ANH, "334c-hop-xac-nhan-doi-1440x900.png") });
    await page.getByTestId("hop-link-gia-dinh-huy").click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(urlKhach());
    await expect(oLink(page)).toBeVisible({ timeout: 30_000 });
    await khoi(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(THU_MUC_ANH, "334c-khoi-link-gia-dinh-390x844.png") });
    // Không tràn ngang trên điện thoại.
    const tran = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(tran).toBeLessThanOrEqual(1);
    // Link dài (43 ký tự không có dấu cách) không được tràn khỏi khung tin nhắn mẫu.
    const tranTin = await page.getByTestId("tin-nhan-mau-gia-dinh").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(tranTin).toBeLessThanOrEqual(1);
  });
});
