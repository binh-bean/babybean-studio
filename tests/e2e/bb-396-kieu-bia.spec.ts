/**
 * BB-396 — chọn kiểu bìa ngay đầu trình thiết kế, màn khách thấy đúng kiểu đã chọn.
 *
 *   1. Admin mở trình thiết kế bìa → 4 ô "Kiểu bìa" (mẫu thật) nằm TRONG khung nhìn
 *      ngay, không cuộn (máy tính 1440×900 và điện thoại 390×844).
 *   2. Bấm "Tạp chí" → khung xem trước lớn đổi sang kiểu Tạp chí → Lưu bìa → cột
 *      `cover_layout` = 'tap-chi', khối tóm tắt ghi "Kiểu bìa: Tạp chí".
 *   3. Mở link khách (máy tính + điện thoại) → bìa khách là kiểu Tạp chí
 *      (`[data-kieu-bia='tap-chi']`) và có ĐỦ khối chức năng như Bên cạnh: mời ông bà,
 *      dải "Vài khoảnh khắc", bộ ba thông tin (máy tính) / dòng cuối (điện thoại).
 *   4. Bộ đã gửi danh sách (kiểu Tạp chí): nút "Nhắn cho studio" (khi có kênh chat),
 *      dải khoảnh khắc, dấu đã chốt.
 *
 * Dữ liệu: nền Fixture riêng (`dungNenFixture`), dọn theo id ở afterAll. Tên giả.
 * Lark: máy chủ thử chạy với PHEP_THU_TRINH_DUYET=1 (route lưu bìa không gọi Lark).
 *
 * Chạy: PW_PORT=3396 npx playwright test tests/e2e/bb-396-kieu-bia.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";

const password = "Password123!";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const TEN_KIEU = ["Bên cạnh", "Tạp chí", "Tối giản", "Đè chéo"];

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

let pg: Client;
let nen: NenFixture;
let staffId = "";
let emailNv = "";
let galleryId = "";
let maGiaDinh = "";

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

test.beforeAll(async () => {
  test.setTimeout(90_000);
  pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  nen = await dungNenFixture(pg, "BB-396");

  const { rows: be } = await pg.query(
    `insert into babies (customer_id, full_name, nickname) values ($1,$2,'Mít') returning id`,
    [nen.customerId, `Fixture BB-396 ${nen.runId} Mít`],
  );
  const beId = be[0].id as string;
  const { rows: s } = await pg.query(
    `insert into shoots (branch_id, customer_id, baby_id, shoot_date) values ($1,$2,$3,'2026-09-20') returning id`,
    [nen.branchId, nen.customerId, beId],
  );
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                            photo_count, included_quota, extra_photo_price, download_enabled, shoot_id, baby_id)
     values ($1,$2,$3,'ready',$4,'https://example.com/bb396',4,5,50000,false,$5,$6) returning id`,
    [nen.branchId, nen.customerId, `Fixture BB-396 ${nen.runId} Bộ`, `SEED_FOLDER_ID_BB396_${nen.runId}`, s[0].id, beId],
  );
  galleryId = g[0].id as string;
  const anh: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const { rows: p } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
       values ($1,$2,$3,'image/jpeg',$4,'active',2400,1600) returning id`,
      [galleryId, `bb396-${nen.runId}-${i}`, `BB396_000${i}.jpg`, i],
    );
    anh.push(p[0].id as string);
  }
  // Bộ đã có ảnh bìa, CHƯA có kiểu bìa (null = "Bên cạnh") — đúng dữ liệu thật hiện nay.
  await pg.query(`update galleries set cover_photo_id = $1, cover_layout = null where id = $2`, [anh[0], galleryId]);

  maGiaDinh = randomBytes(32).toString("base64url");
  await pg.query(
    `insert into share_links (customer_id, token_hash, token_prefix, role, status, label)
     values ($1,$2,$3,'owner','active',$4)`,
    [nen.customerId, sha256(maGiaDinh), maGiaDinh.slice(0, 6), `Fixture BB-396 ${nen.runId} link`],
  );

  emailNv = `test_bb396_${nen.runId}@demo.babybean.vn`;
  const { data, error } = await admin().auth.admin.createUser({ email: emailNv, password, email_confirm: true });
  if (error) throw error;
  staffId = data.user!.id;
  await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
    staffId,
    `Fixture BB-396 ${nen.runId} Admin`,
    emailNv,
  ]);
});

test.afterAll(async () => {
  test.setTimeout(90_000);
  const loi: string[] = [];
  if (pg) {
    try {
      const { rows } = await pg.query(`select id from share_links where customer_id = $1 or gallery_id = $2`, [
        nen?.customerId ?? null,
        galleryId || null,
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
      if (nen) {
        await donNenFixture(pg, {
          galleryIds: [galleryId],
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
  if (loi.length) throw new Error(`Dọn BB-396 lỗi: ${loi.join(" | ")}`);
});

async function moTrinhThietKe(page: Page) {
  await page.goto(`/admin/galleries/${galleryId}`);
  await page.getByRole("button", { name: /Mở trình thiết kế bìa|Đổi bìa/ }).click();
  const hop = page.getByRole("dialog", { name: "Thiết kế bìa bộ ảnh" });
  await expect(hop).toBeVisible();
  return hop;
}

/** Ô nằm trọn trong khung nhìn hiện tại (không cần cuộn). */
async function trongKhungNhin(page: Page, hop: { boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> }) {
  const vp = page.viewportSize()!;
  const b = (await hop.boundingBox())!;
  expect(b).not.toBeNull();
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
  expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
}

test("1. Mở trình thiết kế: 4 ô kiểu bìa thấy ngay, không cuộn (máy tính + điện thoại)", async ({ page }) => {
  await chanLh3TrenTrinhDuyet(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await dangNhapNhanVien(page, emailNv, password);

  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    const hop = await moTrinhThietKe(page);
    // Không cuộn gì: kiểm ngay sau khi mở.
    for (const ten of TEN_KIEU) {
      const o = hop.getByRole("button", { name: `Kiểu bìa ${ten}` });
      await expect(o).toBeVisible();
      await trongKhungNhin(page, o);
    }
    // Kiểu đang dùng (null) = Bên cạnh.
    await expect(hop.getByRole("button", { name: "Kiểu bìa Bên cạnh" })).toHaveAttribute("aria-pressed", "true");
    // Ô kiểu bìa đứng TRƯỚC lưới ảnh.
    const oKieuY = (await hop.getByTestId("chon-kieu-bia").boundingBox())!.y;
    const luoiY = (await hop.getByTestId("luoi-chon-bia").boundingBox())!.y;
    expect(oKieuY).toBeLessThan(luoiY);
    // Điện thoại: không tràn ngang trang.
    const tranNgang = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(tranNgang).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(hop).toBeHidden();
  }
});

test("2. Chọn Tạp chí → xem trước đổi ngay → Lưu → khách thấy bìa Tạp chí", async ({ page }) => {
  await chanLh3TrenTrinhDuyet(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await dangNhapNhanVien(page, emailNv, password);
  const hop = await moTrinhThietKe(page);

  const khung = hop.getByTestId("khung-xem-truoc-bia");
  await expect(khung).toHaveAttribute("data-kieu-chon", "ben-canh");
  await hop.getByRole("button", { name: "Kiểu bìa Tạp chí" }).click();
  await expect(khung).toHaveAttribute("data-kieu-chon", "tap-chi");
  await expect(khung.locator("[data-kieu-bia='tap-chi']")).toBeVisible();
  await expect(hop.getByRole("button", { name: "Kiểu bìa Tạp chí" })).toHaveAttribute("aria-pressed", "true");

  // Ô thu nhỏ theo khổ đang xem: đổi sang Điện thoại thì ô kiểu bìa cũng khổ điện thoại.
  await hop.getByRole("button", { name: "Điện thoại", exact: true }).click();
  await expect(hop.getByTestId("chon-kieu-bia")).toHaveAttribute("data-kho", "dien-thoai");
  await expect(khung).toHaveAttribute("data-kho", "dien-thoai");

  // Chỉ đổi kiểu cũng lưu được.
  const nutLuu = hop.getByRole("button", { name: "Lưu bìa" });
  await expect(nutLuu).toBeEnabled();
  await nutLuu.click();
  await expect(hop).toBeHidden();
  await expect(page.getByText("Đã lưu bìa.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("kieu-bia-dang-dung")).toHaveText("Kiểu bìa: Tạp chí");

  const { rows } = await pg.query(`select cover_layout from galleries where id = $1`, [galleryId]);
  expect(rows[0].cover_layout).toBe("tap-chi");

  // Màn khách — máy tính rồi điện thoại.
  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`/k/${maGiaDinh}/1`);
    await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 120_000 });
    const biaKhach = page.locator("[data-kieu-bia]").first();
    await expect(biaKhach).toHaveAttribute("data-kieu-bia", "tap-chi");
    await expect(page.locator("section[aria-label='Ảnh bìa'] h1")).toBeVisible();
    // Bìa khách vừa màn đầu: nút chính của bìa nằm trong khung nhìn.
    const biaSec = page.locator("section[aria-label='Ảnh bìa']");
    const nutChinh = biaSec.getByTestId("bia-nut-chinh");
    await expect(nutChinh).toBeVisible();
    await expect(nutChinh).toHaveText(/Bắt đầu chọn ảnh|Tiếp tục chọn/);
    await trongKhungNhin(page, nutChinh);
    // BB-396 vòng 2 — kiểu Tạp chí có ĐỦ khối chức năng như Bên cạnh.
    await expect(biaSec.getByTestId("nut-moi-ong-ba-bia")).toBeVisible();
    if (w >= 1024) {
      await expect(biaSec.getByTestId("bia-dai-khoanh-khac")).toBeVisible();
      await expect(biaSec.getByTestId("bia-dai-khoanh-khac").getByRole("button", { name: "Xem ảnh này trong lưới" })).toHaveCount(4);
      await expect(biaSec.getByTestId("bia-thong-tin-mt")).toBeVisible();
    } else {
      await expect(biaSec.getByTestId("bia-dong-cuoi-dt")).toBeVisible();
      await expect(biaSec.getByTestId("bia-meta-dt")).toBeVisible();
      const tranNgang = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(tranNgang).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: test.info().outputPath(`bia-tap-chi-${w}.png`) });
  }
});

test("3. Kiểu Tạp chí, bộ đã gửi danh sách: Nhắn studio (khi studio có cài kênh chat) + dải khoảnh khắc + dấu đã chốt", async ({ page }) => {
  // Bộ đã gửi danh sách: bìa không còn nút Mời ông bà (luật BB-355/gallery-app) nên
  // chỗ đó là nút "Nhắn cho studio" — y như kiểu Bên cạnh.
  await pg.query(`update galleries set cover_layout = 'tap-chi', status = 'submitted', submitted_at = now() where id = $1`, [galleryId]);
  const { rows: chat } = await pg.query(`select value from settings where key = 'chat.page_url' and branch_id is null`);
  const coKenhChat = typeof chat[0]?.value === "string" && (chat[0].value as string).startsWith("https://");

  await chanLh3TrenTrinhDuyet(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/k/${maGiaDinh}/1`);
  await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 120_000 });
  const biaSec = page.locator("section[aria-label='Ảnh bìa']");
  await expect(page.locator("[data-kieu-bia]").first()).toHaveAttribute("data-kieu-bia", "tap-chi");
  await expect(biaSec.getByTestId("bia-nut-chinh")).toBeVisible();
  await expect(biaSec.getByTestId("bia-dai-khoanh-khac")).toBeVisible();
  await expect(biaSec.getByTestId("bia-dau-da-chot")).toBeVisible();
  await expect(biaSec.getByTestId("nut-moi-ong-ba-bia")).toHaveCount(0);
  if (coKenhChat) {
    await expect(biaSec.getByTestId("nut-nhan-studio-bia")).toBeVisible();
  } else {
    test.info().annotations.push({ type: "bo-qua", description: "bb-dev chưa cài chat.page_url — không kiểm được nút Nhắn studio (phép thử thuần đã canh)." });
  }
  await page.screenshot({ path: test.info().outputPath("bia-tap-chi-da-gui-1440.png") });
});
