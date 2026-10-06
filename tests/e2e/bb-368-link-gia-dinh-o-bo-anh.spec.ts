/**
 * BB-368 — link gia đình ở màn chi tiết bộ ảnh (anh chốt 06/10).
 *
 * Kịch bản (nối tiếp, cùng một khách Fixture):
 *   1. Khách MỚI (chưa có link gia đình): màn bộ ảnh 1 có nút "Tạo link gia đình",
 *      KHÔNG có nút tạo link theo bộ. Bấm → thấy ngay `/k/<mã>/1`.
 *   2. Mở link đó (trình duyệt khách): giao diện GIA ĐÌNH (`/k/…`, nút về trang gia
 *      đình, nút đổi buổi chụp), đúng bộ 1.
 *   3. Khách ĐÃ có link: bộ 2 hiện link màn con `/k/<mã>/2`, không có nút tạo link
 *      theo bộ (kể cả trong menu ⋯); bộ 3 chưa có ảnh → cảnh báo "Bộ chưa có ảnh".
 *   4. Ảnh chụp 1440×900 + 390×844, hai trạng thái (khách mới / đã có link).
 *
 * Lark: máy chủ thử chạy với PHEP_THU_TRINH_DUYET=1 nên `ghiLinkAppVeLark` tự tắt;
 * thêm `page.route` chặn mọi lời gọi `…/link-gia-dinh/ghi-lark` cho chắc.
 * Dữ liệu: nền Fixture riêng (`dungNenFixture`), dọn theo id ở afterAll.
 *
 * Chạy: PW_PORT=3368 npx playwright test tests/e2e/bb-368-link-gia-dinh-o-bo-anh.spec.ts --workers=1
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import path from "node:path";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";

const password = "Password123!";
function thuMucAnh(): string {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const thu = path.join(d, "babybean-assets");
    if (fs.existsSync(thu)) return path.join(thu, "BB-368");
    d = path.dirname(d);
  }
  return path.resolve(__dirname, "../../test-results", "BB-368");
}
const THU_MUC_ANH = thuMucAnh();

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.describe("BB-368: link gia đình ở màn chi tiết bộ ảnh", () => {
  let pg: Client;
  let nen: NenFixture;
  let emailCs = "";
  let staffId = "";
  const bo: { b1: string; b2: string; b3: string } = { b1: "", b2: "", b3: "" };
  let diaChiBo1 = "";

  const admin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  async function taoBo(ten: string, taoLuc: string, soAnh: number): Promise<string> {
    const { rows } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price, download_enabled, created_at)
       values ($1,$2,$3,$4,$5,'https://example.com/bb368',$6,5,50000,false,$7) returning id`,
      [
        nen.branchId,
        nen.customerId,
        `Fixture BB-368 ${nen.runId} ${ten}`,
        soAnh > 0 ? "in_review" : "draft",
        `SEED_FOLDER_ID_BB368E_${nen.runId}_${ten}`,
        soAnh,
        taoLuc,
      ],
    );
    const id = rows[0].id as string;
    for (let i = 1; i <= soAnh; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [id, `bb368e-${nen.runId}-${ten}-${i}`, `BB368E${ten}_000${i}.jpg`, i],
      );
    }
    return id;
  }

  const soLinkGiaDinhSong = async () =>
    Number(
      (
        await pg.query(
          `select count(*)::int n from share_links where customer_id = $1 and role = 'owner' and status = 'active'`,
          [nen.customerId],
        )
      ).rows[0].n,
    );
  const soLinkTheoBo = async () =>
    Number(
      (await pg.query(`select count(*)::int n from share_links where gallery_id = any($1::uuid[])`, [Object.values(bo)]))
        .rows[0].n,
    );

  async function chanGhiLark(page: Page) {
    const goi: string[] = [];
    await page.route("**/link-gia-dinh/ghi-lark", async (route) => {
      goi.push(route.request().method());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { lark: { tong: 0, ghiDuoc: 0, dong: [] } } }) });
    });
    return goi;
  }

  const khoi = (page: Page) => page.getByTestId("khoi-link-bo-anh-gia-dinh");
  const oLink = (page: Page) => page.getByTestId("o-link-man-con");

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    nen = await dungNenFixture(pg, "BB-368");
    bo.b1 = await taoBo("Bo1", "2026-09-01T00:00:00Z", 2);
    bo.b2 = await taoBo("Bo2", "2026-09-20T00:00:00Z", 2);
    bo.b3 = await taoBo("Bo3", "2026-10-01T00:00:00Z", 0);

    emailCs = `test_bb368_cs_${nen.runId}@demo.babybean.vn`;
    const { data, error } = await admin().auth.admin.createUser({ email: emailCs, password, email_confirm: true });
    if (error) throw error;
    staffId = data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      staffId,
      `Fixture BB-368 ${nen.runId} CSKH`,
      emailCs,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [staffId, nen.branchId]);
  });

  test.afterAll(async () => {
    test.setTimeout(90_000);
    const loi: string[] = [];
    if (pg) {
      const ids = Object.values(bo).filter(Boolean);
      try {
        const { rows } = await pg.query(
          `select id from share_links where gallery_id = any($1::uuid[]) or customer_id = $2`,
          [ids, nen?.customerId ?? null],
        );
        const linkIds = rows.map((r) => r.id as string);
        if (linkIds.length) {
          // Mọi bảng trỏ vào share_links (lượt mở, bản mã hoá, lượt chọn…) — dò từ catalog.
          const { rows: fk } = await pg.query(
            `select c.conrelid::regclass::text as bang, a.attname as cot
               from pg_constraint c
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
              where c.contype = 'f' and c.confrelid = 'public.share_links'::regclass and array_length(c.conkey, 1) = 1`,
          );
          for (const f of fk) {
            await pg.query(`delete from ${f.bang} where ${f.cot} = any($1::uuid[])`, [linkIds]).catch((e: Error) => loi.push(e.message));
          }
          await pg.query(`delete from share_links where id = any($1::uuid[])`, [linkIds]).catch((e: Error) => loi.push(e.message));
        }
        if (staffId) await pg.query(`delete from staff_branches where staff_id = $1`, [staffId]).catch((e: Error) => loi.push(e.message));
        if (nen) {
          await donNenFixture(pg, {
            galleryIds: ids,
            customerIds: [nen.customerId],
            branchIds: [nen.branchId],
            staffIds: [staffId],
          }).catch((e: Error) => loi.push(e.message));
        }
      } finally {
        await pg.end();
      }
    }
    if (loi.length) throw new Error(`Dọn Fixture BB-368 THẤT BẠI: ${loi.join(" | ")}`);
  });

  test("1. khách mới: màn bộ ảnh có 'Tạo link gia đình', không có nút tạo link theo bộ; bấm → thấy /k/<mã>/1", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const ghiLark = await chanGhiLark(page);
    fs.mkdirSync(THU_MUC_ANH, { recursive: true });
    await dangNhapNhanVien(page, emailCs, password);

    // Ảnh chụp trạng thái "khách mới" — máy tính rồi điện thoại.
    for (const [w, h, ten] of [
      [1440, 900, "368-khach-moi-1440x900.png"],
      [390, 844, "368-khach-moi-390x844.png"],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/admin/galleries/${bo.b1}`);
      await expect(page.getByTestId("link-bo-anh-chua-co")).toBeVisible({ timeout: 60_000 });
      await khoi(page).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(THU_MUC_ANH, ten) });
      if (w === 390) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    await expect(page.getByTestId("nut-tao-link-gia-dinh-bo")).toBeVisible();
    await expect(page.getByTestId("nut-tao-link-app")).toHaveCount(0);
    // Menu ⋯ cũng không còn "Tạo link app".
    await page.getByRole("button", { name: "Thao tác khác" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menu")).not.toContainText("Tạo link");
    await page.keyboard.press("Escape");

    expect(await soLinkGiaDinhSong()).toBe(0);
    const choTao = page.waitForResponse(
      (r) => r.url().includes(`/api/admin/customers/${nen.customerId}/link-gia-dinh`) && r.request().method() === "POST",
    );
    await page.getByTestId("nut-tao-link-gia-dinh-bo").click();
    expect((await choTao).status()).toBe(200);
    await expect(oLink(page)).toBeVisible({ timeout: 30_000 });
    diaChiBo1 = await oLink(page).inputValue();
    expect(diaChiBo1).toMatch(/\/k\/[A-Za-z0-9_-]{43}\/1$/);
    expect(await soLinkGiaDinhSong()).toBe(1);
    expect(await soLinkTheoBo()).toBe(0); // không tạo link theo bộ nào

    await page.getByTestId("nut-chep-link-man-con").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(diaChiBo1);
    await page.getByTestId("nut-chep-tin-nhan-man-con").click();
    const tin = await page.evaluate(() => navigator.clipboard.readText());
    expect(tin).toContain(diaChiBo1);
    expect(tin.trim()).toMatch(/ạ\.$/);
    await expect(page.getByTestId("link-sang-trang-khach")).toHaveAttribute("href", `/admin/customers/${nen.customerId}`);
    expect(ghiLark).toHaveLength(0);
  });

  test("2. mở link màn con: giao diện gia đình (/k/…), đúng bộ 1", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await chanLh3TrenTrinhDuyet(page);
    const duong = new URL(diaChiBo1).pathname;
    const ma = duong.split("/")[2]!;
    await page.goto(duong);
    await page.locator("#dau-luoi-anh").first().waitFor({ state: "attached", timeout: 90_000 });
    await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(new RegExp(`/k/${ma}/1$`));
    await expect(page.getByTestId("the-anh")).toHaveCount(2);
    // Giao diện link gia đình: nút về trang gia đình + nút đổi buổi chụp đúng bộ 1.
    await expect(page.getByTestId("nut-ve-gia-dinh")).toHaveAttribute("href", `/k/${ma}`);
    await expect(page.getByTestId("nut-doi-buoi-chup")).toContainText(`Bo1`);
    await ctx.close();
  });

  test("3. khách đã có link: bộ 2 hiện /k/<mã>/2, không có nút tạo link nào; bộ 3 chưa có ảnh → cảnh báo", async ({ page }) => {
    const ghiLark = await chanGhiLark(page);
    await dangNhapNhanVien(page, emailCs, password);
    const ma = new URL(diaChiBo1).pathname.split("/")[2]!;

    for (const [w, h, ten] of [
      [1440, 900, "368-da-co-link-1440x900.png"],
      [390, 844, "368-da-co-link-390x844.png"],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/admin/galleries/${bo.b2}`);
      await expect(oLink(page)).toBeVisible({ timeout: 60_000 });
      await expect(oLink(page)).toHaveValue(new RegExp(`/k/${ma}/2$`));
      await khoi(page).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(THU_MUC_ANH, ten) });
      if (w === 390) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        const tranTin = await page.getByTestId("tin-nhan-mau-man-con").evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(tranTin).toBeLessThanOrEqual(1);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId("so-thu-tu-man-con")).toHaveText("Buổi thứ 2 trong link gia đình");
    await expect(page.getByTestId("nut-tao-link-gia-dinh-bo")).toHaveCount(0);
    await expect(page.getByTestId("nut-tao-link-app")).toHaveCount(0);
    await expect(page.getByTestId("canh-bao-bo-chua-co-anh")).toHaveCount(0);
    await page.getByRole("button", { name: "Thao tác khác" }).click();
    await expect(page.getByRole("menu")).not.toContainText("Tạo link");
    await page.keyboard.press("Escape");

    // Máy chủ cũng chặn: gọi thẳng share-link → 409, không thêm link theo bộ.
    const r = await page.request.post(`/api/admin/galleries/${bo.b2}/share-link`, { data: {} });
    expect(r.status()).toBe(409);
    expect(((await r.json()) as { error: { details: { linkGiaDinh: { duongDanManCon: string } } } }).error.details.linkGiaDinh.duongDanManCon).toBe(
      `/k/${ma}/2`,
    );
    expect(await soLinkTheoBo()).toBe(0);

    // Bộ 3 chưa có ảnh: link màn con hiện, kèm cảnh báo.
    await page.goto(`/admin/galleries/${bo.b3}`);
    await expect(oLink(page)).toHaveValue(new RegExp(`/k/${ma}/3$`), { timeout: 60_000 });
    await expect(page.getByTestId("canh-bao-bo-chua-co-anh")).toContainText("Bộ chưa có ảnh — bấm Đồng bộ ảnh trước");
    await khoi(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(THU_MUC_ANH, "368-bo-chua-co-anh-1440x900.png") });
    expect(ghiLark).toHaveLength(0);
  });
});
