/**
 * BB-405 — màn khách: (A) tên bộ dời khỏi dưới logo, đứng NGAY DƯỚI "Album gia đình";
 * (B) "Xem trong nhà" ngay trên TỪNG Ô ẢNH (như nút tim) ở mọi màn, mở trình xem chung
 * có hai lựa chọn "Trên tường" | "Album trên bàn".
 *
 * VIẾT, CHƯA CHẠY (luật: không chạy gì chạm bb-dev từ agent). Giám đốc chạy:
 *
 *   MOCK_DRIVE_TRE=1 PW_PORT=3181 npx playwright test tests/e2e/bb-405-xem-trong-nha.spec.ts --workers=1
 *
 * Nền dữ liệu:
 *   - (A) `taoBb334b` (link gia đình /k/<mã>, hai bộ) — dọn bằng `donBb334b`.
 *   - (B) `dungNenFixture` (chi nhánh + khách "Fixture BB-405 …" RIÊNG), dọn theo id ở
 *     afterAll bằng `donNenFixture` (AGENTS §6). Không bắn Lark thật.
 *
 * Ca:
 *   A1. Điện thoại 390: logo đứng một mình; "← Album gia đình" rồi NGAY DƯỚI là tên bộ; bấm
 *       tên bộ vẫn mở tấm chuyển bộ.
 *   A2. Máy tính 1440: cùng khối ở cột trái; tên bộ dưới "Album gia đình", không dưới logo.
 *   B1. Đợt 1 (ba mẹ, 390): mỗi ô có nút "Xem trong nhà" (góc dưới trái, ≥32px, không đè
 *       tim); bấm ở tấm CHƯA thả tim → màn xem chung; chuyển "Album trên bàn" ↔ "Trên
 *       tường"; Đóng là đóng cả.
 *   B2. Người gợi ý: nút trên ô; album KHÔNG có nút "Đặt album" (không tự trả tiền).
 *   B3. Gia đình được mời: nút trên ô; mở được màn xem chung.
 *   B4. Đợt 2 (ba mẹ, màn "Chọn thêm ảnh"): nút trên ô.
 *   B5. Bộ đã giao: nút trên ô vẫn có (xem không đòi đã chọn).
 *   B6. Màn xem lớn: nút đầu màn là ngôi nhà "Trong nhà", mở CÙNG màn xem chung.
 */

import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { taoBb334b, donBb334b, type DuLieuBb334b } from "../fixtures/bb-334b";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const DT = { width: 390, height: 844 };
const MT = { width: 1440, height: 900 };
const NUT_O = "nut-xem-trong-nha";
/**
 * PHẢI khớp `CAO_DAU_TRANG_DIEN_THOAI` / `CAO_DAU_TRANG_MAY_TINH` ở
 * `src/components/features/admin/bia-bo-anh-editor.tsx` (khung xem trước bìa quản trị dựng
 * đầu trang cao đúng chừng này). Đỏ ở đây = sửa hằng bên đó theo số đo in ra.
 */
const CAO_DAU_TRANG = { "dien-thoai": 140, "may-tinh": 84 } as const;

async function choLuoi(page: Page) {
  await page.locator("#dau-luoi-anh").first().waitFor({ state: "attached", timeout: 60_000 });
  await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 60_000 });
}

/** Mọi thẻ ảnh đang dựng đều có đúng một nút "Xem trong nhà". */
async function moiOCoNut(page: Page, goc = page.locator("body")) {
  const the = goc.getByTestId("the-anh");
  const n = await the.count();
  expect(n).toBeGreaterThan(0);
  await expect(goc.getByTestId(NUT_O)).toHaveCount(n);
}

/** Nút trên ô: vùng chạm ≥ 32px, góc dưới TRÁI của ô, không giao nút tim. */
async function kiemViTriNut(page: Page) {
  const o = page.getByTestId("the-anh").first();
  await o.scrollIntoViewIfNeeded();
  const hopO = await o.locator("div").first().boundingBox();
  const hopNut = await o.getByTestId(NUT_O).boundingBox();
  const tim = o.getByRole("button", { name: /^(Chọn ảnh này|Bỏ chọn)$/ });
  const hopTim = (await tim.count()) > 0 ? await tim.first().boundingBox() : null;
  expect(hopO && hopNut).toBeTruthy();
  expect(hopNut!.width).toBeGreaterThanOrEqual(32);
  expect(hopNut!.height).toBeGreaterThanOrEqual(32);
  expect(hopNut!.x - hopO!.x).toBeLessThanOrEqual(2);
  expect(hopO!.y + hopO!.height - (hopNut!.y + hopNut!.height)).toBeLessThanOrEqual(2);
  if (hopTim) expect(hopNut!.x + hopNut!.width).toBeLessThanOrEqual(hopTim.x);
}

// ---------------------------------------------------------------------------
// (A) Đầu trang
// ---------------------------------------------------------------------------

test.describe.serial("BB-405 (A): tên bộ ngay dưới 'Album gia đình'", () => {
  let d: DuLieuBb334b;
  test.beforeAll(async () => {
    d = await taoBb334b();
  });
  test.afterAll(async () => {
    if (d) await donBb334b(d);
  });

  for (const [ten, kt] of [
    ["dien-thoai", DT],
    ["may-tinh", MT],
  ] as const) {
    test(`A — ${ten}: logo một mình; tên bộ dưới "Album gia đình"`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(kt);
      await chanLh3TrenTrinhDuyet(page);
      await page.goto(`/k/${d.giaDinhA.ma}/2`);
      await choLuoi(page);

      const thanh = page.getByTestId("thanh-thuong-hieu");
      const logo = thanh.getByTestId("ten-thuong-hieu");
      const ve = thanh.getByTestId("nut-ve-gia-dinh");
      const tenBo = thanh.getByTestId("nut-doi-buoi-chup");
      await expect(ve).toBeVisible();
      await expect(ve).toContainText("Album gia đình");
      await expect(ve).toHaveAttribute("href", `/k/${d.giaDinhA.ma}`);
      await expect(tenBo).toBeVisible();

      const hLogo = (await logo.boundingBox())!;
      const hVe = (await ve.boundingBox())!;
      const hTen = (await tenBo.boundingBox())!;
      // Tên bộ đứng NGAY DƯỚI "Album gia đình": cùng mép trái (± lề nút), sát bên dưới.
      expect(hTen.y).toBeGreaterThanOrEqual(hVe.y + hVe.height - 2);
      expect(hTen.y - (hVe.y + hVe.height)).toBeLessThanOrEqual(12);
      expect(Math.abs(hTen.x + 8 - hVe.x)).toBeLessThanOrEqual(14);
      // Không còn nằm dưới logo: không giao bề ngang cụm logo (máy tính) / ở hàng riêng dưới logo (điện thoại).
      if (ten === "may-tinh") {
        expect(hTen.x + hTen.width).toBeLessThanOrEqual(hLogo.x);
      } else {
        expect(hTen.x).toBeLessThan(hLogo.x);
      }
      // Logo vẫn căn giữa màn điện thoại (luật bb-278).
      if (ten === "dien-thoai") expect(Math.abs(hLogo.x + hLogo.width / 2 - DT.width / 2)).toBeLessThanOrEqual(4);

      // Vòng 2 — đo THẬT chiều cao thanh đầu trang (link gia đình), so với hằng khung xem trước.
      const hThanh = (await thanh.boundingBox())!;
      console.log(`[BB-405] cao thanh đầu trang ${ten}: ${hThanh.height.toFixed(1)}px (hằng ${CAO_DAU_TRANG[ten]})`);
      expect(
        Math.abs(hThanh.height - CAO_DAU_TRANG[ten]),
        `Thanh đầu trang ${ten} cao ${hThanh.height.toFixed(1)}px, hằng xem trước ${CAO_DAU_TRANG[ten]}px`,
      ).toBeLessThanOrEqual(4);

      // Chuyển bộ vẫn chạy.
      await tenBo.click();
      await expect(page.getByTestId("chuyen-bo-anh")).toBeVisible();
    });
  }
});

// ---------------------------------------------------------------------------
// (B) "Xem trong nhà" trên từng ô ảnh, mọi màn
// ---------------------------------------------------------------------------

test.describe.serial("BB-405 (B): Xem trong nhà trên từng ô ảnh", () => {
  let pg: Client;
  let nen: NenFixture | null = null;
  let coBang = false;
  const galleryIds: string[] = [];
  let maBaMeA = ""; // in_retouch — đợt 2
  let maBaMeB = ""; // in_review — đợt 1
  let maGoiYB = "";
  let maGiaDinhB = "";
  let maBaMeC = ""; // delivered

  async function taoBo(p: { ten: string; status: string; soAnh: number; daChon: number }) {
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price, download_enabled)
       values ($1,$2,$3,$4,$5,'https://example.com/bb405',$6,5,30000,false) returning id`,
      [nen!.branchId, nen!.customerId, `Fixture BB-405 ${nen!.runId} ${p.ten}`, p.status, `fixture-bb405-${nen!.runId}-${p.ten}`, p.soAnh],
    );
    const id = g[0].id as string;
    galleryIds.push(id);
    const anh: string[] = [];
    for (let i = 1; i <= p.soAnh; i++) {
      const { rows } = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, width, height, status)
         values ($1,$2,$3,'image/jpeg',$4,3000,2000,'active') returning id`,
        [id, `bb405-${nen!.runId}-${p.ten}-${i}`, `BB405${p.ten}_00${i}.jpg`, i],
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
    return { id, ma };
  }

  async function themLink(galleryId: string, role: "suggester" | "viewer") {
    const ma = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,$4,$5,'active')`,
      [galleryId, sha256(ma), ma.slice(0, 6), role, `Fixture BB-405 ${role}`],
    );
    return ma;
  }

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const { rows: kt } = await pg.query(`select to_regclass('public.selection_rounds') as bang`);
    coBang = kt[0]?.bang !== null;
    nen = await dungNenFixture(pg, "BB-405");
    maBaMeA = (await taoBo({ ten: "A", status: "in_retouch", soAnh: 6, daChon: 2 })).ma;
    const b = await taoBo({ ten: "B", status: "in_review", soAnh: 6, daChon: 1 });
    maBaMeB = b.ma;
    maGoiYB = await themLink(b.id, "suggester");
    maGiaDinhB = await themLink(b.id, "viewer");
    maBaMeC = (await taoBo({ ten: "C", status: "delivered", soAnh: 4, daChon: 2 })).ma;
  });

  test.afterAll(async () => {
    if (!pg) return;
    try {
      if (nen) {
        if (coBang) await pg.query(`delete from selection_rounds where gallery_id = any($1::uuid[])`, [galleryIds]);
        await donNenFixture(pg, { galleryIds, customerIds: [nen.customerId], branchIds: [nen.branchId] });
      }
    } finally {
      await pg.end();
    }
  });

  async function vao(page: Page, ma: string) {
    await page.setViewportSize(DT);
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${ma}`);
    await choLuoi(page);
  }

  test("B1. Đợt 1 (ba mẹ): nút trên mọi ô; mở màn chung; hai lựa chọn; Đóng là đóng cả", async ({ page }) => {
    test.setTimeout(120_000);
    await vao(page, maBaMeB);
    await moiOCoNut(page);
    await kiemViTriNut(page);

    // Tấm 3 CHƯA thả tim — vẫn xem được.
    await page.getByRole("button", { name: "Xem trong nhà — ảnh 3" }).evaluate((el) => (el as HTMLElement).click());
    const man = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
    await expect(man).toBeVisible();
    const chon = man.getByTestId("chon-cach-xem-trong-nha");
    await expect(chon.getByRole("radio", { name: "Trên tường" })).toHaveAttribute("aria-checked", "true");

    // Danh mục có cuốn album đang bán → chuyển sang "Album trên bàn".
    const nutBan = chon.getByRole("radio", { name: "Album trên bàn" });
    if (await nutBan.count()) {
      await nutBan.click();
      const album = page.getByTestId("xem-album-tren-ban");
      await expect(album).toBeVisible();
      await expect(album.getByRole("radio", { name: "Album trên bàn" })).toHaveAttribute("aria-checked", "true");
      await expect(album.getByTestId("cuon-album-tren-ban")).toBeVisible();
      // Vòng 2 — chỉ MỘT công tắc; bìa cuốn album tải được (không ảnh vỡ).
      await expect(page.getByTestId("chon-cach-xem-trong-nha")).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Ẩn bảng" })).toHaveCount(0);
      const bia = album.getByTestId("bia-cuon-album");
      await expect
        .poll(() => bia.evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0), {
          timeout: 15_000,
        })
        .toBe(true);
      // Quay lại "Trên tường".
      await album.getByRole("radio", { name: "Trên tường" }).click();
      await expect(album).toHaveCount(0);
      await expect(man).toBeVisible();
      // Đóng từ màn album là đóng cả lối.
      await chon.getByRole("radio", { name: "Album trên bàn" }).click();
      await page.getByTestId("xem-album-tren-ban").getByRole("button", { name: "Đóng" }).click();
      await expect(page.getByTestId("xem-album-tren-ban")).toHaveCount(0);
      await expect(man).toHaveCount(0);
    } else {
      await man.getByRole("button", { name: "Đóng" }).click();
      await expect(man).toHaveCount(0);
    }
  });

  test("B2. Người gợi ý: nút trên ô; album không có nút 'Đặt album' (không tự trả tiền)", async ({ page }) => {
    test.setTimeout(120_000);
    await vao(page, maGoiYB);
    await moiOCoNut(page);
    await page.getByRole("button", { name: "Xem trong nhà — ảnh 2" }).evaluate((el) => (el as HTMLElement).click());
    const man = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
    await expect(man).toBeVisible();
    const nutBan = man.getByTestId("chon-cach-xem-trong-nha").getByRole("radio", { name: "Album trên bàn" });
    if (await nutBan.count()) {
      await nutBan.click();
      await expect(page.getByTestId("xem-album-tren-ban")).toBeVisible();
      await expect(page.getByTestId("nut-dat-album-kho-nay")).toHaveCount(0);
      // Vòng 2 — lối của người gợi ý: "Gợi ý tấm này" (không trả tiền).
      await expect(page.getByTestId("nut-dat-loi-khac-album-tren-ban")).toContainText("Gợi ý tấm này");
      // Chỉ MỘT công tắc nhìn thấy (màn tường không chồng phía sau).
      await expect(page.getByTestId("chon-cach-xem-trong-nha")).toHaveCount(1);
    }
  });

  test("B3. Gia đình được mời: nút trên ô; mở được màn xem chung", async ({ page }) => {
    test.setTimeout(120_000);
    await vao(page, maGiaDinhB);
    await moiOCoNut(page);
    await page.getByRole("button", { name: "Xem trong nhà — ảnh 1" }).evaluate((el) => (el as HTMLElement).click());
    await expect(page.getByRole("dialog", { name: "Xem ảnh trên tường" })).toBeVisible();
  });

  test("B4. Đợt 2 (màn 'Chọn thêm ảnh'): nút trên mọi ô", async ({ page }) => {
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
    await moiOCoNut(page, man);
    await man.getByRole("button", { name: "Xem trong nhà — ảnh 4" }).evaluate((el) => (el as HTMLElement).click());
    await expect(page.getByRole("dialog", { name: "Xem ảnh trên tường" })).toBeVisible();
  });

  test("B5. Bộ đã giao: nút trên ô vẫn có", async ({ page }) => {
    test.setTimeout(120_000);
    await vao(page, maBaMeC);
    await moiOCoNut(page);
  });

  test("B6. Màn xem lớn: nút ngôi nhà 'Trong nhà' mở CÙNG màn xem chung", async ({ page }) => {
    test.setTimeout(120_000);
    await vao(page, maBaMeB);
    await page.getByRole("button", { name: "Xem ảnh 2", exact: true }).evaluate((el) => (el as HTMLElement).click());
    const nut = page.getByTestId("nut-xem-tuong");
    await expect(nut).toBeVisible();
    await expect(nut).toContainText("Trong nhà");
    await nut.click();
    const man = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
    await expect(man).toBeVisible();
    // Có cuốn album đang bán thì có hai lựa chọn — cùng công tắc với nút trên ô.
    const chon = man.getByTestId("chon-cach-xem-trong-nha");
    if (await chon.count()) await expect(chon.getByRole("radio")).toHaveCount(2);
  });
});
