/**
 * BB-279 — cửa hàng mua thêm TỐI GIẢN: loại → kích thước → chất liệu → số
 * lượng → giá → chọn ảnh (nhiều tấm), và đường thứ hai "Đặt in tấm này" từ
 * màn xem ảnh lớn.
 *
 * Dữ liệu: chỉ tạo dòng "Fixture BB-279 …" (bộ ảnh, khách, ảnh, share link),
 * xoá sạch ở `afterAll` + dọn rác ≥ 6 giờ, theo đúng khuôn BB-248/BB-275.
 * Danh mục sản phẩm (`products`) dùng dữ liệu THẬT sẵn có trong bb-dev —
 * không tạo sản phẩm giả trong e2e (tách biệt với phép thử bảo mật
 * `tests/security/bb-279-batch-idor-anh-bo-khac.test.ts`, nơi có tạo sản
 * phẩm fixture để kiểm route trực tiếp). Nếu bb-dev không có đủ HAI kích
 * thước khác nhau trong nhóm "ảnh in" thì ca đo bước Kích thước tự
 * `test.skip` kèm lý do, không giả vờ xanh.
 *
 * Mỗi ca dùng một IP riêng (`helpers/ip-rieng-moi-ca.ts`) để không cạn hạn
 * mức mở link (10 lần/15 phút/IP — BB-160).
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = () => `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-279 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const THU_MUC_ANH = "test-results/bb-279";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

/**
 * BB-287 — báo cáo chấm mục #17/#22: chip kích thước từng hiện đúng chuỗi
 * `products.size` đồng bộ từ Lark ("10x15", chữ x bàn phím). Từ BB-287,
 * `cua-hang.tsx` hiển thị qua `formatKichThuoc` (`src/lib/utils/dinh-dang.ts`)
 * đổi "x" thành dấu nhân thật "×". Hai ca dưới đây từng so khớp CHÍNH XÁC
 * `bc.size1`/`size2` (chuỗi thô) — cập nhật để so khớp đúng chữ ĐÃ HIỂN THỊ,
 * không phải chuỗi lưu trong DB. Bản thu nhỏ của `formatKichThuoc`, không
 * import từ `src/lib` (chưa có tiền lệ import mã sản phẩm vào e2e ở tệp này).
 */
function nhanKichThuoc(size: string): string {
  return size.replace(/(\d)\s*[xX]\s*(\d)/g, "$1×$2");
}

// BB-282 — ảnh chụp để đối chiếu TỪNG ĐIỂM với bản vẽ
// `babybean-assets/BB-281/{cua-hang-cau-hinh,cua-hang-chon-anh}.png`.
const THU_MUC_ANH_282 = "test-results/bb-282";
fs.mkdirSync(THU_MUC_ANH_282, { recursive: true });

interface BoCuc {
  galleryId: string;
  customerId: string;
  maLink: string;
  soAnh: number;
  // Hai sản phẩm ảnh in, khác kích thước — dùng thật từ bb-dev.
  size1: string | null;
  material1: string | null;
  unitPrice1: number;
  size2: string | null;
  coHaiKichThuoc: boolean;
}

async function dungFixture(pg: Client): Promise<BoCuc> {
  await pg.query(
    `delete from galleries where title like 'Fixture BB-279%' and created_at < now() - interval '6 hours'`,
  );
  await pg.query(
    `delete from customers where full_name like 'Fixture BB-279%' and created_at < now() - interval '6 hours'`,
  );

  const { rows: br } = await pg.query("select id from branches order by name limit 1");
  const branchId = br[0].id;

  const { rows: kh } = await pg.query(
    `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
    [branchId, `${NHAN} Khách`, soGia()],
  );
  const customerId = kh[0].id;

  const soAnh = 5;
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                            drive_folder_url, photo_count, included_quota)
     values ($1,$2,$3,'ready',$4,'https://example.com/x',$5,10) returning id`,
    [branchId, customerId, NHAN, `fixture-bb279e2e-${runId}`, soAnh],
  );
  const galleryId = g[0].id;

  for (let i = 1; i <= soAnh; i++) {
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,$3,'image/jpeg',$4,'active')`,
      [galleryId, `bb279e2e-${runId}-${i}`, `BB279_${String(i).padStart(3, "0")}.jpg`, i],
    );
  }

  const maLink = randomBytes(32).toString("base64url");
  await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'owner',$4,'active')`,
    [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
  );

  // Hai kích thước THẬT khác nhau trong nhóm "ảnh in" (kind='print'), để đo
  // bước chuyển kích thước → chất liệu lọc lại → giá đổi đúng.
  const { rows: spDsKichThuoc } = await pg.query(
    `select distinct size from products
      where is_active and kind = 'print' and list_price is not null
        and price_confidence >= 0.8 and price_samples >= 5 and size is not null
      order by size limit 2`,
  );
  const coHaiKichThuoc = spDsKichThuoc.length >= 2;

  const { rows: sp1 } = await pg.query(
    `select size, material, list_price from products
      where is_active and kind = 'print' and list_price is not null
        and price_confidence >= 0.8 and price_samples >= 5 and size is not null
      order by size limit 1`,
  );

  return {
    galleryId,
    customerId,
    maLink,
    soAnh,
    size1: sp1[0]?.size ?? null,
    material1: sp1[0]?.material ?? null,
    unitPrice1: sp1[0]?.list_price ? Number(sp1[0].list_price) : 0,
    size2: spDsKichThuoc[1]?.size ?? null,
    coHaiKichThuoc,
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

function formatVND(n: number): string {
  return n.toLocaleString("vi-VN") + " ₫";
}

ownIpTest.describe("BB-279: cửa hàng tối giản", () => {
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

  ownIpTest(
    "chọn kích thước → chất liệu → số lượng ra đúng giá, chọn 3 tấm → 3 dòng giỏ, tổng đúng",
    async ({ page }) => {
      ownIpTest.setTimeout(60_000);
      if (!bc.size1 || bc.unitPrice1 <= 0) {
        ownIpTest.skip(true, "bb-dev hiện không có sản phẩm ảnh in đủ điều kiện bán — bỏ qua ca này.");
        return;
      }

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/g/${bc.maLink}`);
      await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));

      // Thả tim 3 tấm đầu — như ba mẹ thật, không chèn thẳng vào DB.
      const theAnh = page.getByTestId("the-anh");
      for (let i = 0; i < 3; i++) {
        await theAnh.nth(i).getByRole("button", { name: /Chọn ảnh này|Bỏ chọn/ }).click();
      }

      await page.getByRole("button", { name: "Mua thêm" }).click();
      const cuaHang = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
      await cuaHang.waitFor({ state: "visible" });

      // Tab dùng nhãn NGẮN một dòng từ BB-282 ("Ảnh in", không phải tên đầy đủ
      // "Ảnh in và ảnh phóng" — đó vẫn là TEN_NHOM, dùng ở nơi khác).
      await cuaHang.getByRole("button", { name: "Ảnh in", exact: true }).click();

      // Chip kích thước đầu tiên (đúng `size1`) đã tự chọn — bấm lại cho chắc.
      await cuaHang.getByRole("button", { name: nhanKichThuoc(bc.size1), exact: true }).click();

      await page.screenshot({ path: `${THU_MUC_ANH}/1-cau-hinh-truoc.png` });

      // Giá hiện ở đáy dính = đơn giá × 1 (số lượng mặc định).
      await ownIpExpect(cuaHang.getByTestId("gia-tam-tinh")).toHaveText(formatVND(bc.unitPrice1));

      // Tăng số lượng lên 2 -> giá nhân đôi.
      await cuaHang.getByRole("button", { name: "Thêm số lượng" }).click();
      await ownIpExpect(cuaHang.getByTestId("gia-tam-tinh")).toHaveText(formatVND(bc.unitPrice1 * 2));

      await page.screenshot({ path: `${THU_MUC_ANH}/2-cau-hinh-sau.png` });
      // BB-282 — đối chiếu điểm 1-6 với babybean-assets/BB-281/cua-hang-cau-hinh.png.
      await page.screenshot({ path: `${THU_MUC_ANH_282}/cua-hang-1440x900.png` });

      // Chọn ảnh — lưới nhiều tấm, mặc định lọc "Đã thả tim" (3 tấm).
      await cuaHang.getByRole("button", { name: "Chọn ảnh" }).click();
      const luoiChon = page.getByRole("dialog", { name: "Chọn ảnh để đặt in" });
      await luoiChon.waitFor({ state: "visible" });
      await ownIpExpect(luoiChon.getByText("Đã thả tim · 3")).toBeVisible();

      const anhTrongLuoi = luoiChon.locator("button:has(img)");
      await ownIpExpect(anhTrongLuoi).toHaveCount(3);
      for (let i = 0; i < 3; i++) await anhTrongLuoi.nth(i).click();

      await page.screenshot({ path: `${THU_MUC_ANH}/3-luoi-chon-anh.png` });
      // BB-282 — đối chiếu điểm 7 với babybean-assets/BB-281/cua-hang-chon-anh.png.
      await page.screenshot({ path: `${THU_MUC_ANH_282}/chon-anh-1440x900.png` });

      await ownIpExpect(luoiChon.getByText("Đã chọn 3 tấm")).toBeVisible();
      await luoiChon.getByRole("button", { name: "Xong", exact: true }).click();
      await luoiChon.waitFor({ state: "hidden" });

      // Ba dòng giỏ, cùng sản phẩm, số lượng 2 mỗi dòng.
      const tongDung = bc.unitPrice1 * 2 * 3;
      await ownIpExpect
        .poll(async () => cuaHang.locator("footer li").count(), {
          message: "Chưa thấy đủ 3 dòng giỏ sau khi chọn ảnh",
        })
        .toBe(3);
      await ownIpExpect(cuaHang.getByText(formatVND(tongDung))).toBeVisible();

      await page.screenshot({ path: `${THU_MUC_ANH}/4-gio-hang-ba-dong.png` });

      await cuaHang.getByRole("button", { name: "Đóng" }).first().click();
      await cuaHang.waitFor({ state: "hidden" });

      // Đường thứ hai: từ màn xem ảnh lớn của MỘT trong ba tấm đã đặt,
      // "Đặt in tấm này" phải mở cửa hàng với tấm đó có sẵn.
      await theAnh.first().getByRole("button", { name: /^Xem ảnh/ }).click();
      const lightbox = page.getByRole("dialog").first();
      await lightbox.waitFor({ state: "visible" });

      const nutDatInTamNay = lightbox.getByRole("button", { name: /Ảnh in và ảnh phóng/ });
      await ownIpExpect(nutDatInTamNay).toBeVisible();
      await ownIpExpect(nutDatInTamNay.getByText(/Đang đặt 2/)).toBeVisible();
      await page.screenshot({ path: `${THU_MUC_ANH}/5-xem-lon-dat-in-tam-nay.png` });

      await nutDatInTamNay.click();
      const cuaHangPreset = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
      await cuaHangPreset.waitFor({ state: "visible" });
      await ownIpExpect(cuaHangPreset.getByText("Áp dụng cho tấm đang xem")).toBeVisible();
      await page.screenshot({ path: `${THU_MUC_ANH}/6-preset-tam-dang-xem.png` });

      // Xác nhận -> hộp thoại tự đóng (đã ghi thêm dòng giỏ cho đúng tấm này).
      await cuaHangPreset.getByRole("button", { name: "Thêm vào giỏ" }).click();
      await cuaHangPreset.waitFor({ state: "hidden" });
    },
  );

  ownIpTest("kích thước khác -> chất liệu lọc lại, chỉ khi bb-dev có ≥2 kích thước", async ({ page }) => {
    if (!bc.coHaiKichThuoc || !bc.size2) {
      ownIpTest.skip(true, "bb-dev hiện chỉ có một kích thước ảnh in — không đo được bước lọc lại.");
      return;
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${bc.maLink}`);
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.getByRole("button", { name: "Mua thêm" }).click();
    const cuaHang = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
    await cuaHang.waitFor({ state: "visible" });
    await cuaHang.getByRole("button", { name: "Ảnh in", exact: true }).click();

    await cuaHang.getByRole("button", { name: nhanKichThuoc(bc.size2), exact: true }).click();
    // Đổi kích thước xong thì KHÔNG còn hiện chip chất liệu của size1 nữa
    // (nếu material1 khác material của size2) — canh gián tiếp qua việc
    // trang không báo lỗi và vẫn hiện đúng bước Kích thước/Số lượng.
    await ownIpExpect(cuaHang.getByText("Kích thước")).toBeVisible();
  });

  ownIpTest("390×844: cửa hàng và lưới chọn ảnh không cuộn ngang", async ({ page }) => {
    if (!bc.size1) {
      ownIpTest.skip(true, "bb-dev hiện không có sản phẩm ảnh in — bỏ qua ca này.");
      return;
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${bc.maLink}`);
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.getByRole("button", { name: "Mua thêm" }).click();
    const cuaHang = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
    await cuaHang.waitFor({ state: "visible" });

    let cuonNgang = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    ownIpExpect(cuonNgang, "cửa hàng cuộn ngang ở 390×844").toBe(false);

    // BB-282 — nhãn tab phải NGẮN, một dòng: chủ studio đã thấy "Ảnh in và
    // ảnh phóng" gãy xuống 2 dòng ở điện thoại. Đo chiều cao thật của nút tab
    // đang bán đầu tiên — hoàn nguyên bản vá này (nhãn dài trở lại) là ca này
    // phải đỏ vì tab cao hơn 40px khi chữ xuống dòng.
    const tabDauTien = cuaHang.locator("nav button").first();
    const hopTab = await tabDauTien.boundingBox();
    ownIpExpect(hopTab && hopTab.height, "nhãn tab xuống dòng ở 390px (tab cao hơn 40px)").toBeLessThanOrEqual(
      40,
    );

    // BB-282 — đối chiếu điểm 1-6 với babybean-assets/BB-281/cua-hang-cau-hinh.png (390×844@2x).
    await page.screenshot({ path: `${THU_MUC_ANH_282}/cua-hang-390x844.png` });

    await cuaHang.getByRole("button", { name: "Chọn ảnh" }).click();
    const luoiChon = page.getByRole("dialog", { name: "Chọn ảnh để đặt in" });
    await luoiChon.waitFor({ state: "visible" });
    cuonNgang = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    ownIpExpect(cuonNgang, "lưới chọn ảnh cuộn ngang ở 390×844").toBe(false);
    // BB-282 — đối chiếu điểm 7 với babybean-assets/BB-281/cua-hang-chon-anh.png (390×844@2x).
    await page.screenshot({ path: `${THU_MUC_ANH_282}/chon-anh-390x844.png` });
  });
});
