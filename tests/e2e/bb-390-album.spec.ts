/**
 * BB-390 — album đúng khái niệm của anh: album là SẢN PHẨM in (quyển, số tấm theo khổ — BB-398 — một
 * ảnh bìa).
 *   Ca 1. Bộ A — gói CÓ album: hiện bước "Chọn ảnh bìa album", Bean gợi ý (≤ 6 tấm, chỉ
 *         tấm đã thả tim), bấm một tấm → lưu bìa (POST /api/g/album-cover 200), đổi được.
 *         Khối "Trong gói" không còn đòi "chọn ảnh vào cuốn".
 *   Ca 2. Bộ B — gói KHÔNG có album: không có bước chọn bìa; mở cửa hàng → tab Album là
 *         MÀN BÁN HÀNG (không lưới ảnh), "Đặt album" → POST /api/g/addons không kèm ảnh.
 *
 * Nền Fixture riêng (chi nhánh + khách "Fixture BB-390 …"), dọn theo id. Sản phẩm album
 * lấy từ danh mục THẬT (chỉ đọc, không sửa). Ảnh có width/height (vuông + dọc) để luật
 * hợp khổ bìa có dữ liệu.
 *
 * CHƯA CHẠY (luật Đợt 19). Chạy: `PW_PORT=3390 npx playwright test tests/e2e/bb-390-album.spec.ts --workers=1`.
 * Cần migration 0075 (album_covers) đã áp — chưa áp thì ca 1 tự bỏ qua bước lưu bìa.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

interface Bo {
  id: string;
  maBaMe: string;
  selectionId: string;
  anh: string[];
}

async function dungBo(pg: Client, nen: NenFixture, ten: string, dongHang: Array<{ productId: string; qty: number }>): Promise<Bo> {
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                            photo_count, included_quota, extra_photo_price, download_enabled)
     values ($1,$2,$3,'in_review',$4,'https://example.com/bb390',6,10,50000,false) returning id`,
    [nen.branchId, nen.customerId, `Fixture BB-390 ${nen.runId} ${ten}`, `SEED_FOLDER_ID_BB390_${nen.runId}_${ten}`],
  );
  const id = g[0].id as string;
  const anh: string[] = [];
  // 3 vuông + 3 dọc — dữ liệu giả, không ảnh trẻ em thật.
  const kich = [
    [2000, 2000],
    [2000, 3000],
    [2000, 2000],
    [2000, 3000],
    [2000, 2000],
    [2000, 3000],
  ];
  for (let i = 0; i < kich.length; i++) {
    const { rows } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
       values ($1,$2,$3,'image/jpeg',$4,'active',$5,$6) returning id`,
      [id, `bb390fixture${nen.runId}${ten}${i}`, `BB390_${i + 1}.jpg`, i + 1, kich[i]![0], kich[i]![1]],
    );
    anh.push(rows[0].id as string);
  }
  for (const d of dongHang) {
    await pg.query(`insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,$3,0)`, [
      id,
      d.productId,
      d.qty,
    ]);
  }
  const maBaMe = randomBytes(32).toString("base64url");
  const { rows: l } = await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
     values ($1,$2,$3,'owner','active') returning id`,
    [id, sha256(maBaMe), maBaMe.slice(0, 6)],
  );
  const { rows: s } = await pg.query(
    `insert into selections (gallery_id, share_link_id, display_name, is_primary) values ($1,$2,$3,true) returning id`,
    [id, l[0].id, `Fixture BB-390 ${nen.runId} ${ten}`],
  );
  return { id, maBaMe, selectionId: s[0].id as string, anh };
}

test.describe("BB-390: album = sản phẩm in — chọn bìa (trong gói) và màn bán album", () => {
  test.describe.configure({ timeout: 240_000 });
  let pg: Client;
  let nen: NenFixture;
  let boA: Bo;
  let boB: Bo;
  let albumProductId = "";
  let coBangBia = false;

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    nen = await dungNenFixture(pg, "BB-390");

    // Album THẬT đang bán (chỉ đọc). Cuốn, không phải tờ ruột.
    const { rows: sp } = await pg.query(
      `select id from products where is_active and material ilike 'album%' order by list_price limit 1`,
    );
    if (!sp[0]) throw new Error("Cần ít nhất một sản phẩm album đang bán trong danh mục");
    albumProductId = sp[0].id;
    const { rows: chinh } = await pg.query(
      `select id from products where is_active and kind = 'edited_photo' limit 1`,
    );
    if (!chinh[0]) throw new Error("Cần một sản phẩm 'edited_photo' đang bán");

    boA = await dungBo(pg, nen, "A", [
      { productId: chinh[0].id, qty: 10 },
      { productId: albumProductId, qty: 1 },
    ]);
    boB = await dungBo(pg, nen, "B", [{ productId: chinh[0].id, qty: 10 }]);

    // Bộ A: ba mẹ đã thả tim 4 tấm (2 vuông, 2 dọc).
    for (const photoId of boA.anh.slice(0, 4)) {
      await pg.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`,
        [boA.selectionId, photoId, boA.id],
      );
    }
    const { rows: t } = await pg.query(`select to_regclass('public.album_covers') as t`);
    coBangBia = t[0]?.t !== null;
  });

  test.afterAll(async () => {
    try {
      await donNenFixture(pg, { galleryIds: [boA?.id, boB?.id], customerIds: [nen?.customerId], branchIds: [nen?.branchId] });
    } finally {
      await pg.end();
    }
  });

  test("1. Gói có album: Bean gợi ý bìa, ba mẹ chọn một tấm, đổi được tới khi chốt", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${boA.maBaMe}`);

    const buoc = page.getByTestId("buoc-chon-bia-album");
    await expect(buoc).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("nhan-bean-goi-y-bia").first()).toBeVisible();
    await expect(page.getByTestId("giai-thich-ruot-album")).toBeVisible();

    // Chỉ tấm đã thả tim (4), không quá 6.
    const o = buoc.getByTestId("o-goi-y-bia");
    await expect(o).toHaveCount(4);

    // Album trong gói không còn bị đòi "chọn ảnh vào cuốn".
    await expect(page.getByText("Chưa có tấm nào trong cuốn này")).toHaveCount(0);

    test.skip(!coBangBia, "Migration 0075 (album_covers) chưa áp — không lưu được bìa.");

    const luu1 = page.waitForResponse((r) => r.url().endsWith("/api/g/album-cover") && r.request().method() === "POST");
    await o.nth(0).click();
    expect((await luu1).status()).toBe(200);
    await expect(buoc.getByText("Đã chọn làm bìa")).toBeVisible();

    // Đổi bìa sang tấm khác.
    const luu2 = page.waitForResponse((r) => r.url().endsWith("/api/g/album-cover") && r.request().method() === "POST");
    await o.nth(1).click();
    expect((await luu2).status()).toBe(200);
    await expect(o.nth(1)).toHaveAttribute("aria-pressed", "true");

    const { rows } = await pg.query(
      `select si.photo_id from album_covers ac join selection_items si on si.id = ac.selection_item_id
        where ac.gallery_id = $1`,
      [boA.id],
    );
    expect(rows).toHaveLength(1);
  });

  test("2. Gói không có album: không có bước chọn bìa; tab Album là màn bán hàng, đặt không kèm ảnh", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${boB.maBaMe}`);
    // BB-391 — link CHỦ (owner): cửa hàng mở bằng nút túi "Mua thêm" ở thanh chọn của ba mẹ
    // (`thanh-chon.tsx`). Nhãn "Mua ảnh in, album in ảnh" là nút túi của thanh NGƯỜI XEM
    // (`thanh-dat-chinh-sua.tsx`) — bản viết mù của BB-390 nhầm hai thanh. Thanh ẩn khi bìa
    // còn chiếm màn (BB-358) nên cuộn tới lưới trước, như bb-279.
    await page.locator("#dau-luoi-anh").waitFor({ state: "attached", timeout: 120_000 });
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    const nutMuaThem = page.getByRole("button", { name: "Mua thêm" });
    await expect(nutMuaThem).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("buoc-chon-bia-album")).toHaveCount(0);

    await nutMuaThem.click();
    const hop = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
    await expect(hop).toBeVisible();
    await hop.getByRole("button", { name: "Album", exact: true }).click();

    const man = hop.getByTestId("man-ban-album");
    await expect(man).toBeVisible();
    // BB-398 — số ảnh THEO KHỔ (anh 08/10): ô đặc điểm là "25–30 ảnh" (20×20)… hoặc nói chung
    // "20–40 ảnh tuỳ khổ"; không còn "20–30 tấm ảnh" chung cho mọi khổ.
    await expect(man.getByTestId("ban-album-so-anh")).toHaveText(/^\d+–\d+ ảnh( tuỳ khổ)?$/);
    await expect(man.getByText("20–30 tấm ảnh", { exact: true })).toHaveCount(0);
    // Không lưới ảnh của bé, không bước "Chọn ảnh".
    await expect(man.locator('img[src^="/api/img/"]')).toHaveCount(0);
    await expect(hop.getByRole("button", { name: "Chọn ảnh", exact: true })).toHaveCount(0);

    const dat = page.waitForRequest((r) => r.url().endsWith("/api/g/addons") && r.method() !== "GET");
    const datXong = page.waitForResponse((r) => r.url().endsWith("/api/g/addons") && r.request().method() !== "GET");
    await man.getByTestId("nut-dat-album").click();
    const body = (await dat).postDataJSON() as { productId?: string; photoId?: string | null };
    expect(body.photoId ?? null).toBeNull();
    expect((await datXong).status()).toBe(200);
    await expect(man.getByTestId("ban-album-da-ghi-nhan")).toBeVisible();
  });
});
