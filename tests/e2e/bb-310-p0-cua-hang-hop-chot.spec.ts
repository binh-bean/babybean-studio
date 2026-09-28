/**
 * BB-310 mục 1 và 2 — hai lỗi P0 do người chấm độc lập vòng 4 tìm ra
 * (`6-vong4-khach-kho-tinh.md`, mục C #1 và #2):
 *
 *   Mục 1 — Cửa hàng: nút "Hoàn tác" bị khoá SUỐT lúc dòng "Đã thêm vào giỏ"
 *   hiện (đo 5,4 giây trên máy dev), rồi tự ẩn — không bấm được lần nào.
 *   Sửa: banner chỉ hiện SAU khi lưu xong (`await onMua`/`onMuaNhieu` trước
 *   khi `setThongBaoDaThem`), nên Hoàn tác bấm được NGAY khi vừa hiện.
 *
 *   Mục 2 — Hộp chốt: chữ "để sau cũng được, CSKH sẽ hỏi lại" (dành cho sản
 *   phẩm thiếu ảnh) đứng cạnh nút khoá "Chọn bìa album để xác nhận" (dành
 *   cho bìa album, BẮT BUỘC) — đọc như cả hai đều để sau được. Sửa: đổi chữ
 *   rõ ràng ("Chọn một tấm làm bìa cuốn album để xác nhận"), và chọn bìa
 *   xong mở lại hộp chốt phải hết khoá NGAY (cập nhật lạc quan, không chờ
 *   tải lại toàn bộ — đo 3,8–7,6 giây trước bản vá).
 *
 * Kiểm ngược (AGENTS.md §5a): `git stash` đúng `src/components/features/
 * gallery/cua-hang.tsx` rồi chạy lại ca "Hoàn tác" — đỏ (nút vẫn khoá đúng
 * lúc banner hiện). Tương tự `git stash` đúng `gallery-app.tsx` cho ca
 * "chọn bìa xong hết khoá ngay" — đỏ (còn thấy chữ khoá cũ). Kết quả dán ở
 * bàn giao BB-310, không lặp lại ở đây.
 *
 * Dữ liệu: chỉ tạo "Fixture BB-310 …", xoá sạch ở afterAll. Danh mục sản
 * phẩm (`products`) dùng dữ liệu THẬT sẵn có trong bb-dev (không bịa giá) —
 * thiếu sản phẩm đủ điều kiện thì ca đó tự `test.skip`, không giả vờ xanh.
 *
 * Bé của fixture CHỈ có họ tên đầy đủ, KHÔNG có nickname (254/258 bé thật
 * trên bb-dev đúng vậy — báo cáo chấm mục 7) — tiện thể làm bằng chứng
 * cho BB-310 mục 6/7 (bìa không in họ tên đầy đủ cỡ chữ lớn).
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = () => `0905${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-310 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const THU_MUC_ANH = "test-results/bb-310";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });
const CHUP = "C:\\Users\\binh\\Downloads\\claude code\\babybean-assets\\BB-310\\chup";
fs.mkdirSync(CHUP, { recursive: true });

const DIEN_THOAI = { width: 390, height: 844 };
const MAY_TINH = { width: 1440, height: 900 };

interface BoCuc {
  galleryId: string;
  customerId: string;
  babyId: string;
  maLink: string;
  albumProductId: string;
  albumGalleryItemId: string;
}

async function dungFixture(pg: Client): Promise<BoCuc> {
  await pg.query(`delete from galleries where title like 'Fixture BB-310%' and created_at < now() - interval '6 hours'`);
  await pg.query(`delete from customers where full_name like 'Fixture BB-310%' and created_at < now() - interval '6 hours'`);

  const { rows: br } = await pg.query("select id from branches order by name limit 1");
  const branchId = br[0].id;

  const { rows: kh } = await pg.query(
    `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
    [branchId, `${NHAN} Khách`, soGia()],
  );
  const customerId = kh[0].id;

  // Mục 6/7 — CHỈ họ tên đầy đủ, KHÔNG nickname (đúng 254/258 bé thật).
  const { rows: be } = await pg.query(
    `insert into babies (customer_id, full_name) values ($1,$2) returning id`,
    [customerId, "Nguyễn Minh An"],
  );
  const babyId = be[0].id;

  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, baby_id, title, status, drive_folder_id,
                            drive_folder_url, photo_count, included_quota, extra_photo_price)
     values ($1,$2,$3,$4,'ready',$5,'https://example.com/x',6,10,20000) returning id`,
    [branchId, customerId, babyId, NHAN, `fixture-bb310-${runId}`],
  );
  const galleryId = g[0].id;

  for (let i = 1; i <= 6; i++) {
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,$3,'image/jpeg',$4,'active')`,
      [galleryId, `bb310-${runId}-${i}`, `BB310_${String(i).padStart(3, "0")}.jpg`, i],
    );
  }

  // Album trong gói (BB-202) + dòng "ảnh chỉnh sửa" cạnh nó (thiếu thì hạn
  // mức "chưa biết" và app chặn thả tim — Opus soát BB-202).
  const { rows: sp } = await pg.query(
    `select id from products
      where is_active and material ilike '%album%' and list_price is not null
        and price_confidence >= 0.8 and price_samples >= 5
      limit 1`,
  );
  const albumProductId = sp[0]?.id ?? "";
  let albumGalleryItemId = "";
  if (albumProductId) {
    const { rows: gi } = await pg.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
       values ($1,$2,1,500000) returning id`,
      [galleryId, albumProductId],
    );
    albumGalleryItemId = gi[0].id;
    await pg.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
       select $1, id, 10, 0 from products
        where is_active and kind = 'edited_photo' order by id limit 1`,
      [galleryId],
    );
  }

  const maLink = randomBytes(32).toString("base64url");
  await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'owner',$4,'active')`,
    [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
  );

  return { galleryId, customerId, babyId, maLink, albumProductId, albumGalleryItemId };
}

async function xoaFixture(pg: Client, bc: BoCuc) {
  if (!bc.galleryId) return;
  await pg.query("delete from selection_addons where selection_id in (select id from selections where gallery_id=$1)", [bc.galleryId]);
  await pg.query("delete from album_covers where gallery_id = $1", [bc.galleryId]).catch(() => {});
  await pg.query("delete from selection_items where gallery_id = $1", [bc.galleryId]).catch(() => {});
  await pg.query("delete from selections where gallery_id = $1", [bc.galleryId]);
  await pg.query("delete from gallery_items where gallery_id = $1", [bc.galleryId]);
  await pg.query("delete from share_links where gallery_id = $1", [bc.galleryId]);
  await pg.query("delete from activity_logs where entity_id = $1", [bc.galleryId]);
  await pg.query("delete from photos where gallery_id = $1", [bc.galleryId]);
  await pg.query("delete from galleries where id = $1", [bc.galleryId]);
  if (bc.babyId) await pg.query("delete from babies where id = $1", [bc.babyId]);
  if (bc.customerId) await pg.query("delete from customers where id = $1", [bc.customerId]);
}

ownIpTest.describe("BB-310 mục 1: Cửa hàng — Hoàn tác bấm được ngay sau khi thêm", () => {
  let pg: Client;
  let bc: BoCuc;

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    bc = await dungFixture(pg);
  });

  ownIpTest.afterAll(async () => {
    await xoaFixture(pg, bc);
    await pg.end();
  });

  for (const [ten, khoBiet] of [
    ["điện thoại", DIEN_THOAI],
    ["máy tính", MAY_TINH],
  ] as const) {
    ownIpTest(`${ten}: Hoàn tác enabled ngay khi banner hiện, bấm được, món biến khỏi giỏ`, async ({ page }) => {
      ownIpTest.skip(!bc.albumProductId, "bb-dev hiện không có sản phẩm album nào đủ điều kiện bán.");
      ownIpTest.setTimeout(60_000);

      await page.setViewportSize(khoBiet);
      await page.goto(`/g/${bc.maLink}`);
      await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));

      await page.getByRole("button", { name: /Mua thêm/i }).first().click();
      const cuaHang = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
      await cuaHang.waitFor({ state: "visible" });
      await cuaHang.getByRole("button", { name: "Album", exact: true }).click();

      const nutThem = cuaHang.getByRole("button", { name: "Thêm vào giỏ" });
      await nutThem.click();

      const banner = cuaHang.getByRole("status");
      await ownIpExpect(banner).toBeVisible();
      await ownIpExpect(banner).toContainText("Đã thêm vào giỏ");

      const nutHoanTac = banner.getByRole("button", { name: "Hoàn tác" });
      await ownIpExpect(nutHoanTac).toBeVisible();
      // Mục 1 — đúng lúc banner VỪA hiện, nút phải BẤM ĐƯỢC ngay (không
      // `disabled`), không phải khoá suốt 6 giây nó hiện rồi tự ẩn.
      await ownIpExpect(nutHoanTac, "Hoàn tác bị khoá ngay lúc banner vừa hiện — đúng lỗi báo cáo mục 1").toBeEnabled();

      await page.screenshot({ path: `${THU_MUC_ANH}/1-${ten}-hoan-tac-enabled.png` });
      await page.screenshot({ path: `${CHUP}/1-${ten}-hoan-tac-enabled.png` });

      await nutHoanTac.click();

      // Banner tự đóng sau khi hoàn tác, và món vừa thêm biến khỏi giỏ THẬT
      // trong cơ sở dữ liệu (không chỉ khỏi màn hình).
      await ownIpExpect(banner).toHaveCount(0);
      await ownIpExpect
        .poll(
          async () => {
            const { rows } = await pg.query(
              `select coalesce(sum(sa.quantity),0)::int n from selection_addons sa
                 join selections s on s.id = sa.selection_id
                 join products p on p.id = sa.product_id
                where s.gallery_id = $1 and p.id = $2`,
              [bc.galleryId, bc.albumProductId],
            );
            return rows[0]?.n ?? -1;
          },
          { timeout: 15_000, message: "Hoàn tác không xoá được món vừa thêm trong cơ sở dữ liệu" },
        )
        .toBe(0);

      await page.screenshot({ path: `${THU_MUC_ANH}/1b-${ten}-sau-hoan-tac.png` });
      await page.screenshot({ path: `${CHUP}/1b-${ten}-sau-hoan-tac.png` });
    });
  }
});

ownIpTest.describe("BB-310 mục 2: Hộp chốt — chữ khớp luật, chọn bìa xong hết khoá ngay", () => {
  let pg: Client;
  let bc: BoCuc;

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    bc = await dungFixture(pg);
  });

  ownIpTest.afterAll(async () => {
    await xoaFixture(pg, bc);
    await pg.end();
  });

  ownIpTest("chữ khoá đúng luật (bìa album bắt buộc), chọn bìa xong hộp chốt hết khoá không cần tải lại", async ({ page }) => {
    ownIpTest.skip(!bc.albumProductId, "bb-dev hiện không có sản phẩm album nào đủ điều kiện bán.");
    ownIpTest.setTimeout(60_000);

    await page.setViewportSize(MAY_TINH);
    await page.goto(`/g/${bc.maLink}`);

    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: 20_000 });

    // Thả tim 3 tấm — quota đã có (dòng edited_photo trong fixture).
    const nutChon = page.locator('button[aria-label="Chọn ảnh này"]');
    const dem = page.getByTestId("dem-da-chon");
    for (let i = 0; i < 3; i++) {
      await nutChon.nth(i).click();
      await ownIpExpect(dem).toHaveText(String(i + 1), { timeout: 10_000 });
    }

    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await page.fill("#confirm-name-input", "Ba mẹ Fixture 310");
    await page.getByRole("checkbox").setChecked(true, { force: true });

    // Mục 2 — chữ nhắc bìa album phải RÕ RÀNG là bắt buộc, không đứng lẫn
    // với chữ "để sau cũng được" của mục sản phẩm thiếu ảnh (khác nhau).
    // Chữ này lặp lại đúng nguyên văn ở CẢ khối nhắc lẫn dòng lý do khoá nút
    // (cố ý, để nhất quán) — `.first()` để không vỡ strict mode.
    await ownIpExpect(page.getByText("Chọn một tấm làm bìa cuốn album để xác nhận").first()).toBeVisible();
    await ownIpExpect(page.getByRole("button", { name: "Xác nhận" })).toBeDisabled();
    await ownIpExpect(page.getByTestId("ly-do-khoa-nut-chot")).toHaveText(
      "Chọn một tấm làm bìa cuốn album để xác nhận",
    );

    await page.screenshot({ path: `${THU_MUC_ANH}/2-hop-chot-khoa.png` });
    await page.screenshot({ path: `${CHUP}/2-hop-chot-khoa.png` });

    await page.getByTestId("nut-chon-bia-ngay").click();
    const nutBia = page.locator('button[aria-label^="Chọn ảnh bìa"]').first();
    await nutBia.waitFor({ state: "visible", timeout: 10_000 });
    await nutBia.click();
    await ownIpExpect(page.getByText("Đã chọn làm bìa")).toBeVisible();

    // Mở lại hộp chốt NGAY — mục 2 đòi hộp chốt đọc trạng thái bìa LẠC QUAN
    // (không chờ tải lại toàn bộ, đo 3,8–7,6 giây trước bản vá).
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await page.fill("#confirm-name-input", "Ba mẹ Fixture 310");
    await page.getByRole("checkbox").setChecked(true, { force: true });

    await ownIpExpect(
      page.getByText("Chọn một tấm làm bìa cuốn album để xác nhận"),
      "Hộp chốt vẫn khoá ngay sau khi chọn bìa — đúng lỗi báo cáo mục 2 (3,8–7,6 giây)",
    ).toHaveCount(0);
    await ownIpExpect(page.getByRole("button", { name: "Xác nhận" })).toBeEnabled();

    await page.screenshot({ path: `${THU_MUC_ANH}/2b-hop-chot-het-khoa-ngay.png` });
    await page.screenshot({ path: `${CHUP}/2b-hop-chot-het-khoa-ngay.png` });

    await page.getByRole("button", { name: "Xác nhận" }).click();
    await ownIpExpect
      .poll(
        async () => {
          const { rows } = await pg.query("select status::text s from galleries where id=$1", [bc.galleryId]);
          return rows[0]?.s;
        },
        { timeout: 15_000 },
      )
      .toBe("submitted");
  });
});
