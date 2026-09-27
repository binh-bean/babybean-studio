/**
 * BB-293 mục #1 (P0) — báo cáo chấm độc lập (`4-cham-lai-doc-lap.md` mục 3,
 * dòng #1): "Bấm tab 'Album' sau khi thêm giỏ → toàn trang thành 'Đang
 * tải…', hộp cửa hàng mất, trang cuộn về đầu." Gốc lỗi: `datSoLuongMuaThem`/
 * `datNhieuAnhMuaThem` (gallery-app.tsx) gọi `loadGallery()` KHÔNG kèm
 * `{ silent: true }` sau khi mua — `loading` bật lại xoá cả trang thành màn
 * "Đang tải…" toàn màn (nhánh `if (loading) return <p>Đang tải…</p>` đầu
 * file), đúng lỗi mà mục #24 (chọn ảnh bìa) đã vá trước đó cho một nơi gọi
 * khác — mục này vá NỐT hai nơi gọi còn lại.
 *
 * Thước đo AGENTS.md §5a: hoàn nguyên hai dòng `loadGallery({ silent: true })`
 * về `loadGallery()` (bỏ tham số) thì ca đầu phải đỏ (đã tự kiểm tay, xem
 * bàn giao BB-293), vá lại thì xanh.
 *
 * Dữ liệu: chỉ "Fixture BB-293 …" (AGENTS.md §6), dọn theo id ở afterAll.
 * Danh mục sản phẩm dùng dữ liệu THẬT sẵn có trong bb-dev (không tạo sản
 * phẩm giả) — cùng cách BB-279 e2e đã làm.
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = () => `0901${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-293 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const THU_MUC_ANH = "test-results/bb-293";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

interface BoCuc {
  galleryId: string;
  customerId: string;
  maLink: string;
  size1: string | null;
  unitPrice1: number;
  coNhomThuHai: boolean;
}

async function dungFixture(pg: Client): Promise<BoCuc> {
  await pg.query(
    `delete from galleries where title like 'Fixture BB-293%' and created_at < now() - interval '6 hours'`,
  );
  await pg.query(
    `delete from customers where full_name like 'Fixture BB-293%' and created_at < now() - interval '6 hours'`,
  );

  const { rows: br } = await pg.query("select id from branches order by name limit 1");
  const branchId = br[0].id;

  const { rows: kh } = await pg.query(
    `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
    [branchId, `${NHAN} Khách`, soGia()],
  );
  const customerId = kh[0].id;

  const soAnh = 3;
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                            drive_folder_url, photo_count, included_quota)
     values ($1,$2,$3,'ready',$4,'https://example.com/x',$5,10) returning id`,
    [branchId, customerId, NHAN, `fixture-bb293-${runId}`, soAnh],
  );
  const galleryId = g[0].id;

  for (let i = 1; i <= soAnh; i++) {
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,$3,'image/jpeg',$4,'active')`,
      [galleryId, `bb293-${runId}-${i}`, `BB293_${String(i).padStart(3, "0")}.jpg`, i],
    );
  }

  const maLink = randomBytes(32).toString("base64url");
  await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'owner',$4,'active')`,
    [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
  );

  const { rows: sp1 } = await pg.query(
    `select size, material, list_price from products
      where is_active and kind = 'print' and list_price is not null
        and price_confidence >= 0.8 and price_samples >= 5 and size is not null
      order by size limit 1`,
  );

  // Nhóm thứ hai (album HOẶC khung) — chỉ cần có hàng để tab đó hiện ra, giá
  // trị cụ thể không quan trọng cho ca này (chỉ bấm ĐỔI TAB, không mua).
  const { rows: nhomKhac } = await pg.query(
    `select 1 from products
      where is_active and list_price is not null and price_confidence >= 0.8 and price_samples >= 5
        and (material ilike 'khung%' or material ilike '%album%')
      limit 1`,
  );

  return {
    galleryId,
    customerId,
    maLink,
    size1: sp1[0]?.size ?? null,
    unitPrice1: sp1[0]?.list_price ? Number(sp1[0].list_price) : 0,
    coNhomThuHai: nhomKhac.length > 0,
  };
}

async function xoaFixture(pg: Client, bc: BoCuc) {
  if (!bc.galleryId) return;
  await pg.query("delete from selection_addons where selection_id in (select id from selections where gallery_id=$1)", [bc.galleryId]);
  await pg.query("delete from selection_items where gallery_id = $1", [bc.galleryId]);
  await pg.query("delete from selections where gallery_id = $1", [bc.galleryId]);
  await pg.query("delete from share_links where gallery_id = $1", [bc.galleryId]);
  await pg.query("delete from activity_logs where entity_id = $1", [bc.galleryId]);
  await pg.query("delete from photos where gallery_id = $1", [bc.galleryId]);
  await pg.query("delete from galleries where id = $1", [bc.galleryId]);
  if (bc.customerId) await pg.query("delete from customers where id = $1", [bc.customerId]);
}

ownIpTest.describe("BB-293 mục #1: đổi tab cửa hàng sau khi thêm giỏ không xoá cả trang", () => {
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

  ownIpTest("thêm vào giỏ rồi đổi tab: không có màn 'Đang tải…' toàn trang, hộp cửa hàng vẫn còn", async ({
    page,
  }) => {
    ownIpTest.setTimeout(60_000);
    if (!bc.size1 || bc.unitPrice1 <= 0) {
      ownIpTest.skip(true, "bb-dev hiện không có sản phẩm ảnh in đủ điều kiện bán — bỏ qua ca này.");
      return;
    }
    if (!bc.coNhomThuHai) {
      ownIpTest.skip(true, "bb-dev hiện chỉ có một nhóm sản phẩm đang bán — không có tab thứ hai để đổi.");
      return;
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${bc.maLink}`);
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));

    // Thả tim tấm đầu tiên, rồi THẬT SỰ thêm nó vào giỏ (nhóm "Ảnh in", tổ
    // hợp đầu tiên) — đúng thao tác báo cáo chấm mô tả ("sau khi thêm giỏ").
    const theAnh = page.getByTestId("the-anh");
    await theAnh.first().getByRole("button", { name: /Chọn ảnh này|Bỏ chọn/ }).click();

    await page.getByRole("button", { name: "Mua thêm" }).click();
    const cuaHang = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
    await cuaHang.waitFor({ state: "visible" });

    const tabDauTien = cuaHang.locator("nav button").first();
    const tabThuHai = cuaHang.locator("nav button").nth(1);
    await ownIpExpect(tabThuHai).toBeVisible();

    const tenTabDau = (await tabDauTien.textContent())?.trim();
    const tenTabHai = (await tabThuHai.textContent())?.trim();

    /**
     * `setLoading(true)` (nếu hoàn nguyên bản vá) chỉ bật SAU KHI request mua
     * hàng trả lời — một khoảng thời gian ngắn, dễ trôi qua giữa hai lần đọc
     * DOM rời rạc của Playwright. Gắn MutationObserver TRƯỚC hành động, ghi
     * lại nếu "Đang tải…" TỪNG xuất hiện bất cứ lúc nào trong lúc thao tác —
     * không phụ thuộc đúng thời điểm kiểm tra.
     */
    // `data-testid="man-dang-tai-toan-trang"` — ĐÚNG màn "Đang tải…" toàn
    // trang (gallery-app.tsx, nhánh `if (loading) return …`), khác các chữ
    // "Đang tải…" cục bộ khác (chuông thông báo…) không liên quan tới lỗi này.
    await page.evaluate(() => {
      (window as unknown as { __bb293ThayDangTai?: boolean }).__bb293ThayDangTai = false;
      const quanSat = new MutationObserver(() => {
        if (document.querySelector('[data-testid="man-dang-tai-toan-trang"]')) {
          (window as unknown as { __bb293ThayDangTai?: boolean }).__bb293ThayDangTai = true;
        }
      });
      quanSat.observe(document.body, { childList: true, subtree: true });
      (window as unknown as { __bb293QuanSat?: MutationObserver }).__bb293QuanSat = quanSat;
    });

    // Tab mặc định là nhóm đầu ("Ảnh in") — chọn ảnh cho tổ hợp mặc định rồi
    // xác nhận, tạo MỘT dòng giỏ thật.
    await cuaHang.getByRole("button", { name: "Chọn ảnh", exact: true }).click();
    const luoiChon = page.getByRole("dialog", { name: "Chọn ảnh để đặt in" });
    await luoiChon.waitFor({ state: "visible" });
    await luoiChon.locator("button:has(img)").first().click();
    await luoiChon.getByRole("button", { name: "Xong", exact: true }).click();
    await luoiChon.waitFor({ state: "hidden" });

    await ownIpExpect
      .poll(async () => cuaHang.locator("footer li").count(), {
        message: "Chưa thấy dòng giỏ sau khi thêm vào giỏ",
      })
      .toBeGreaterThan(0);

    // Đọc lại cờ quan sát — phải là false SUỐT quá trình mua hàng vừa rồi,
    // đây chính là hành động mà báo cáo chấm mô tả ("sau khi thêm giỏ").
    const tungThayDangTaiLucMua = await page.evaluate(
      () => (window as unknown as { __bb293ThayDangTai?: boolean }).__bb293ThayDangTai ?? false,
    );
    ownIpExpect(
      tungThayDangTaiLucMua,
      "trang từng hiện 'Đang tải…' toàn màn ngay sau khi thêm vào giỏ",
    ).toBe(false);

    const scrollYTruoc = await page.evaluate(() => window.scrollY);

    // Đổi tab NHIỀU LẦN liên tiếp — đúng thao tác báo cáo chấm mô tả ("bấm
    // tab Album") — mỗi lần đổi phải KHÔNG bao giờ thấy "Đang tải…" toàn
    // trang (nhánh render đầu `gallery-app.tsx`: `if (loading) return
    // <p>{vi.common.loading}</p>` xoá MỌI THỨ, kể cả chính hộp thoại này).
    for (let i = 0; i < 4; i++) {
      await (i % 2 === 0 ? tabThuHai : tabDauTien).click();
      // Không chờ — kiểm NGAY sau click, vì spinner toàn trang (nếu hoàn
      // nguyên bản vá) xuất hiện tức thì lúc `setLoading(true)` chạy, không
      // phải sau một debounce.
      await ownIpExpect(page.locator('[data-testid="man-dang-tai-toan-trang"]')).toHaveCount(0);
      await ownIpExpect(cuaHang).toBeVisible();
    }

    // Hộp thoại và cả hai tab vẫn còn nguyên — bằng chứng KHÔNG remount toàn
    // trang ở bất kỳ lượt đổi tab nào.
    await ownIpExpect(cuaHang.getByRole("heading", { name: "Mua thêm sản phẩm" })).toBeVisible();
    if (tenTabDau) await ownIpExpect(cuaHang.getByRole("button", { name: tenTabDau, exact: true })).toBeVisible();
    if (tenTabHai) await ownIpExpect(cuaHang.getByRole("button", { name: tenTabHai, exact: true })).toBeVisible();

    // Trang không bị cuộn về đầu — báo cáo chấm: "...rồi cuộn về đầu trang".
    const scrollYSau = await page.evaluate(() => window.scrollY);
    ownIpExpect(Math.abs(scrollYSau - scrollYTruoc), "trang bị cuộn về đầu sau khi đổi tab").toBeLessThan(30);

    // Giỏ hàng vẫn còn dòng vừa thêm — "cập nhật tại chỗ", không mất khi đổi tab.
    await ownIpExpect
      .poll(async () => cuaHang.locator("footer li").count(), {
        message: "Dòng giỏ biến mất sau khi đổi tab",
      })
      .toBeGreaterThan(0);

    await page.screenshot({ path: `${THU_MUC_ANH}/1-doi-tab-khong-xoa-trang.png` });
  });
});
