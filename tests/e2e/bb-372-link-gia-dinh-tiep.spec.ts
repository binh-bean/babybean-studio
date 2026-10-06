/**
 * BB-372 — link gia đình, phần tiếp (P0 chủ studio 06/10).
 *
 * Kịch bản (nối tiếp, cùng một khách Fixture):
 *   0. Dựng: bộ 2 có MỘT link cũ theo bộ (`/g/…`), rồi khách có link gia đình; ba mẹ mời người thân
 *      (cả nhà / một bộ / một link đã thu hồi), có tim và yêu cầu mua thêm.
 *   1. Trang khách hàng: link màn con của TỪNG bộ ("Buổi n · …", /k/<mã>/<n>, nút Chép, trạng thái,
 *      số ảnh), bộ chưa có ảnh không có dòng; khối link mời người thân (chỉ đọc, không nút nào).
 *   2. Màn chi tiết bộ ảnh: link cũ `/g/…` chỉ là một dòng thu gọn đóng sẵn; bấm mới mở; khối link mời
 *      người thân đếm tim / yêu cầu trong bộ này.
 *   3. Báo cáo điều hành: báo cáo "Mời người thân" mở được, API trả ba con số.
 *   4. Ảnh chụp 1440×900 + 390×844 vào babybean-assets/dot17/bb372 (dữ liệu Fixture).
 *
 * Lark: máy chủ thử chạy với PHEP_THU_TRINH_DUYET=1 (mọi đường ghi Lark tự tắt).
 * Dữ liệu: nền Fixture riêng (`dungNenFixture`), dọn theo id ở afterAll.
 *
 * Chạy: PW_PORT=3372 npx playwright test tests/e2e/bb-372-link-gia-dinh-tiep.spec.ts --workers=1
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import path from "node:path";
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";

const password = "Password123!";
function thuMucAnh(): string {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const thu = path.join(d, "babybean-assets");
    if (fs.existsSync(thu)) return path.join(thu, "dot17", "bb372");
    d = path.dirname(d);
  }
  return path.resolve(__dirname, "../../test-results", "bb372");
}
const THU_MUC_ANH = thuMucAnh();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.describe("BB-372: link màn con, link cũ thu gọn, link mời người thân", () => {
  let pg: Client;
  let nen: NenFixture;
  let emailCs = "";
  let staffId = "";
  const bo = { b1: "", b2: "", b3: "" };
  const anh: string[] = [];
  let maGiaDinh = "";
  const maMoi: string[] = [];

  const admin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  async function taoBo(ten: string, taoLuc: string, soAnh: number): Promise<string> {
    const { rows } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price, download_enabled, created_at)
       values ($1,$2,$3,$4,$5,'https://example.com/bb372',$6,5,50000,false,$7) returning id`,
      [
        nen.branchId,
        nen.customerId,
        `Fixture BB-372 ${nen.runId} ${ten}`,
        soAnh > 0 ? "in_review" : "draft",
        `SEED_FOLDER_ID_BB372E_${nen.runId}_${ten}`,
        soAnh,
        taoLuc,
      ],
    );
    const id = rows[0].id as string;
    for (let i = 1; i <= soAnh; i++) {
      const r = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
        [id, `bb372e-${nen.runId}-${ten}-${i}`, `BB372E${ten}_000${i}.jpg`, i],
      );
      anh.push(r.rows[0].id as string);
    }
    return id;
  }

  async function taoLinkMoi(o: { khach?: string; bo?: string; nhan: string; soLanMo?: number; thuHoi?: boolean }): Promise<string> {
    const ma = randomBytes(32).toString("base64url");
    maMoi.push(ma);
    const { rows } = await pg.query(
      `insert into share_links (customer_id, gallery_id, token_hash, token_prefix, role, label, status, view_count, last_viewed_at, revoked_at)
       values ($1,$2,$3,$4,'viewer',$5,$6,$7,$8,$9) returning id`,
      [
        o.khach ?? null,
        o.bo ?? null,
        sha(ma),
        ma.slice(0, 6),
        o.nhan,
        o.thuHoi ? "revoked" : "active",
        o.soLanMo ?? 0,
        o.soLanMo ? "2026-10-04T05:00:00Z" : null,
        o.thuHoi ? "2026-10-05T00:00:00Z" : null,
      ],
    );
    return rows[0].id as string;
  }

  async function khongTran(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    nen = await dungNenFixture(pg, "BB-372");
    bo.b1 = await taoBo("Bo1", "2026-09-01T00:00:00Z", 2);
    bo.b2 = await taoBo("Bo2", "2026-09-20T00:00:00Z", 2);
    bo.b3 = await taoBo("Bo3", "2026-10-01T00:00:00Z", 0);

    emailCs = `test_bb372_cs_${nen.runId}@demo.babybean.vn`;
    const { data, error } = await admin().auth.admin.createUser({ email: emailCs, password, email_confirm: true });
    if (error) throw error;
    staffId = data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      staffId,
      `Fixture BB-372 ${nen.runId} CSKH`,
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
        await pg.query(`delete from yeu_cau_mua_them where gallery_id = any($1::uuid[])`, [ids]).catch((e: Error) => loi.push(e.message));
        await pg.query(`delete from tim_gia_dinh where gallery_id = any($1::uuid[])`, [ids]).catch((e: Error) => loi.push(e.message));
        const { rows } = await pg.query(`select id from share_links where gallery_id = any($1::uuid[]) or customer_id = $2`, [
          ids,
          nen?.customerId ?? null,
        ]);
        const linkIds = rows.map((r) => r.id as string);
        if (linkIds.length) {
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
    if (loi.length) throw new Error(`Dọn Fixture BB-372 THẤT BẠI: ${loi.join(" | ")}`);
  });

  test("0. dựng: bộ 2 có link cũ theo bộ, rồi khách có link gia đình; ba mẹ mời người thân", async ({ page }) => {
    await dangNhapNhanVien(page, emailCs, password);
    // Link cũ theo bộ 2 — tạo trước khi có link gia đình (sau đó máy chủ chặn bằng 409).
    const cu = await page.request.post(`/api/admin/galleries/${bo.b2}/share-link`, { data: {} });
    expect(cu.status()).toBe(200);
    const gd = await page.request.post(`/api/admin/customers/${nen.customerId}/link-gia-dinh`, { data: { ghiLark: false } });
    expect(gd.status()).toBe(200);
    maGiaDinh = ((await gd.json()) as { data: { duongDan: string } }).data.duongDan.split("/")[2]!;
    expect(maGiaDinh).toHaveLength(43);

    const v1 = await taoLinkMoi({ khach: nen.customerId, nhan: "Bà nội", soLanMo: 5 });
    await taoLinkMoi({ khach: nen.customerId, nhan: "Ông ngoại", thuHoi: true });
    const v3 = await taoLinkMoi({ bo: bo.b2, nhan: "Cô Hai", soLanMo: 1 });
    for (const [g, link, p] of [
      [bo.b1, v1, anh[0]],
      [bo.b2, v1, anh[2]],
      [bo.b2, v1, anh[3]],
      [bo.b2, v3, anh[2]],
    ] as const) {
      await pg.query(`insert into tim_gia_dinh (gallery_id, share_link_id, photo_id) values ($1,$2,$3)`, [g, link, p]);
    }
    await pg.query(
      `insert into yeu_cau_mua_them (gallery_id, product_id, so_luong, loai, anh_ids, don_gia, tam_tinh, ten_nguoi_mua, sdt_nguoi_mua, share_link_id)
       values ($1,null,1,'chinh_sua',$2::uuid[],50000,50000,'Fixture Bà Nội Thử','0901000001',$3)`,
      [bo.b2, [anh[2]], v1],
    );
  });

  test("1. trang khách hàng: link từng buổi chụp + link mời người thân (chỉ đọc)", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    fs.mkdirSync(THU_MUC_ANH, { recursive: true });
    await dangNhapNhanVien(page, emailCs, password);

    for (const [w, h, ten] of [
      [1440, 900, "372-trang-khach-1440x900.png"],
      [390, 844, "372-trang-khach-390x844.png"],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/admin/customers/${nen.customerId}`);
      await expect(page.getByTestId("link-man-con-cac-bo")).toBeVisible({ timeout: 90_000 });
      await expect(page.getByTestId("dong-link-moi").first()).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("link-man-con-cac-bo").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(THU_MUC_ANH, ten), fullPage: w === 390 });
      if (w === 390) await khongTran(page);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    // Link màn con: Buổi 1 và Buổi 2; bộ 3 chưa có ảnh nên không có dòng, chỉ có ghi chú.
    const dong = page.getByTestId("dong-man-con");
    await expect(dong).toHaveCount(2);
    await expect(dong.nth(0).getByTestId("man-con-ten")).toContainText("Buổi 1 · Fixture BB-372");
    await expect(dong.nth(0).getByTestId("man-con-ten")).toContainText("Bo1");
    await expect(dong.nth(1).getByTestId("man-con-ten")).toContainText("Buổi 2 · Fixture BB-372");
    await expect(dong.nth(0).getByTestId("o-link-man-con-bo")).toHaveValue(new RegExp(`/k/${maGiaDinh}/1$`));
    await expect(dong.nth(1).getByTestId("o-link-man-con-bo")).toHaveValue(new RegExp(`/k/${maGiaDinh}/2$`));
    await expect(dong.nth(0).getByTestId("man-con-so-anh")).toHaveText("2 ảnh");
    await expect(dong.nth(0).getByTestId("man-con-trang-thai")).not.toHaveText("");
    await expect(page.getByTestId("link-man-con-bo-an")).toContainText("1 bộ chưa hiện với gia đình");

    // Chép từng dòng: đúng địa chỉ của dòng đó.
    await dong.nth(1).getByTestId("nut-chep-man-con-bo").click();
    const chep = await page.evaluate(() => navigator.clipboard.readText());
    expect(chep).toMatch(new RegExp(`/k/${maGiaDinh}/2$`));
    await expect(dong.nth(1).getByTestId("nut-chep-man-con-bo")).toContainText("Đã chép");
    await expect(dong.nth(0).getByTestId("nut-chep-man-con-bo")).toContainText("Chép");

    // Nhãn link cũ ở "Lịch sử chụp": không còn "Chưa có link" gây hiểu nhầm.
    const lichSu = page.getByTestId("lich-su-chup");
    await expect(lichSu).not.toContainText("Chưa có link");
    await expect(lichSu).toContainText("Link cũ còn mở");

    // Link mời người thân: 3 dòng, một dòng đã thu hồi, KHÔNG có nút nào, không lộ mã.
    const moi = page.getByTestId("khoi-link-moi-nguoi-than");
    await expect(moi.getByTestId("dong-link-moi")).toHaveCount(3);
    await expect(moi).toContainText("Bà nội");
    await expect(moi).toContainText("Đã thu hồi");
    await expect(moi).toContainText("5");
    await expect(moi.locator('[data-thu-hoi="1"]')).toHaveCount(1);
    await expect(moi.locator("button, input, a")).toHaveCount(0);
    const noiDung = await page.content();
    for (const ma of maMoi) expect(noiDung).not.toContain(ma);
    await moi.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(THU_MUC_ANH, "372-link-moi-nguoi-than-khach-1440x900.png") });
  });

  test("2. màn bộ ảnh: link cũ /g/… thu gọn, đóng sẵn; link mời người thân đếm trong bộ này", async ({ page }) => {
    await dangNhapNhanVien(page, emailCs, password);
    const oLinkMan = page.getByTestId("o-link-man-con");

    for (const [w, h, ten] of [
      [1440, 900, "372-bo-anh-link-cu-thu-gon-1440x900.png"],
      [390, 844, "372-bo-anh-link-cu-thu-gon-390x844.png"],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/admin/galleries/${bo.b2}`);
      await expect(oLinkMan).toHaveValue(new RegExp(`/k/${maGiaDinh}/2$`), { timeout: 90_000 });
      await expect(page.getByTestId("link-cu-bo-anh")).toBeVisible();
      await page.getByTestId("khoi-link-bo-anh-gia-dinh").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(THU_MUC_ANH, ten) });
      if (w === 390) await khongTran(page);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    const cu = page.getByTestId("link-cu-bo-anh");
    await expect(page.getByTestId("link-cu-bo-con-song")).toHaveText("1 link cũ vẫn mở được (không cần gửi lại)");
    expect(await cu.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    // Khi đóng: không có ô nào đang hiện địa chỉ /g/… (không nổi bật).
    const giaTriODangHien = async () =>
      page.locator("input").evaluateAll((els) =>
        els.filter((e) => (e as HTMLInputElement).checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })).map((e) => (e as HTMLInputElement).value),
      );
    expect((await giaTriODangHien()).some((v) => v.includes("/g/"))).toBe(false);
    expect(await page.getByText(/\/g\/[A-Za-z0-9_-]{20,}/).count()).toBe(0);

    // Bấm mới mở: lúc này mới thấy link cũ.
    await cu.locator("summary").click();
    expect(await cu.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
    await expect.poll(async () => (await giaTriODangHien()).some((v) => v.includes("/g/"))).toBe(true);
    await cu.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(THU_MUC_ANH, "372-bo-anh-link-cu-mo-rong-1440x900.png") });
    await cu.locator("summary").click();

    // Link mời người thân nhìn từ bộ 2: cả nhà (Bà nội: 2 tim, 1 yêu cầu), Ông ngoại đã thu hồi, Cô Hai chỉ bộ này.
    const moi = page.getByTestId("khoi-link-moi-nguoi-than");
    await expect(moi.getByTestId("dong-link-moi")).toHaveCount(3, { timeout: 30_000 });
    const ba = moi.getByTestId("dong-link-moi").filter({ hasText: "Bà nội" });
    await expect(ba.getByTestId("link-moi-tim")).toHaveText("2 tim");
    await expect(ba.getByTestId("link-moi-yeu-cau")).toHaveText("1 yêu cầu mua thêm");
    await expect(moi.locator('[data-thu-hoi="1"]')).toHaveCount(1);
    await expect(moi.locator("button, input, a")).toHaveCount(0);
    await moi.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(THU_MUC_ANH, "372-link-moi-nguoi-than-bo-anh-1440x900.png") });

    // Bộ 1: Bà nội chỉ có 1 tim, 0 yêu cầu; link theo bộ 2 không hiện.
    await page.goto(`/admin/galleries/${bo.b1}`);
    const moi1 = page.getByTestId("khoi-link-moi-nguoi-than");
    await expect(moi1.getByTestId("dong-link-moi")).toHaveCount(2, { timeout: 60_000 });
    await expect(moi1.getByTestId("dong-link-moi").filter({ hasText: "Bà nội" }).getByTestId("link-moi-tim")).toHaveText("1 tim");
    await expect(moi1).not.toContainText("Cô Hai");
  });

  test("3. báo cáo điều hành: 'Mời người thân' mở được, API trả ba con số", async ({ page }) => {
    await dangNhapNhanVien(page, emailCs, password);
    const r = await page.request.get(`/api/admin/bao-cao/moi-nguoi-than?tu=2020-01-01&den=2099-01-01`);
    expect(r.status()).toBe(200);
    const j = (await r.json()) as { data: { ketQua: { theSo: Array<{ nhan: string; giaTri: number }> } } };
    expect(j.data.ketQua.theSo.map((t) => t.nhan)).toEqual([
      "Nhà có mời người thân",
      "Người được mời đã mở",
      "Yêu cầu mua thêm từ người được mời",
    ]);
    // Dữ liệu Fixture bị loại khỏi báo cáo → nhân viên chỉ có chi nhánh Fixture thấy 0.
    expect(j.data.ketQua.theSo.map((t) => t.giaTri)).toEqual([0, 0, 0]);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/bao-cao?ma=moi-nguoi-than`);
    await expect(page.getByText("Nhà có mời người thân").first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("Yêu cầu mua thêm từ người được mời").first()).toBeVisible();
    await page.screenshot({ path: path.join(THU_MUC_ANH, "372-bao-cao-moi-nguoi-than-1440x900.png") });

    // Ảnh minh hoạ cách báo cáo hiện khi CÓ số (SỐ GIẢ do trình duyệt trả, không phải dữ liệu thật).
    await page.route("**/api/admin/bao-cao/moi-nguoi-than*", async (route) => {
      let that;
      try {
        that = await route.fetch();
      } catch {
        await route.continue().catch(() => {});
        return;
      }
      const j2 = (await that.json()) as { data: { ketQua: Record<string, unknown> } };
      j2.data.ketQua.theSo = [
        { nhan: "Nhà có mời người thân", giaTri: 12, donVi: "nhà" },
        { nhan: "Người được mời đã mở", giaTri: 17, donVi: "trên 23 link" },
        { nhan: "Yêu cầu mua thêm từ người được mời", giaTri: 4, donVi: "yêu cầu" },
      ];
      j2.data.ketQua.bang = {
        cot: ["Chi nhánh", "Nhà có mời", "Link mời", "Link đã mở", "Yêu cầu mua thêm"],
        dong: [["Chi nhánh minh hoạ A", 7, 14, 10, 3], ["Chi nhánh minh hoạ B", 5, 9, 7, 1]],
      };
      await route.fulfill({ response: that, json: j2 });
    });
    await page.goto(`/admin/bao-cao?ma=moi-nguoi-than`);
    await expect(page.getByText("Chi nhánh minh hoạ A").first()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(THU_MUC_ANH, "372-bao-cao-moi-nguoi-than-so-minh-hoa-1440x900.png") });
  });
});
