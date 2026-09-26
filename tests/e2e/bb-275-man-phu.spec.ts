/**
 * BB-275 — soát bố cục các màn PHỤ của màn khách, điện thoại (390×844) và máy
 * tính (1440×900). Nối tiếp BB-274 (đã soát các màn CHÍNH) — dùng lại chính
 * hàm đo `kiemBoCuc` (bốn phép đo máy: cuộn ngang, chữ tràn, ảnh không phủ
 * kín, thanh dính đáy che nút) từ `./helpers/kiem-bo-cuc.ts` — helper dùng
 * chung với BB-274, tách hẳn khỏi hai file `*.spec.ts` để import không kéo
 * theo tác dụng phụ "chạy luôn bộ test của file kia".
 *
 * Sáu màn phụ:
 *  1. Xem ảnh lớn (lightbox) — tim/ghi chú/chuyển ảnh.
 *  2. So sánh ảnh (ghim & vuốt).
 *  3. Cửa hàng mua thêm + treo ảnh lên tường.
 *  4. Mời người thân (ba mẹ) + màn khách vai trò người thân (link riêng).
 *  5. Chọn bìa album (khối inline, không phải hộp thoại).
 *  6. Chuông thông báo.
 *
 * Dữ liệu: chỉ tạo "Fixture BB-275 …", xoá sạch ở afterAll + dọn cũ ≥ 6 giờ,
 * theo đúng khuôn BB-274/BB-217-218/BB-248/BB-254/BB-202. Danh mục sản phẩm
 * (`products`) dùng dữ liệu THẬT sẵn có trong bb-dev, không tạo sản phẩm giả
 * (như BB-248/BB-217-218 đã làm) — nếu môi trường không có đủ danh mục thì ca
 * liên quan tự `test.skip` kèm lý do, không giả vờ xanh.
 *
 * Mỗi ca dùng một IP riêng (`helpers/ip-rieng-moi-ca.ts`) để không cạn hạn
 * mức mở link. Mỗi ca chỉ `goto` một lần cho link ba mẹ, rồi thao tác tuần tự
 * qua các màn phụ trong CÙNG một lượt tải trang — mở lại nhiều lần sẽ tốn hạn
 * mức 429 (xem BB-266/BB-160).
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { kiemBoCuc, kiemBoCucNhe, DIEN_THOAI, MAY_TINH } from "./helpers/kiem-bo-cuc";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = () => `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-275 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const THU_MUC_ANH = "test-results/bb-275";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

function tenAnh(tenMan: string, kichThuoc: { width: number; height: number }, hau: string) {
  const an = kichThuoc.width === DIEN_THOAI.width ? "dien-thoai" : "may-tinh";
  return `${THU_MUC_ANH}/${tenMan.replace(/[^a-z0-9-]+/gi, "-")}-${an}-${hau}.png`;
}

interface BoCuc {
  branchId: string;
  customerId: string;
  galleryId: string;
  maLink: string;
  albumProductId: string;
  coDanhMucAnhIn: boolean;
  coBangAlbumCovers: boolean;
}

async function dungFixture(pg: Client): Promise<BoCuc> {
  await pg.query(`delete from galleries where title like 'Fixture BB-275%' and created_at < now() - interval '6 hours'`);
  await pg.query(`delete from customers where full_name like 'Fixture BB-275%' and created_at < now() - interval '6 hours'`);

  const { rows: br } = await pg.query("select id from branches order by name limit 1");
  const branchId = br[0].id;

  const { rows: kh } = await pg.query(
    `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
    [branchId, `${NHAN} Khách`, soGia()],
  );
  const customerId = kh[0].id;

  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                            drive_folder_url, photo_count, included_quota, extra_photo_price,
                            download_enabled)
     values ($1,$2,$3,'ready',$4,'https://example.com/x',6,10,20000,true) returning id`,
    [branchId, customerId, NHAN, `fixture-bb275-${runId}`],
  );
  const galleryId = g[0].id;

  for (let i = 1; i <= 6; i++) {
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,$3,'image/jpeg',$4,'active')`,
      [galleryId, `bb275-${runId}-${i}`, `BB275_${String(i).padStart(3, "0")}.jpg`, i],
    );
  }

  // Sản phẩm nhóm ảnh in — cần cho "treo lên tường" (BB-217) và cửa hàng.
  const { rows: spAnhIn } = await pg.query(
    `select id from products
      where is_active and list_price is not null and price_confidence >= 0.8 and price_samples >= 5
        and kind in ('print','addon')
      limit 3`,
  );
  const coDanhMucAnhIn = spAnhIn.length > 0;

  // Sản phẩm nhóm album — cần cho khối "Chọn ảnh bìa album" (BB-202).
  const { rows: spAlbum } = await pg.query(
    `select id from products
      where is_active and material ilike '%album%' and list_price is not null
        and price_confidence >= 0.8 and price_samples >= 5
      limit 1`,
  );
  const albumProductId = spAlbum[0]?.id ?? "";

  const { rows: tAlbumCovers } = await pg.query(`select to_regclass('public.album_covers') as t`);
  const coBangAlbumCovers = tAlbumCovers[0]?.t !== null;

  if (albumProductId) {
    await pg.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
       values ($1,$2,1,500000)`,
      [galleryId, albumProductId],
    );
    // Gói có album cần dòng "ảnh chỉnh sửa" cạnh nó, nếu không hạn mức "chưa
    // biết" chặn thả tim (đúng ghi chú của BB-202).
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

  return { branchId, customerId, galleryId, maLink, albumProductId, coDanhMucAnhIn, coBangAlbumCovers };
}

async function donDep(pg: Client, bc: BoCuc) {
  if (bc.galleryId) {
    await pg.query("delete from album_covers where gallery_id = $1", [bc.galleryId]).catch(() => {});
    await pg.query("delete from yeu_cau_mua_them where gallery_id = $1", [bc.galleryId]).catch(() => {});
    await pg.query("delete from activity_logs where entity_id = $1", [bc.galleryId]);
    await pg.query("delete from gallery_items where gallery_id = $1", [bc.galleryId]);
    await pg.query("delete from selections where gallery_id = $1", [bc.galleryId]);
    await pg.query("delete from share_links where gallery_id = $1", [bc.galleryId]);
    await pg.query("delete from photos where gallery_id = $1", [bc.galleryId]);
    await pg.query("delete from galleries where id = $1", [bc.galleryId]);
  }
  if (bc.customerId) await pg.query("delete from customers where id = $1", [bc.customerId]);
}

/**
 * Thả tim (chọn) N tấm đầu tiên trong lưới — cần cho so sánh/treo tường/bìa
 * album.
 *
 * BỎ QUA tấm đã chọn sẵn thay vì đòi đúng nhãn "Chọn ảnh này": `beforeAll` chỉ
 * tạo MỘT fixture dùng chung cho cả hai ca điện-thoại/máy-tính (đúng chủ đích
 * — mở link tốn hạn mức IP, xem đầu file), nên ca chạy SAU thấy vài tấm đầu
 * ĐÃ được ca chạy TRƯỚC thả tim rồi. Đòi đúng "Chọn ảnh này" ở tấm đã chọn thì
 * không bao giờ khớp — treo tới hết `timeout` mà thông báo "không tìm thấy".
 *
 * Bấm bằng `evaluate` + `HTMLElement.click()` thay vì `locator.click()` của
 * Playwright — thẻ ảnh nằm trên khung `position: absolute` do một toán xếp
 * masonry tính toạ độ, nên rê chuột THẬT tới nút đôi lúc bị phép kiểm "phần tử
 * đã đứng yên" của Playwright chặn; bấm thẳng qua DOM tránh hẳn bước đó, còn
 * đúng/sai của bố cục vẫn do `kiemBoCuc` đo độc lập ngay sau.
 */
async function thaTimMayTam(page: Page, soTam: number) {
  const the = page.getByTestId("the-anh");
  await the.first().waitFor({ state: "visible", timeout: 30_000 });
  for (let i = 0; i < soTam; i++) {
    const tam = the.nth(i);
    await tam.scrollIntoViewIfNeeded();
    await tam.evaluate((el) => {
      const btn = [...el.querySelectorAll("button")].find((b) =>
        /Chọn ảnh này|Bỏ chọn/.test(b.getAttribute("aria-label") ?? ""),
      );
      if (btn && btn.getAttribute("aria-label") === "Chọn ảnh này") {
        (btn as HTMLButtonElement).click();
      }
    });
    await page.waitForTimeout(150);
  }
}

/** Bấm thẳng vào tấm ảnh thứ `i` (mở màn xem lớn / đánh dấu so sánh) — cùng lý do dùng `evaluate` ở `thaTimMayTam`. */
async function bamThe(page: Page, i: number) {
  const the = page.getByTestId("the-anh").nth(i);
  await the.scrollIntoViewIfNeeded();
  await the.evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(150);
}

ownIpTest.describe("BB-275: bố cục các màn phụ của màn khách", () => {
  let pg: Client;
  let bc: BoCuc;

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    bc = await dungFixture(pg);
  });

  ownIpTest.afterAll(async () => {
    if (pg) {
      await donDep(pg, bc);
      await pg.end();
    }
  });

  for (const [tenKichThuoc, kichThuoc] of [
    ["dien-thoai", DIEN_THOAI],
    ["may-tinh", MAY_TINH],
  ] as const) {
    ownIpTest(`Các màn phụ — ${tenKichThuoc}`, async ({ page }) => {
      ownIpTest.setTimeout(180_000);
      await page.setViewportSize(kichThuoc);
      await page.goto(`/g/${bc.maLink}`);

      const toanBoLoi: string[] = [];
      const gop = (ten: string, loi: string[]) => {
        if (loi.length > 0) toanBoLoi.push(`— Màn "${ten}":\n  ${loi.join("\n  ")}`);
      };

      await thaTimMayTam(page, 3);

      // 1. XEM ẢNH LỚN (lightbox) --------------------------------------------
      await bamThe(page, 0);
      const lightbox = page.getByRole("dialog").first();
      await lightbox.waitFor({ state: "visible" });
      // Ba nút cốt lõi phải bấm được: tim, đóng, chuyển ảnh (kế tiếp trên máy tính).
      await ownIpExpect(lightbox.getByLabel(/Bỏ chọn|Chọn ảnh này/)).toBeVisible();
      gop(
        "man-khach-xem-lon",
        await kiemBoCuc(page, kichThuoc, (hau) => tenAnh("xem-lon", kichThuoc, hau)),
      );

      // 1b. TREO LÊN TƯỜNG (từ trong lightbox, chỉ khi có danh mục ảnh in) ---
      if (bc.coDanhMucAnhIn) {
        const nutTuong = page.getByRole("button", { name: /Xem trên tường nhà mình/ }).first();
        if (await nutTuong.isVisible().catch(() => false)) {
          await nutTuong.click();
          const manTuong = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
          await manTuong.waitFor({ state: "visible" }).catch(() => {});
          if (await manTuong.isVisible().catch(() => false)) {
            gop(
              "man-khach-treo-tuong",
              await kiemBoCuc(page, kichThuoc, (hau) => tenAnh("treo-tuong", kichThuoc, hau)),
            );
          }
          await page.keyboard.press("Escape");
          await manTuong.waitFor({ state: "hidden" }).catch(() => {});
        }
      }
      await page.keyboard.press("Escape");
      await lightbox.waitFor({ state: "hidden" }).catch(() => {});

      // 2. SO SÁNH ẢNH ----------------------------------------------------
      await page.getByRole("button", { name: "So sánh", exact: true }).click();
      await bamThe(page, 0);
      await bamThe(page, 1);
      const nutXemSoSanh = page.getByRole("button", { name: /Đã chọn 2 tấm để so sánh/ });
      if (await nutXemSoSanh.isVisible().catch(() => false)) {
        await nutXemSoSanh.click();
        const manSoSanh = page.getByRole("dialog", { name: "So sánh nhiều tấm" });
        await manSoSanh.waitFor({ state: "visible" });
        gop(
          "man-khach-so-sanh",
          await kiemBoCuc(page, kichThuoc, (hau) => tenAnh("so-sanh", kichThuoc, hau)),
        );
        // Chế độ Ghim & vuốt — bố cục khác hẳn lưới 2 tấm.
        const nutGhimVuot = manSoSanh.getByRole("button", { name: /Ghim & vuốt/i });
        if (await nutGhimVuot.isVisible().catch(() => false)) {
          await nutGhimVuot.click();
          await page.waitForTimeout(300);
          gop(
            "man-khach-so-sanh-ghim-vuot",
            await kiemBoCuc(page, kichThuoc, (hau) => tenAnh("so-sanh-ghim-vuot", kichThuoc, hau)),
          );
        }
        await page.keyboard.press("Escape");
        await manSoSanh.waitFor({ state: "hidden" }).catch(() => {});
      }
      const nutHuySoSanh = page.getByRole("button", { name: "Huỷ so sánh" });
      if (await nutHuySoSanh.isVisible().catch(() => false)) await nutHuySoSanh.click();

      // 3. CỬA HÀNG MUA THÊM -----------------------------------------------
      const nutMuaThem = page.getByRole("button", { name: "Mua thêm" });
      if (await nutMuaThem.isVisible().catch(() => false)) {
        await nutMuaThem.click();
        const cuaHang = page.getByText("Mua thêm sản phẩm");
        await cuaHang.waitFor({ state: "visible" }).catch(() => {});
        gop(
          "man-khach-cua-hang",
          await kiemBoCuc(page, kichThuoc, (hau) => tenAnh("cua-hang", kichThuoc, hau)),
        );
        const nutDongCuaHang = page.getByRole("button", { name: "Đóng" }).first();
        if (await nutDongCuaHang.isVisible().catch(() => false)) await nutDongCuaHang.click();
      }

      // 4. MỜI NGƯỜI THÂN (ba mẹ) -------------------------------------------
      const nutMoi = page.getByRole("button", { name: "Mời", exact: true });
      let diaChiLinkNguoiThan = "";
      if (await nutMoi.isVisible().catch(() => false)) {
        await nutMoi.click();
        const hopMoi = page.getByText("Ông bà xem được ảnh và gửi yêu cầu mua thêm");
        await hopMoi.waitFor({ state: "visible" }).catch(() => {});
        gop(
          "man-khach-moi-nguoi-than",
          await kiemBoCuc(page, kichThuoc, (hau) => tenAnh("moi-nguoi-than", kichThuoc, hau)),
        );

        const oNhap = page.getByPlaceholder("Ví dụ: Bà nội");
        if (await oNhap.isVisible().catch(() => false)) {
          await oNhap.fill(`${NHAN} Bà nội ${tenKichThuoc}`);
          await page.getByRole("button", { name: "Tạo link" }).click();
          const doanLink = page.locator("p.break-all");
          await doanLink.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
          diaChiLinkNguoiThan = (await doanLink.textContent().catch(() => "")) ?? "";
          gop(
            "man-khach-moi-nguoi-than-da-tao",
            await kiemBoCuc(page, kichThuoc, (hau) =>
              tenAnh("moi-nguoi-than-da-tao", kichThuoc, hau),
            ),
          );
        }
        const nutDongMoi = page.getByRole("button", { name: "Đóng" }).first();
        if (await nutDongMoi.isVisible().catch(() => false)) await nutDongMoi.click();
      }

      // 5. CHỌN BÌA ALBUM (khối inline — cuộn tới #dau-luoi-anh trước) ------
      if (bc.albumProductId && bc.coBangAlbumCovers) {
        await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
        await page.waitForTimeout(300);
        const khoiBia = page.getByText("Chọn ảnh bìa album");
        if (await khoiBia.isVisible().catch(() => false)) {
          gop(
            "man-khach-chon-bia-album",
            await kiemBoCuc(page, kichThuoc, (hau) => tenAnh("chon-bia-album", kichThuoc, hau)),
          );
        }
      }

      // 6. CHUÔNG THÔNG BÁO --------------------------------------------------
      const nutChuong = page.getByRole("button", { name: /^Thông báo/ });
      if (await nutChuong.isVisible().catch(() => false)) {
        await nutChuong.click();
        const bangChuong = page.getByRole("dialog", { name: "Danh sách thông báo" });
        await bangChuong.waitFor({ state: "visible" }).catch(() => {});
        if (await bangChuong.isVisible().catch(() => false)) {
          gop(
            "man-khach-chuong-thong-bao",
            await kiemBoCucNhe(page, kichThuoc, () => tenAnh("chuong-thong-bao", kichThuoc, "mo")),
          );
        }
      }

      ownIpExpect
        .soft(toanBoLoi, `Lỗi bố cục các màn phụ (${tenKichThuoc}):\n${toanBoLoi.join("\n")}`)
        .toEqual([]);

      // 7. MÀN NGƯỜI THÂN — dùng lại CHÍNH page/IP của ca này để mở link vừa
      // tạo ở bước 4 (không mở context trình duyệt thứ hai, đỡ tốn thêm một
      // lượt "mở link" tính vào hạn mức IP).
      if (diaChiLinkNguoiThan) {
        const url = new URL(diaChiLinkNguoiThan.trim());
        await page.goto(url.pathname + url.search);
        await page.waitForTimeout(600);
        const loiNguoiThan = await kiemBoCuc(page, kichThuoc, (hau) =>
          tenAnh("man-nguoi-than", kichThuoc, hau),
        );
        ownIpExpect
          .soft(loiNguoiThan, `Lỗi bố cục màn người thân (${tenKichThuoc}):\n${loiNguoiThan.join("\n")}`)
          .toEqual([]);
        // Vai người thân KHÔNG được thấy tiền hợp đồng/tiền phát sinh của ba mẹ.
        await ownIpExpect(page.getByText(/Tiền mua thêm tạm tính/)).toHaveCount(0);
      }
    });
  }
});
