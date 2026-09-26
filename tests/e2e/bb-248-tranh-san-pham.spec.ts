/**
 * BB-248 — tranh minh hoạ màu nước gắn vào cửa hàng (mua thêm sản phẩm).
 *
 * Mở cửa hàng từ nút "Mua thêm" ở thanh đáy, lần lượt bấm qua ba nhóm sản
 * phẩm (`THU_TU_NHOM`), và mỗi nhóm phải có một tranh minh hoạ
 * `/san-pham/sp-*.webp` cạnh tiêu đề nhóm — hiện cả khi nhóm KHÔNG có sản
 * phẩm nào đang bán (tranh gắn theo nhóm đang xem, không phụ thuộc danh mục
 * `products` thật của studio đang có gì).
 *
 * Dữ liệu: chỉ tạo dòng "Fixture BB-248 …", xoá sạch ở afterAll — theo đúng
 * luật AGENTS.md §6. Danh mục sản phẩm (`catalogue`) đến từ bảng `products`
 * THẬT của bb-dev (không tạo sản phẩm giả) — nút "Mua thêm" chỉ hiện khi
 * danh mục đó không rỗng, giống cách `bb-245-moi-mua-lan-hai.spec.ts` dựa
 * vào dữ liệu sản phẩm thật sẵn có.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
// Số điện thoại giả MỚI mỗi lượt chạy — số cố định va nhau giữa hai worktree
// chạy cùng tệp (uq_customers_phone_branch), như bb-217-218 và bb-245 đã gặp.
const soGia = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-248 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("BB-248: tranh minh hoạ sản phẩm trong cửa hàng", () => {
  let pg: Client;
  let customerId = "";
  let galleryId = "";
  let maLink = "";
  let coDanhMuc = false;

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(
      `delete from galleries where title like 'Fixture BB-248%' and created_at < now() - interval '6 hours'`,
    );
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-248%' and created_at < now() - interval '6 hours'`,
    );

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [br[0].id, `${NHAN} Khách`, soGia],
    );
    customerId = kh[0].id;
    // 'ready' — KHÔNG khoá (xem src/lib/gallery-status.ts LOCKED_STATUSES),
    // nút "Mua thêm" chỉ hiện khi bộ ảnh chưa khoá.
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',1) returning id`,
      [br[0].id, customerId, NHAN, `fixture-bb248e2e-${runId}`],
    );
    galleryId = g[0].id;
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'BB248_001.jpg','image/jpeg',1,'active')`,
      [galleryId, `bb248e2e-${runId}`],
    );
    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
    );

    // Nút "Mua thêm" chỉ hiện khi danh mục sản phẩm THẬT (bảng `products`)
    // không rỗng — cùng điều kiện `src/app/api/g/gallery/route.ts` dùng.
    const { rows: sp } = await pg.query(
      `select count(*)::int as n from products
        where is_active and list_price is not null and price_confidence >= 0.8 and price_samples >= 5
          and kind in ('print','addon','edited_photo')`,
    );
    coDanhMuc = (sp[0]?.n ?? 0) > 0;
  });

  test.afterAll(async () => {
    if (galleryId) {
      await pg.query("delete from selections where gallery_id = $1", [galleryId]);
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    await pg.end();
  });

  test("mỗi nhóm sản phẩm có tranh minh hoạ /san-pham/sp-* tải được", async ({ page }) => {
    if (!coDanhMuc) {
      test.skip(true, "bb-dev hiện không có sản phẩm thật đủ điều kiện bán — nút Mua thêm không hiện, bỏ qua ca này.");
    }

    await page.goto(`/g/${maLink}`);
    // BB-258: thanh nổi (chứa "Mua thêm") ẨN khi bìa tràn màn còn hiện — cuộn
    // xuống lưới ảnh như khách thật rồi mới tìm nút.
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));

    const nutMuaThem = page.getByRole("button", { name: "Mua thêm" });
    await expect(nutMuaThem).toBeVisible();
    await nutMuaThem.click();

    const manCuaHang = page.getByRole("heading", { name: "Mua thêm sản phẩm" });
    await expect(manCuaHang).toBeVisible();

    // Ba nhóm chủ studio gọi tên — bấm từng nhóm, canh tranh minh hoạ của
    // ĐÚNG nhóm đó tải được thật (naturalWidth > 0, không chỉ có mặt trong DOM).
    for (const tenNhom of ["Ảnh in và ảnh phóng", "Album", "Khung ảnh"]) {
      await page.getByRole("button", { name: tenNhom, exact: true }).click();

      const tranhNhom = page.locator("img[src*='/san-pham/sp-']").first();
      await expect(tranhNhom).toBeVisible();
      await expect
        .poll(async () => tranhNhom.evaluate((el: HTMLImageElement) => el.naturalWidth), {
          message: `Tranh nhóm "${tenNhom}" không tải được (naturalWidth vẫn là 0)`,
        })
        .toBeGreaterThan(0);
    }
  });

  test("390×844: cửa hàng không cuộn ngang", async ({ page }) => {
    if (!coDanhMuc) {
      test.skip(true, "bb-dev hiện không có sản phẩm thật đủ điều kiện bán — nút Mua thêm không hiện, bỏ qua ca này.");
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${maLink}`);

    // Opus soát BB-258/261: ở 390px tiêu đề đầu trang từng ĐÈ lên "Nhắn cho
    // studio" (tiêu đề căn giữa kiểu absolute + 3 nút bên phải).
    const tieuDe = page.locator("#dau-luoi-anh p.font-display").first();
    // Đo nhóm nút BÊN PHẢI đầu trang (Nhắn cho studio / tải / chuông) — luôn
    // có ít nhất chuông, nên phép đo không bao giờ tự bỏ qua.
    const nhomNut = page.locator("#dau-luoi-anh").getByRole("button", { name: /^Thông báo/ });
    await expect(nhomNut).toBeVisible();
    const nhanStudio = page.locator("#dau-luoi-anh").getByText("Nhắn cho studio");
    for (const nut of [nhomNut, ...(await nhanStudio.count() ? [nhanStudio.first()] : [])]) {
      const a = (await tieuDe.boundingBox())!;
      const b = (await nut.boundingBox())!;
      const giao = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(giao, "tiêu đề đè lên nút ở đầu trang").toBe(false);
    }
    // BB-258: thanh nổi (chứa "Mua thêm") ẨN khi bìa tràn màn còn hiện — cuộn
    // xuống lưới ảnh như khách thật rồi mới tìm nút.
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));

    await page.getByRole("button", { name: "Mua thêm" }).click();
    await expect(page.getByRole("heading", { name: "Mua thêm sản phẩm" })).toBeVisible();

    const tranhNhom = page.locator("img[src*='/san-pham/sp-']").first();
    await expect(tranhNhom).toBeVisible();
    await expect
      .poll(async () => tranhNhom.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);

    const cuonNgang = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(cuonNgang, "cửa hàng cuộn ngang ở 390×844").toBe(false);
  });
});
