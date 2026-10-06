/**
 * BB-370 — sửa nhỏ màn khách + bìa (P0 chủ studio 06/10/2026).
 *
 *   1. Máy tính: NHẤP MỘT LẦN vào ảnh xem lớn là phóng, nhấp lần nữa thu về; kéo
 *      khi đang phóng không bật/tắt; mũi tên vẫn lật ảnh. Điện thoại: chạm một lần
 *      KHÔNG phóng (cử chỉ chạm giữ như cũ).
 *   2. Bộ đã chốt: ghi chú ba mẹ đã gửi hiện CHỈ ĐỌC ở màn xem lớn (máy tính +
 *      điện thoại), dấu bút trên ô lưới, và nhân viên thấy ghi chú ở màn quản trị.
 *   3. So sánh: ghim một tấm ngay từ lưới so sánh, đổi tấm còn lại lần lượt; bỏ
 *      tim tấm đang xem ngay tại chỗ mà tấm đó KHÔNG biến khỏi khung.
 *   4. Ô chuyển bộ / tiêu đề / khung xem trước bìa quản trị không bao giờ chứa
 *      mã hoá đơn "HD_".
 *
 * Dữ liệu: nền Fixture riêng (`dungNenFixture`), dọn theo id ở afterAll. Tiêu đề
 * bộ ảnh mang dạng mã hoá đơn giả (`… HD_20260913#5067`) để canh đúng lỗi thật.
 * Lark: máy chủ thử chạy với PHEP_THU_TRINH_DUYET=1.
 *
 * Chạy: PW_PORT=3370 npx playwright test tests/e2e/bb-370-man-khach-nho.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import path from "node:path";
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";

const password = "Password123!";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const GHI_CHU = "Làm sáng da bé, xoá vết bút trên tường giúp Bean";

function thuMucAnh(): string {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const thu = path.join(d, "babybean-assets");
    if (fs.existsSync(thu)) return path.join(thu, "dot17", "bb370");
    d = path.dirname(d);
  }
  return path.resolve(__dirname, "../../test-results", "bb370");
}
const THU_MUC_ANH = thuMucAnh();
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

test.describe.configure({ mode: "default" });
test.setTimeout(300_000);

let pg: Client;
let nen: NenFixture;
let staffId = "";
let emailNv = "";
let beId = "";
let maGiaDinh = "";
const bo: { mo: string; chot: string } = { mo: "", chot: "" };
const anhChot: string[] = [];

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

async function taoBo(ten: string, status: string, taoLuc: string, ngayChup: string): Promise<{ id: string; anh: string[] }> {
  const { rows: s } = await pg.query(
    `insert into shoots (branch_id, customer_id, baby_id, shoot_date) values ($1,$2,$3,$4) returning id`,
    [nen.branchId, nen.customerId, beId, ngayChup],
  );
  const { rows } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                            photo_count, included_quota, extra_photo_price, download_enabled, created_at,
                            shoot_id, baby_id)
     values ($1,$2,$3,$4,$5,'https://example.com/bb370',4,5,50000,false,$6,$7,$8) returning id`,
    [
      nen.branchId,
      nen.customerId,
      // Dạng tiêu đề THẬT từ Lark: mã hoá đơn. Tiền tố "Fixture" để kiểm-fixture đếm được.
      `Fixture BB-370 ${nen.runId} HD_20260913#5067 ${ten}`,
      status,
      `SEED_FOLDER_ID_BB370_${nen.runId}_${ten}`,
      taoLuc,
      s[0].id,
      beId,
    ],
  );
  const id = rows[0].id as string;
  const anh: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const { rows: p } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
       values ($1,$2,$3,'image/jpeg',$4,'active',1600,2400) returning id`,
      [id, `bb370-${nen.runId}-${ten}-${i}`, `BB370${ten}_000${i}.jpg`, i],
    );
    anh.push(p[0].id as string);
  }
  return { id, anh };
}

test.beforeAll(async () => {
  test.setTimeout(90_000);
  pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  nen = await dungNenFixture(pg, "BB-370");
  const { rows: be } = await pg.query(
    `insert into babies (customer_id, full_name, nickname) values ($1,$2,'Bơ') returning id`,
    [nen.customerId, `Fixture BB-370 ${nen.runId} Bơ`],
  );
  beId = be[0].id as string;

  const mo = await taoBo("Mo", "in_review", "2026-09-01T00:00:00Z", "2026-09-13");
  const chot = await taoBo("Chot", "in_retouch", "2026-09-02T00:00:00Z", "2026-09-20");
  bo.mo = mo.id;
  bo.chot = chot.id;
  anhChot.push(...chot.anh);

  maGiaDinh = randomBytes(32).toString("base64url");
  const { rows: l } = await pg.query(
    `insert into share_links (customer_id, token_hash, token_prefix, role, status, label)
     values ($1,$2,$3,'owner','active',$4) returning id`,
    [nen.customerId, sha256(maGiaDinh), maGiaDinh.slice(0, 6), `Fixture BB-370 ${nen.runId} link`],
  );
  const linkId = l[0].id as string;

  // Bộ đang mở: ba mẹ đã thả tim sẵn tấm 3 và 4 (nguồn vuốt của màn so sánh). Gieo thẳng
  // vào lượt chọn chính — không bấm tim trên giao diện (lượt mở đầu tiên tạo lượt chọn
  // song song với lượt tim, dễ chập chờn khi bb-dev đang tải nặng).
  const { rows: selMo } = await pg.query(
    `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
    [bo.mo, linkId],
  );
  await pg.query(
    `insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index)
     values ($1,$2,$3,'selected',1), ($1,$4,$3,'selected',2)`,
    [selMo[0].id, mo.anh[2], bo.mo, mo.anh[3]],
  );

  // Bộ đã chốt: lượt chọn chính, 2 tấm đã chọn, tấm 1 có ghi chú.
  const { rows: sel } = await pg.query(
    `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
    [bo.chot, linkId],
  );
  await pg.query(
    `insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index, retouch_note)
     values ($1,$2,$3,'selected',1,$4), ($1,$5,$3,'selected',2,null)`,
    [sel[0].id, chot.anh[0], bo.chot, GHI_CHU, chot.anh[1]],
  );

  emailNv = `test_bb370_${nen.runId}@demo.babybean.vn`;
  const { data, error } = await admin().auth.admin.createUser({ email: emailNv, password, email_confirm: true });
  if (error) throw error;
  staffId = data.user!.id;
  await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
    staffId,
    `Fixture BB-370 ${nen.runId} Admin`,
    emailNv,
  ]);
});

test.afterAll(async () => {
  test.setTimeout(90_000);
  const loi: string[] = [];
  if (pg) {
    try {
      const { rows } = await pg.query(`select id from share_links where customer_id = $1 or gallery_id = any($2::uuid[])`, [
        nen?.customerId ?? null,
        Object.values(bo).filter(Boolean),
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
      // Bé + buổi chụp: `donNenFixture` xoá buổi chụp theo khách, rồi xoá khách → bé đi theo (cascade).
      if (nen) {
        await donNenFixture(pg, {
          galleryIds: Object.values(bo),
          customerIds: [nen.customerId],
          branchIds: [nen.branchId],
          staffIds: [staffId],
        });
      }
    } catch (e) {
      loi.push((e as Error).message);
    } finally {
      await pg.end();
    }
  }
  if (loi.length) throw new Error(`Dọn BB-370 lỗi: ${loi.join(" | ")}`);
});

async function vao(page: Page, w: number, h: number, n: number) {
  await page.setViewportSize({ width: w, height: h });
  await chanLh3TrenTrinhDuyet(page);
  await page.goto(`/k/${maGiaDinh}/${n}`);
  await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 120_000 });
}

async function choAnhTai(page: Page) {
  await page
    .waitForFunction(
      () =>
        [...document.images]
          .filter((i) => i.getBoundingClientRect().bottom > 0 && i.getBoundingClientRect().top < innerHeight)
          .every((i) => i.complete),
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(300);
}

const tiLe = (page: Page) =>
  page.getByTestId("anh-xem-lon").evaluate((el) => {
    const t = getComputedStyle(el).transform;
    if (!t || t === "none") return 1;
    const m = /matrix\(([^,]+),/.exec(t);
    return m ? Number(m[1]) : 1;
  });

test("4a. Tiêu đề + ô chuyển bộ (máy tính & điện thoại) không chứa mã hoá đơn", async ({ page }) => {
  for (const [w, h, ten] of [
    [1440, 900, "may-tinh"],
    [390, 844, "dien-thoai"],
  ] as const) {
    await vao(page, w, h, 1);
    const nut = page.getByTestId("nut-doi-buoi-chup");
    await expect(nut).toBeVisible();
    await expect(nut).toHaveText("Bé Bơ · 13/09/2026");
    const h1 = page.locator("section[aria-label='Ảnh bìa'] h1");
    await expect(h1).toHaveText("Bé Bơ");
    // Không chỗ nào trong đầu trang + bìa lộ mã hoá đơn.
    const chuDau = await page.getByTestId("thanh-thuong-hieu").innerText();
    const chuBia = await page.getByTestId("bia-bo-anh").innerText();
    expect(chuDau).not.toMatch(/HD_|#5067/);
    expect(chuBia).not.toMatch(/HD_|#5067/);
    // Danh sách đổi buổi chụp cũng không.
    await nut.click();
    const ds = page.getByRole("dialog");
    await expect(ds.getByText("Bé Bơ · 20/09/2026")).toBeVisible();
    expect(await ds.innerText()).not.toMatch(/HD_|#5067/);
    await choAnhTai(page);
    await page.screenshot({ path: path.join(THU_MUC_ANH, `4a-o-chuyen-bo-${ten}.png`) });
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.scrollTo(0, 0));
    await choAnhTai(page);
    await page.screenshot({ path: path.join(THU_MUC_ANH, `4a-bia-${ten}.png`) });
  }
});

test("1a. Máy tính: nhấp MỘT lần phóng, nhấp nữa thu; kéo không bật/tắt; mũi tên vẫn lật", async ({ page }) => {
  await vao(page, 1440, 900, 1);
  await page.getByTestId("the-anh").nth(0).click();
  const anh = page.getByTestId("anh-xem-lon");
  await expect(anh).toBeVisible();
  expect(await tiLe(page)).toBe(1);

  await anh.click({ position: { x: 200, y: 200 } });
  await expect.poll(() => tiLe(page)).toBeGreaterThan(1.5);
  await expect(page.getByRole("button", { name: "Thu về" })).toBeVisible();
  await choAnhTai(page);
  await page.screenshot({ path: path.join(THU_MUC_ANH, "1a-nhap-mot-lan-phong.png") });

  // Kéo khi đang phóng: ảnh dịch, KHÔNG thu về.
  const box = (await anh.boundingBox())!;
  const truoc = await anh.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await tiLe(page)).toBeGreaterThan(1.5);
  expect(await anh.evaluate((el) => getComputedStyle(el).transform)).not.toBe(truoc);

  // Nhấp lần nữa (không kéo): thu về 1×.
  await anh.click({ position: { x: 200, y: 200 } });
  await expect.poll(() => tiLe(page)).toBe(1);
  await expect(page.getByRole("button", { name: "Thu về" })).toBeHidden();

  // Mũi tên + nút phải vẫn lật ảnh.
  const dem = page.getByRole("dialog").getByText(/^\s*1\s*\/\s*4\s*$/);
  await expect(dem.first()).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog").getByText(/^\s*2\s*\/\s*4\s*$/).first()).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Sau", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/^\s*3\s*\/\s*4\s*$/).first()).toBeVisible();
});

test.describe("điện thoại (cảm ứng)", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("1b. Điện thoại: chạm MỘT lần không phóng (chạm hai lần mới phóng như cũ)", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/k/${maGiaDinh}/1`);
    await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("the-anh").nth(0).locator("button").first().tap().catch(async () => {
      await page.getByTestId("the-anh").nth(0).tap();
    });
    const anh = page.getByTestId("anh-xem-lon");
    await expect(anh).toBeVisible();
    await anh.tap();
    await page.waitForTimeout(500);
    expect(await tiLe(page)).toBe(1);
    await choAnhTai(page);
    await page.screenshot({ path: path.join(THU_MUC_ANH, "1b-dien-thoai-cham-mot-lan.png") });
  });

  test("2b. Điện thoại: bộ đã chốt — bấm Ghi chú thấy nguyên văn ghi chú (chỉ đọc)", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/k/${maGiaDinh}/2`);
    const o = page.getByTestId("the-anh").nth(0);
    await expect(o).toBeVisible({ timeout: 120_000 });
    await expect(o.getByTestId("dau-co-ghi-chu")).toBeVisible();
    await o.locator("button").first().tap();
    const hop = page.getByRole("dialog");
    await hop.getByRole("button", { name: "Ghi chú cho thợ chỉnh ảnh" }).tap();
    const chiDoc = hop.locator('[data-testid="ghi-chu-chi-doc"]:visible');
    await expect(chiDoc).toContainText(GHI_CHU);
    await page.waitForTimeout(400);
    await choAnhTai(page);
    await page.screenshot({ path: path.join(THU_MUC_ANH, "2b-ghi-chu-chi-doc-dien-thoai.png") });
  });
});

test("2a. Máy tính: bộ đã chốt — dấu ghi chú trên lưới + ghi chú hiện chỉ đọc ở xem lớn", async ({ page }) => {
  await vao(page, 1440, 900, 2);
  const o1 = page.getByTestId("the-anh").nth(0);
  const o2 = page.getByTestId("the-anh").nth(1);
  await expect(o1.getByTestId("dau-co-ghi-chu")).toBeVisible();
  await expect(o2.getByTestId("dau-co-ghi-chu")).toHaveCount(0);
  await o1.scrollIntoViewIfNeeded();
  await choAnhTai(page);
  await page.screenshot({ path: path.join(THU_MUC_ANH, "2a-luoi-dau-ghi-chu.png") });

  await o1.click();
  const chiDoc = page.locator('[data-testid="ghi-chu-chi-doc"]:visible');
  await expect(chiDoc).toContainText(GHI_CHU);
  await expect(page.locator("#ghi-chu-anh-ben-phai")).toHaveCount(0);
  await choAnhTai(page);
  await page.screenshot({ path: path.join(THU_MUC_ANH, "2a-xem-lon-ghi-chu-chi-doc.png") });
  // Tấm không có ghi chú: nói rõ, không để ô trống.
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-testid="ghi-chu-chi-doc"]:visible')).toContainText("không có ghi chú");
});

test("3. So sánh: ghim từ lưới, đổi tấm còn lại, bỏ tim ngay tại chỗ không mất tấm", async ({ page }) => {
  await vao(page, 1440, 900, 1);
  const the = page.getByTestId("the-anh");
  // Tấm 3 và 4 đã thả tim sẵn (gieo ở beforeAll), tấm 1–2 để so (chưa chọn).
  await expect(the.nth(2).getByRole("button", { name: "Bỏ chọn" })).toBeVisible();
  await expect(the.nth(3).getByRole("button", { name: "Bỏ chọn" })).toBeVisible();
  await page.getByRole("button", { name: "So sánh", exact: true }).first().click();
  await the.nth(0).click();
  await the.nth(1).click();
  await page.getByRole("button", { name: /Đã chọn 2 tấm để so sánh/ }).click();
  const man = page.getByRole("dialog", { name: "So sánh nhiều tấm" });
  // Màn so sánh nạp động (dynamic import) — máy chủ dev dựng lần đầu có thể chậm.
  await expect(man).toBeVisible({ timeout: 60_000 });

  // Ghim TẤM 2 ngay từ lưới so sánh.
  await man.getByRole("button", { name: "Ghim tấm này" }).nth(1).click();
  const nutGhim = man.getByRole("button", { name: "Bỏ ghim" });
  await expect(nutGhim).toBeVisible();
  const anhGhim = nutGhim.locator("xpath=parent::div//img");
  const srcGhim = await anhGhim.getAttribute("src");
  const dem = man.getByText(/^\d+ \/ \d+$/);
  // Danh sách vuốt: tấm 1 (so sánh) + tấm 3, 4 (đã thả tim) → đứng ở tấm 1.
  await expect(dem).toHaveText("1 / 3");

  await man.getByRole("button", { name: "Tấm sau" }).click();
  await expect(dem).toHaveText("2 / 3");
  expect(await anhGhim.getAttribute("src")).toBe(srcGhim);
  await choAnhTai(page);
  await page.screenshot({ path: path.join(THU_MUC_ANH, "3-so-sanh-ghim-doi-tam.png") });

  // Bỏ tim tấm đang vuốt NGAY TẠI CHỖ: tấm vẫn đứng đó, nút đổi thành "Chọn ảnh này".
  const khungVuot = man.getByTestId("khung-vuot-so-sanh");
  await khungVuot.getByRole("button", { name: "Bỏ chọn" }).click();
  await expect(khungVuot.getByRole("button", { name: "Chọn ảnh này" })).toBeVisible();
  await expect(dem).toHaveText("2 / 3");
  // Thả tim lại được.
  await khungVuot.getByRole("button", { name: "Chọn ảnh này" }).click();
  await expect(khungVuot.getByRole("button", { name: "Bỏ chọn" })).toBeVisible();
  await expect(dem).toHaveText("2 / 3");
});

test("2c + 4b. Quản trị: ghi chú từng ảnh + khung xem trước bìa giống màn khách, không mã hoá đơn", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await chanLh3TrenTrinhDuyet(page);
  await dangNhapNhanVien(page, emailNv, password);
  await page.goto(`/admin/galleries/${bo.chot}`);
  const gc = page.getByTestId("ghi-chu-anh-quan-tri");
  await expect(gc).toBeVisible({ timeout: 60_000 });
  await expect(gc).toContainText(GHI_CHU);
  await gc.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(THU_MUC_ANH, "2c-quan-tri-ghi-chu.png") });

  await page.goto(`/admin/galleries/${bo.mo}`);
  await page.getByRole("button", { name: /Mở trình thiết kế bìa|Đổi bìa/ }).click();
  const hop = page.getByRole("dialog", { name: "Thiết kế bìa bộ ảnh" });
  await expect(hop).toBeVisible();
  // Không còn chọn bố cục (màn khách không đọc bố cục).
  await expect(hop.getByRole("button", { name: "Tối giản" })).toHaveCount(0);
  await hop.getByRole("button", { name: /^Chọn .* làm bìa$/ }).first().click();
  const khung = page.getByTestId("khung-xem-truoc-bia");
  await expect(khung.getByTestId("ten-bo-xem-truoc")).toHaveText("Bé Bơ · 13/09/2026");
  await expect(khung.locator("section[aria-label='Ảnh bìa'] h1")).toHaveText("Bé Bơ");
  expect(await khung.innerText()).not.toMatch(/HD_|#5067/);
  // Khung xem trước đứng ở đầu cột (không phải cuộn mới thấy).
  const hopKhung = (await khung.boundingBox())!;
  expect(hopKhung.y).toBeLessThan(200);
  await choAnhTai(page);
  await page.screenshot({ path: path.join(THU_MUC_ANH, "4b-doi-bia-may-tinh.png") });
  await hop.getByRole("button", { name: "Điện thoại", exact: true }).click();
  await expect(khung).toHaveAttribute("data-kho", "dien-thoai");
  await expect(khung.getByTestId("ten-bo-xem-truoc")).toHaveText("Bé Bơ · 13/09/2026");
  await choAnhTai(page);
  await page.screenshot({ path: path.join(THU_MUC_ANH, "4b-doi-bia-dien-thoai.png") });
});
