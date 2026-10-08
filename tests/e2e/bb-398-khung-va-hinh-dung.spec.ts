/**
 * BB-398 — phần bán hàng (anh 08/10/2026):
 *   Ca 1. Tab Khung → "Mua khung lẻ": không có bước chọn ảnh; "Thêm vào giỏ" gửi
 *         /api/g/addons KHÔNG ảnh, KHÔNG gắn dòng in → một dòng khung lẻ trong DB.
 *   Ca 2. Đã đặt in Gỗ 40×60 (+ một tấm UV) → "Đóng khung ảnh đã đặt in": chỉ dòng Gỗ
 *         hiện (UV không), có tên tệp; "Thêm khung" → khung ĐÚNG KHỔ 40×60 gắn
 *         `gan_voi_addon_id` = dòng in; dòng chuyển "Đã có khung".
 *   Ca 3. Tab Ảnh in → nút "Xem trên tường nhà" mở màn treo tường (đúng chất liệu đã chọn).
 *   Ca 4. Tab Album → "Xem album trên bàn": cuốn album trên mặt bàn, đổi khổ thì cuốn đổi.
 *   Vòng 2: Esc trên màn treo (ca 3) / màn album (ca 4) chỉ đóng màn đó, cửa hàng còn mở.
 *   Ca 5 (vòng 3). Bộ đã xác nhận đợt 1 (`in_retouch`): màn "Chọn thêm ảnh" → cửa hàng của đợt →
 *         "Đóng khung ảnh đã đặt in" có tấm Gỗ đợt 1 → thêm khung → chốt đợt 2 → dòng khung
 *         `dot = 2`, `gan_voi_addon_id` = dòng in đợt 1. Cần 0104 + 0106 (chỉ mục theo đợt).
 *
 * Nền Fixture riêng (chi nhánh + khách "Fixture BB-398 …"), dọn theo id. Sản phẩm lấy
 * từ danh mục THẬT (chỉ đọc). Dòng in Gỗ/UV đã đặt được CHÈN THẲNG vào `selection_addons`
 * (dữ liệu của chính bộ Fixture) để ca 2 không phụ thuộc lưới chọn ảnh (bb-279 đã canh).
 *
 * CHƯA CHẠY (luật Đợt 19). Chạy: `PW_PORT=3398 npx playwright test tests/e2e/bb-398-khung-va-hinh-dung.spec.ts --workers=1`.
 * Cần migration 0104 (`selection_addons.gan_voi_addon_id`) đã áp — chưa áp thì cả tệp bỏ qua.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import type { Page } from "@playwright/test";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

interface Bo {
  id: string;
  maBaMe: string;
  selectionId: string;
  anh: string[];
}

// `hau` — ca 5 dựng bộ THỨ HAI trên cùng nền: `galleries.drive_folder_id` là UNIQUE
// (`uq_galleries_drive_folder`), nên mỗi bộ cần mã thư mục (và mã tệp) riêng.
async function dungBo(pg: Client, nen: NenFixture, hau = ""): Promise<Bo> {
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                            photo_count, included_quota, extra_photo_price, download_enabled)
     values ($1,$2,$3,'in_review',$4,'https://example.com/bb398',6,10,50000,false) returning id`,
    [nen.branchId, nen.customerId, `Fixture BB-398 ${nen.runId}`, `SEED_FOLDER_ID_BB398_${nen.runId}${hau}`],
  );
  const id = g[0].id as string;
  const anh: string[] = [];
  // Dữ liệu giả: kích thước dọc/ngang, không ảnh trẻ em thật.
  const kich = [
    [2000, 3000],
    [3000, 2000],
    [2000, 3000],
    [3000, 2000],
    [2000, 2000],
    [2000, 3000],
  ];
  for (let i = 0; i < kich.length; i++) {
    const { rows } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
       values ($1,$2,$3,'image/jpeg',$4,'active',$5,$6) returning id`,
      [id, `bb398fixture${nen.runId}${hau}${i}`, `BB398_${i + 1}.jpg`, i + 1, kich[i]![0], kich[i]![1]],
    );
    anh.push(rows[0].id as string);
  }
  const maBaMe = randomBytes(32).toString("base64url");
  const { rows: l } = await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
     values ($1,$2,$3,'owner','active') returning id`,
    [id, sha256(maBaMe), maBaMe.slice(0, 6)],
  );
  const { rows: s } = await pg.query(
    `insert into selections (gallery_id, share_link_id, display_name, is_primary) values ($1,$2,$3,true) returning id`,
    [id, l[0].id, `Fixture BB-398 ${nen.runId}`],
  );
  const selectionId = s[0].id as string;
  for (const photoId of anh.slice(0, 3)) {
    await pg.query(`insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`, [
      selectionId,
      photoId,
      id,
    ]);
  }
  return { id, maBaMe, selectionId, anh };
}

async function moCuaHang(page: Page, maBaMe: string) {
  await chanLh3TrenTrinhDuyet(page);
  await page.goto(`/g/${maBaMe}`);
  await page.locator("#dau-luoi-anh").waitFor({ state: "attached", timeout: 120_000 });
  await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
  const nut = page.getByRole("button", { name: "Mua thêm" });
  await expect(nut).toBeVisible({ timeout: 30_000 });
  await nut.click();
  const hop = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
  await expect(hop).toBeVisible();
  return hop;
}

test.describe("BB-398: khung hai cách bán + hình dung trên tường / trên bàn", () => {
  test.describe.configure({ timeout: 240_000 });
  let pg: Client;
  let nen: NenFixture;
  let bo: Bo;
  let co0104 = false;
  let khung40 = "";
  let dongInGo = "";
  let coAlbum = false;

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const { rows: cot } = await pg.query(
      `select 1 from information_schema.columns where table_name = 'selection_addons' and column_name = 'gan_voi_addon_id'`,
    );
    co0104 = cot.length > 0;
    nen = await dungNenFixture(pg, "BB-398");
    bo = await dungBo(pg, nen);

    // Sản phẩm THẬT đang bán (chỉ đọc).
    const mot = async (sql: string) => (await pg.query(sql)).rows[0] as { id: string; list_price: string } | undefined;
    const go = await mot(
      `select id, list_price from products where is_active and kind = 'print' and material = 'Gỗ' and size = '40x60' and list_price > 0 limit 1`,
    );
    const uv = await mot(
      `select id, list_price from products where is_active and kind = 'print' and material ilike 'uv%' and list_price > 0 order by size limit 1`,
    );
    const k = await mot(
      `select id, list_price from products where is_active and material ilike 'khung%' and size = '40x60' and list_price > 0 limit 1`,
    );
    const al = await mot(`select id, list_price from products where is_active and material ilike 'album%' and list_price > 0 limit 1`);
    coAlbum = Boolean(al);
    if (!go || !k) throw new Error("Cần Gỗ 40x60 và Khung HQ 40x60 đang bán trong danh mục");
    khung40 = k.id;

    // Ba mẹ đã đặt in: Gỗ 40×60 cho tấm 1, UV cho tấm 2 (dòng của chính bộ Fixture).
    const { rows: r1 } = await pg.query(
      `insert into selection_addons (selection_id, product_id, photo_id, quantity, unit_price)
       values ($1,$2,$3,1,$4) returning id`,
      [bo.selectionId, go.id, bo.anh[0], go.list_price],
    );
    dongInGo = r1[0].id as string;
    if (uv) {
      await pg.query(
        `insert into selection_addons (selection_id, product_id, photo_id, quantity, unit_price) values ($1,$2,$3,1,$4)`,
        [bo.selectionId, uv.id, bo.anh[1], uv.list_price],
      );
    }
  });

  test.afterAll(async () => {
    try {
      await donNenFixture(pg, { galleryIds: [bo?.id], customerIds: [nen?.customerId], branchIds: [nen?.branchId] });
    } finally {
      await pg.end();
    }
  });

  test("1. Mua khung lẻ: không chọn ảnh, ghi một dòng khung không ảnh", async ({ page }) => {
    test.skip(!co0104, "Migration 0104 chưa áp.");
    const hop = await moCuaHang(page, bo.maBaMe);
    await hop.getByRole("button", { name: "Khung", exact: true }).click();
    await expect(hop.getByTestId("loi-khung-le")).toHaveAttribute("aria-selected", "true");
    await expect(hop.getByRole("button", { name: "Thêm ảnh vào tấm này" })).toHaveCount(0);
    await expect(hop.getByTestId("ghi-chu-khung-le")).toBeVisible();

    const gui = page.waitForRequest((r) => r.url().endsWith("/api/g/addons") && r.method() === "POST");
    const xong = page.waitForResponse((r) => r.url().endsWith("/api/g/addons") && r.request().method() === "POST");
    await hop.getByRole("button", { name: "Thêm vào giỏ", exact: true }).click();
    const body = (await gui).postDataJSON() as { photoId?: string | null; ganVoiAddonId?: string | null };
    expect(body.photoId ?? null).toBeNull();
    expect(body.ganVoiAddonId ?? null).toBeNull();
    expect((await xong).status()).toBe(200);
    await expect(hop.getByTestId("da-them-vao-gio")).toBeVisible();

    const { rows } = await pg.query(
      `select sa.photo_id, sa.gan_voi_addon_id from selection_addons sa join products p on p.id = sa.product_id
        where sa.selection_id = $1 and p.material ilike 'khung%'`,
      [bo.selectionId],
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.photo_id === null && r.gan_voi_addon_id === null)).toBe(true);
  });

  test("2. Đóng khung cho ảnh đã đặt in: khung đúng khổ, gắn dòng in; UV không có trong danh sách", async ({ page }) => {
    test.skip(!co0104, "Migration 0104 chưa áp.");
    const hop = await moCuaHang(page, bo.maBaMe);
    await hop.getByRole("button", { name: "Khung", exact: true }).click();
    await hop.getByTestId("loi-khung-gan-in").click();

    const dong = hop.getByTestId("dong-in-cho-khung");
    await expect(dong).toHaveCount(1);
    await expect(dong).toContainText("BB398_1.jpg");
    await expect(dong).toContainText("40×60");
    await expect(hop.getByText("BB398_2.jpg")).toHaveCount(0);

    const gui = page.waitForRequest((r) => r.url().endsWith("/api/g/addons") && r.method() === "POST");
    const xong = page.waitForResponse((r) => r.url().endsWith("/api/g/addons") && r.request().method() === "POST");
    await dong.getByTestId("nut-them-khung-cho-dong").click();
    const body = (await gui).postDataJSON() as { productId?: string; ganVoiAddonId?: string; quantity?: number };
    expect(body.ganVoiAddonId).toBe(dongInGo);
    expect(body.productId).toBe(khung40);
    expect(body.quantity).toBe(1);
    expect((await xong).status()).toBe(200);
    await expect(dong.getByTestId("khung-da-co")).toBeVisible();

    const { rows } = await pg.query(
      `select sa.photo_id, p.size from selection_addons sa join products p on p.id = sa.product_id
        where sa.gan_voi_addon_id = $1`,
      [dongInGo],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].photo_id).toBe(bo.anh[0]);
    expect(String(rows[0].size).replace("×", "x")).toBe("40x60");
  });

  test("3. Cửa hàng có nút 'Xem trên tường nhà' mở màn treo tường", async ({ page }) => {
    const hop = await moCuaHang(page, bo.maBaMe);
    await hop.getByRole("button", { name: "Ảnh in", exact: true }).click();
    const go = hop.getByRole("button", { name: "Gỗ", exact: true });
    if ((await go.count()) > 0) await go.click();
    const nut = hop.getByTestId("nut-xem-tren-tuong-cua-hang");
    await expect(nut).toBeVisible();
    await expect(nut).toContainText("Xem trên tường nhà");
    await nut.click();
    const tuong = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
    await expect(tuong).toBeVisible({ timeout: 30_000 });
    // Vòng 2 — Esc chỉ đóng màn treo (lớp trên cùng), cửa hàng bên dưới còn nguyên.
    await page.keyboard.press("Escape");
    await expect(tuong).toHaveCount(0);
    await expect(hop).toBeVisible();
  });

  test("5. Đợt 2 đóng khung cho tấm in Gỗ 40×60 của đợt 1", async ({ page }) => {
    test.skip(!co0104, "Migration 0104 chưa áp.");
    test.setTimeout(180_000);
    // Bộ RIÊNG đã xác nhận đợt 1 (chế độ chọn thêm), dòng in Gỗ 40×60 đợt 1 của chính bộ Fixture.
    const boDot = await dungBo(pg, nen, "_dot2");
    await pg.query("update galleries set status = 'in_retouch' where id = $1", [boDot.id]);
    const { rows: go } = await pg.query(
      `select id, list_price from products where is_active and kind = 'print' and material = 'Gỗ' and size = '40x60' and list_price > 0 limit 1`,
    );
    const { rows: inDot1 } = await pg.query(
      `insert into selection_addons (selection_id, product_id, photo_id, quantity, unit_price, dot)
       values ($1,$2,$3,1,$4,1) returning id`,
      [boDot.selectionId, go[0].id, boDot.anh[0], go[0].list_price],
    );
    const idInDot1 = inDot1[0].id as string;
    try {
      await chanLh3TrenTrinhDuyet(page);
      await page.goto(`/g/${boDot.maBaMe}`);
      const the = page.getByTestId("chon-them-anh");
      await expect(the).toBeVisible({ timeout: 120_000 });
      await the.getByRole("button", { name: "Chọn thêm ảnh" }).click();
      const man = page.getByTestId("man-chon-them-anh");
      await expect(man).toBeVisible();

      await man.getByRole("button", { name: /Thêm ảnh in, khung, album/ }).click();
      const hop = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
      await expect(hop).toBeVisible();
      await hop.getByRole("button", { name: "Khung", exact: true }).click();
      await hop.getByTestId("loi-khung-gan-in").click();
      const dong = hop.getByTestId("dong-in-cho-khung");
      await expect(dong).toHaveCount(1);
      await expect(dong).toContainText("BB398_1.jpg");
      // Giỏ đợt chưa lưu: không gọi /api/g/addons, chỉ vào giỏ.
      await dong.getByTestId("nut-them-khung-cho-dong").click();
      await expect(hop.getByTestId("nhan-khung-gio").first()).toContainText("BB398_1.jpg");
      await hop.getByRole("button", { name: "Đóng", exact: true }).first().click();

      await man.getByTestId("nut-chot-dot").click();
      const hopChot = page.getByTestId("hop-xac-nhan-dot");
      await expect(hopChot).toBeVisible();
      const gui = page.waitForRequest((r) => r.url().endsWith("/api/g/dot-chon/chot") && r.method() === "POST");
      const xong = page.waitForResponse((r) => r.url().endsWith("/api/g/dot-chon/chot") && r.request().method() === "POST");
      await hopChot.getByTestId("nut-xac-nhan-chot-dot").click();
      const body = (await gui).postDataJSON() as { items?: Array<{ ganVoiAddonId?: string }> };
      expect(body.items?.some((i) => i.ganVoiAddonId === idInDot1)).toBe(true);
      expect((await xong).status()).toBe(200);

      const { rows } = await pg.query(
        `select sa.dot, sa.photo_id, p.size from selection_addons sa join products p on p.id = sa.product_id
          where sa.gan_voi_addon_id = $1`,
        [idInDot1],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].dot).toBe(2);
      expect(rows[0].photo_id).toBe(boDot.anh[0]);
      expect(String(rows[0].size).replace("×", "x")).toBe("40x60");
    } finally {
      await donNenFixture(pg, { galleryIds: [boDot.id] });
    }
  });

  test("4. Tab Album: 'Xem album trên bàn' đặt cuốn lên mặt bàn, đổi khổ thì cuốn đổi", async ({ page }) => {
    test.skip(!coAlbum, "Danh mục chưa có album đang bán.");
    const hop = await moCuaHang(page, bo.maBaMe);
    await hop.getByRole("button", { name: "Album", exact: true }).click();
    const man = hop.getByTestId("man-ban-album");
    await expect(man).toBeVisible();
    // Mỗi dòng khổ: "Khổ 20×20 cm · 25–30 ảnh" (khổ trong bảng anh đưa).
    await expect(man.getByTestId("ban-album-dong-kho").first()).toHaveText(/(Khổ \d+×\d+ cm · \d+–\d+ ảnh|\d+×\d+ cm)/);

    await man.getByTestId("nut-xem-album-tren-ban").click();
    const ban = page.getByTestId("xem-album-tren-ban");
    await expect(ban).toBeVisible();
    const cuon = ban.getByTestId("cuon-album-tren-ban");
    await expect(cuon).toBeVisible();
    await expect(ban.locator('img[src^="/tuong/ban-uv-"]')).toHaveCount(1);

    const chip = ban.getByTestId("chip-kho-album-tren-ban");
    if ((await chip.count()) >= 2) {
      const kho1 = await cuon.getAttribute("data-kho");
      const hop1 = await cuon.boundingBox();
      const dienTich1 = (hop1?.width ?? 0) * (hop1?.height ?? 0);
      await chip.nth(1).click();
      await expect(cuon).not.toHaveAttribute("data-kho", kho1 ?? "");
      await page.waitForTimeout(400); // chờ chuyển động 300ms
      const hop2 = await cuon.boundingBox();
      const dienTich2 = (hop2?.width ?? 0) * (hop2?.height ?? 0);
      // Khổ khác → diện tích cuốn trên bàn khác (to nhỏ theo cm).
      expect(Math.abs(dienTich2 - dienTich1)).toBeGreaterThan(1);
    }
    await expect(ban.getByTestId("nut-dat-album-kho-nay")).toBeVisible();
    // Vòng 2 — Esc chỉ đóng màn album, cửa hàng vẫn mở.
    await page.keyboard.press("Escape");
    await expect(ban).toHaveCount(0);
    await expect(hop).toBeVisible();
    await expect(man).toBeVisible();
  });
});
