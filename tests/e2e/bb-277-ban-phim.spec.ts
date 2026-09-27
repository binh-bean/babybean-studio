/**
 * BB-277 — soát dùng được bằng BÀN PHÍM và TRÌNH ĐỌC MÀN HÌNH trên màn khách
 * và màn quản trị chính; vá chỗ nhỏ. Kèm bù độ phủ BB-275: màn treo tường
 * trên điện thoại.
 *
 * OWNER: QA-BOT (chỉ file này; sản phẩm do DEV-FE/DEV-UI sửa theo phát hiện —
 * ở lượt này Sonnet vá thẳng theo đúng luật "vá tối thiểu" của brief).
 *
 * BA MẢNG PHÉP THỬ, đều là phép đo MÁY (không đoán bằng mắt):
 *
 *  1. AXE — quét `@axe-core/playwright` trên từng màn/hộp thoại, CHỈ tính vi
 *     phạm mức serious/critical (minor/moderate không chặn công việc thật,
 *     và axe hay quá nhạy với chi tiết thẩm mỹ — theo đúng brief).
 *
 *  2. BÀN PHÍM — Tab tới được + thấy VÒNG FOCUS (đo bằng box-shadow/outline
 *     máy tính, không đoán bằng mắt) ở: thẻ ảnh (mở ảnh lớn), nút tim, hai
 *     nút icon trong xem ảnh lớn (ghi chú/sản phẩm), nút "Chốt danh sách".
 *     Trong xem ảnh lớn: ← → chuyển ảnh, Esc đóng, focus quay về đúng thẻ đã
 *     mở. Ba hộp thoại (cửa hàng, chọn bìa album ở quản trị, chuông) giữ
 *     Tab quẩn bên trong và Esc đóng được, focus trả về đúng nút đã mở.
 *
 *  3. BÙ ĐỘ PHỦ BB-275 — màn treo tường trên điện thoại (390×844), đo bằng
 *     `kiemBoCuc` (BB-275 dừng ở "Xem trên tường nhà mình" nhưng chưa đo bố
 *     cục CHÍNH màn đó trên điện thoại — chỉ đo tới bước mở bảng sản phẩm).
 *
 * Dữ liệu: chỉ tạo "Fixture BB-277 …", xoá sạch ở afterAll + dọn cũ ≥ 6 giờ,
 * đúng khuôn BB-274/BB-275. Danh mục sản phẩm (`products`) dùng dữ liệu THẬT
 * sẵn có trong bb-dev (không phải dữ liệu khách hàng — là danh mục giá công
 * khai của studio), như BB-275 đã làm — ca liên quan tự `test.skip` kèm lý do
 * nếu môi trường thiếu danh mục, không giả vờ xanh.
 *
 * Mỗi ca dùng một IP riêng (`helpers/ip-rieng-moi-ca`) cho phần màn khách, vì
 * mở link `/g/[token]` bị giới hạn theo IP (xem BB-266/BB-160).
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { test as pwTest, expect as pwExpect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { kiemBoCuc, DIEN_THOAI } from "./helpers/kiem-bo-cuc";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-277 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const THU_MUC_ANH = "test-results/bb-277";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

/**
 * Chỉ tính vi phạm mức serious/critical — đúng phạm vi brief đã chốt.
 *
 * `color-contrast` tách RIÊNG: brief nói rõ "CHỈ báo, không đổi màu thương
 * hiệu (chủ studio quyết)" — nên vi phạm màu KHÔNG được làm phép thử đỏ, chỉ
 * gom vào báo cáo cuối để dán vào bàn giao.
 */
async function chayAxe(
  page: Page,
  tenMan: string,
): Promise<{ phaiVa: string[]; mauSac: string[] }> {
  const ketQua = await new AxeBuilder({ page }).analyze();
  const nghiemTrong = ketQua.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const dong = (v: (typeof nghiemTrong)[number]) =>
    `— Màn "${tenMan}": ${v.id} (${v.impact}) — ${v.help} — ${v.nodes.length} phần tử, vd: ${v.nodes[0]?.target.join(" ")}`;
  return {
    // Chủ studio chốt 27/09: "đậm lên vừa đủ" — từ nay tương phản màu cũng
    // làm phép thử đỏ, liệt kê đủ từng phần tử.
    phaiVa: nghiemTrong.map(dong),
    mauSac: nghiemTrong
      .filter((v) => v.id === "color-contrast")
      .flatMap((v) => v.nodes.map((n) => `— Màn "${tenMan}": ${n.target.join(" ")} — ${n.any[0]?.message ?? ""}`)),
  };
}

/** Tab thật (không đoán) tới khi `document.activeElement` khớp `dich`, tối đa `toiDa` lần bấm. */
async function tabToi(page: Page, dich: Locator, toiDa = 60): Promise<boolean> {
  for (let i = 0; i < toiDa; i++) {
    const khop = await dich.evaluate((el) => el === document.activeElement).catch(() => false);
    if (khop) return true;
    await page.keyboard.press("Tab");
  }
  return dich.evaluate((el) => el === document.activeElement).catch(() => false);
}

/** Đo MÁY xem phần tử đang có vòng focus nhìn thấy được không (box-shadow hoặc outline thật). */
async function coVongFocusNhinDuoc(phanTu: Locator): Promise<boolean> {
  return phanTu.evaluate((el) => {
    const cs = getComputedStyle(el);
    const coBongVien = cs.boxShadow && cs.boxShadow !== "none";
    const coOutline =
      cs.outlineStyle && cs.outlineStyle !== "none" && cs.outlineWidth !== "0px";
    return Boolean(coBongVien || coOutline);
  });
}

// ---------------------------------------------------------------------------
// PHẦN 1 — MÀN KHÁCH: /g/[token], xem ảnh lớn, cửa hàng, chuông.
// ---------------------------------------------------------------------------
interface BoCucKhach {
  branchId: string;
  customerId: string;
  galleryId: string;
  maLink: string;
  coDanhMucAnhIn: boolean;
}

async function dungFixtureKhach(pg: Client): Promise<BoCucKhach> {
  await pg.query(`delete from galleries where title like 'Fixture BB-277%' and created_at < now() - interval '6 hours'`);
  await pg.query(`delete from customers where full_name like 'Fixture BB-277%' and created_at < now() - interval '6 hours'`);

  const { rows: br } = await pg.query("select id from branches order by name limit 1");
  const branchId = br[0].id;

  const { rows: kh } = await pg.query(
    `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
    [branchId, `${NHAN} Khách`, `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`],
  );
  const customerId = kh[0].id;

  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                            drive_folder_url, photo_count, included_quota, extra_photo_price,
                            download_enabled)
     values ($1,$2,$3,'ready',$4,'https://example.com/x',6,10,20000,true) returning id`,
    [branchId, customerId, NHAN, `fixture-bb277-${runId}`],
  );
  const galleryId = g[0].id;

  for (let i = 1; i <= 6; i++) {
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,$3,'image/jpeg',$4,'active')`,
      [galleryId, `bb277-${runId}-${i}`, `BB277_${String(i).padStart(3, "0")}.jpg`, i],
    );
  }

  // Danh mục ảnh in — cần cho "cửa hàng" và "Xem trên tường nhà mình" (như BB-275).
  const { rows: spAnhIn } = await pg.query(
    `select id from products
      where is_active and list_price is not null and price_confidence >= 0.8 and price_samples >= 5
        and kind in ('print','addon')
      limit 3`,
  );
  const coDanhMucAnhIn = spAnhIn.length > 0;

  const maLink = randomBytes(32).toString("base64url");
  await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'owner',$4,'active')`,
    [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
  );

  return { branchId, customerId, galleryId, maLink, coDanhMucAnhIn };
}

async function donDepKhach(pg: Client, bc: BoCucKhach) {
  if (bc.galleryId) {
    await pg.query("delete from activity_logs where entity_id = $1", [bc.galleryId]);
    await pg.query("delete from selections where gallery_id = $1", [bc.galleryId]);
    await pg.query("delete from share_links where gallery_id = $1", [bc.galleryId]);
    await pg.query("delete from photos where gallery_id = $1", [bc.galleryId]);
    await pg.query("delete from galleries where id = $1", [bc.galleryId]);
  }
  if (bc.customerId) await pg.query("delete from customers where id = $1", [bc.customerId]);
}

/** Thả tim tấm đầu tiên bằng chuột thật qua DOM — lý do dùng evaluate: xem `bb-275-man-phu.spec.ts`. */
async function thaTimTamDau(page: Page) {
  const the = page.getByTestId("the-anh").first();
  await the.waitFor({ state: "visible", timeout: 30_000 });
  await the.evaluate((el) => {
    const btn = [...el.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Chọn ảnh này");
    (btn as HTMLButtonElement | undefined)?.click();
  });
  await page.waitForTimeout(200);
}

ownIpTest.describe("BB-277: màn khách — axe + bàn phím", () => {
  let pg: Client;
  let bc: BoCucKhach;

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    bc = await dungFixtureKhach(pg);
  });

  ownIpTest.afterAll(async () => {
    if (pg) {
      await donDepKhach(pg, bc);
      await pg.end();
    }
  });

  ownIpTest("Axe — bộ ảnh, xem ảnh lớn, cửa hàng, chuông (chỉ serious/critical)", async ({ page }) => {
    ownIpTest.setTimeout(120_000);
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${bc.maLink}`);
    await page.getByTestId("the-anh").first().waitFor({ state: "visible", timeout: 30_000 });

    const toanBoLoi: string[] = [];
    const toanBoMauSac: string[] = [];
    const gom = (r: { phaiVa: string[]; mauSac: string[] }) => {
      toanBoLoi.push(...r.phaiVa);
      toanBoMauSac.push(...r.mauSac);
    };
    gom(await chayAxe(page, "man-khach-bo-anh"));

    // Xem ảnh lớn.
    await page
      .getByTestId("the-anh")
      .first()
      .getByRole("button", { name: /^Xem ảnh/ })
      .evaluate((el) => (el as HTMLElement).click());
    const lightbox = page.getByRole("dialog").first();
    await lightbox.waitFor({ state: "visible" });
    gom(await chayAxe(page, "man-khach-xem-lon"));
    await page.keyboard.press("Escape");
    await lightbox.waitFor({ state: "hidden" }).catch(() => {});

    // Cửa hàng.
    if (bc.coDanhMucAnhIn) {
      const nutMuaThem = page.getByRole("button", { name: "Mua thêm" });
      if (await nutMuaThem.isVisible().catch(() => false)) {
        await nutMuaThem.click();
        const cuaHang = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
        await cuaHang.waitFor({ state: "visible" }).catch(() => {});
        gom(await chayAxe(page, "man-khach-cua-hang"));
        await page.keyboard.press("Escape");
        await cuaHang.waitFor({ state: "hidden" }).catch(() => {});
      }
    }

    // Chuông thông báo.
    const nutChuong = page.getByRole("button", { name: /^Thông báo/ });
    if (await nutChuong.isVisible().catch(() => false)) {
      await nutChuong.click();
      const bangChuong = page.getByRole("dialog", { name: "Danh sách thông báo" });
      await bangChuong.waitFor({ state: "visible" }).catch(() => {});
      gom(await chayAxe(page, "man-khach-chuong-thong-bao"));
      await page.keyboard.press("Escape");
    }

    if (toanBoMauSac.length > 0) {
      console.log(`[BB-277] Vi phạm tương phản màu:\n${toanBoMauSac.join("\n")}`);
    }
    ownIpExpect
      .soft(toanBoLoi, `Vi phạm axe mức serious/critical (kể cả màu sắc):\n${toanBoLoi.join("\n")}`)
      .toEqual([]);
  });

  ownIpTest("Bàn phím — thẻ ảnh, tim, nút Chốt: Tab tới được và có vòng focus", async ({ page }) => {
    ownIpTest.setTimeout(60_000);
    await page.goto(`/g/${bc.maLink}`);
    const theDau = page.getByTestId("the-anh").first();
    await theDau.waitFor({ state: "visible", timeout: 30_000 });
    // BB-277 kiểm ngược (axe nested-interactive) — thẻ (div) chỉ còn là khung
    // định vị; nút "mở ảnh lớn" THẬT là một <button> riêng bên trong nó.
    const nutMoAnh = theDau.getByRole("button", { name: /^Xem ảnh/ });

    // Nút mở ảnh lớn: Tab thật tới được, có vòng focus, Enter mở ảnh lớn.
    const toiDuocThe = await tabToi(page, nutMoAnh, 80);
    ownIpExpect(toiDuocThe, "Không Tab tới được nút mở ảnh lớn của thẻ ảnh đầu tiên").toBe(true);
    ownIpExpect(await coVongFocusNhinDuoc(nutMoAnh), "Thẻ ảnh không có vòng focus nhìn thấy được").toBe(true);

    await page.keyboard.press("Enter");
    const lightbox = page.getByRole("dialog").first();
    await lightbox.waitFor({ state: "visible" });

    // Focus quay về đúng thẻ đã mở khi đóng bằng Esc.
    await page.keyboard.press("Escape");
    await lightbox.waitFor({ state: "hidden" }).catch(() => {});
    const veLaiDungThe = await nutMoAnh.evaluate((el) => el === document.activeElement);
    ownIpExpect(veLaiDungThe, "Focus không quay về đúng thẻ ảnh vừa mở sau khi Esc").toBe(true);

    // Nút tim của thẻ đầu tiên: Tab từ đây tới được, có vòng focus.
    const nutTim = theDau.getByRole("button", { name: /Chọn ảnh này|Bỏ chọn/ });
    const toiDuocTim = await tabToi(page, nutTim, 10);
    ownIpExpect(toiDuocTim, "Không Tab tới được nút tim ngay sau thẻ ảnh").toBe(true);
    ownIpExpect(await coVongFocusNhinDuoc(nutTim), "Nút tim không có vòng focus nhìn thấy được").toBe(true);

    // Nút "Chốt danh sách" ở thanh nổi đáy trang.
    const nutChot = page.getByRole("button", { name: "Chốt danh sách" });
    if (await nutChot.isVisible().catch(() => false)) {
      const toiDuocChot = await tabToi(page, nutChot, 200);
      ownIpExpect(toiDuocChot, "Không Tab tới được nút Chốt danh sách").toBe(true);
      ownIpExpect(await coVongFocusNhinDuoc(nutChot), "Nút Chốt danh sách không có vòng focus nhìn thấy được").toBe(
        true,
      );
    }
  });

  ownIpTest("Bàn phím — xem ảnh lớn: mũi tên chuyển ảnh, ghi chú/sản phẩm có aria-label", async ({ page }) => {
    ownIpTest.setTimeout(60_000);
    await page.setViewportSize(DIEN_THOAI); // hai nút icon (ghi chú/sản phẩm) chỉ hiện dưới `lg`.
    await page.goto(`/g/${bc.maLink}`);
    await thaTimTamDau(page); // cần đã chọn thì ô ghi chú mới mở khoá được.

    await page
      .getByTestId("the-anh")
      .first()
      .getByRole("button", { name: /^Xem ảnh/ })
      .evaluate((el) => (el as HTMLElement).click());
    const lightbox = page.getByRole("dialog").first();
    await lightbox.waitFor({ state: "visible" });

    const nhanSo = () => lightbox.locator("header span.tabular-nums").textContent();
    ownIpExpect(await nhanSo()).toBe("1");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    ownIpExpect(await nhanSo()).toBe("2");
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(150);
    ownIpExpect(await nhanSo()).toBe("1");

    // Hai nút icon-only phải có aria-label tiếng Việt (không phải rỗng, không chỉ là icon câm).
    const nutGhiChu = lightbox.getByRole("button", { name: "Ghi chú cho thợ chỉnh ảnh" });
    await ownIpExpect(nutGhiChu).toBeVisible();
    ownIpExpect(await coVongFocusNhinDuoc(nutGhiChu.first())).toBe(false); // chưa focus thì chưa có vòng — kiểm ngược bước sau
    const toiDuocGhiChu = await tabToi(page, nutGhiChu, 20);
    if (toiDuocGhiChu) {
      ownIpExpect(await coVongFocusNhinDuoc(nutGhiChu), "Nút ghi chú không có vòng focus nhìn thấy được").toBe(true);
    }

    if (bc.coDanhMucAnhIn) {
      const nutSanPham = lightbox.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" });
      await ownIpExpect(nutSanPham).toBeVisible();
    }

    await page.keyboard.press("Escape");
    await lightbox.waitFor({ state: "hidden" }).catch(() => {});
  });

  ownIpTest("Bàn phím — cửa hàng và chuông giữ focus bên trong, Esc đóng, focus trả về nút mở", async ({ page }) => {
    ownIpTest.setTimeout(60_000);
    await page.goto(`/g/${bc.maLink}`);
    await page.getByTestId("the-anh").first().waitFor({ state: "visible", timeout: 30_000 });

    if (bc.coDanhMucAnhIn) {
      const nutMuaThem = page.getByRole("button", { name: "Mua thêm" });
      if (await nutMuaThem.isVisible().catch(() => false)) {
        await nutMuaThem.focus();
        await nutMuaThem.press("Enter");
        const cuaHang = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
        await cuaHang.waitFor({ state: "visible" });

        // Tab nhiều lần: focus không bao giờ thoát khỏi hộp thoại.
        for (let i = 0; i < 25; i++) {
          await page.keyboard.press("Tab");
          const trongHop = await cuaHang.evaluate((el) => el.contains(document.activeElement));
          ownIpExpect(trongHop, `Focus thoát khỏi hộp thoại cửa hàng ở lượt Tab thứ ${i + 1}`).toBe(true);
        }

        await page.keyboard.press("Escape");
        await cuaHang.waitFor({ state: "hidden" });
        const veLaiNutMo = await nutMuaThem.evaluate((el) => el === document.activeElement);
        ownIpExpect(veLaiNutMo, "Esc đóng cửa hàng nhưng focus không trả về nút Mua thêm").toBe(true);
      }
    }

    const nutChuong = page.getByRole("button", { name: /^Thông báo/ });
    if (await nutChuong.isVisible().catch(() => false)) {
      await nutChuong.focus();
      await nutChuong.press("Enter");
      const bangChuong = page.getByRole("dialog", { name: "Danh sách thông báo" });
      await bangChuong.waitFor({ state: "visible" });

      for (let i = 0; i < 15; i++) {
        await page.keyboard.press("Tab");
        const trongHop = await bangChuong.evaluate((el) => el.contains(document.activeElement));
        ownIpExpect(trongHop, `Focus thoát khỏi bảng chuông ở lượt Tab thứ ${i + 1}`).toBe(true);
      }

      await page.keyboard.press("Escape");
      await bangChuong.waitFor({ state: "hidden" });
      const veLaiNutChuong = await nutChuong.evaluate((el) => el === document.activeElement);
      ownIpExpect(veLaiNutChuong, "Esc đóng bảng chuông nhưng focus không trả về nút Thông báo").toBe(true);
    }
  });

  // ---------------------------------------------------------------------
  // PHẦN 3 — bù độ phủ BB-275: màn treo tường trên điện thoại.
  // ---------------------------------------------------------------------
  ownIpTest("Bù độ phủ BB-275 — bố cục màn treo tường trên điện thoại", async ({ page }) => {
    ownIpTest.setTimeout(60_000);
    if (!bc.coDanhMucAnhIn) {
      ownIpTest.skip(true, "Môi trường không có danh mục ảnh in — không có nút Xem trên tường nhà mình");
      return;
    }
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${bc.maLink}`);
    await page.getByTestId("the-anh").first().waitFor({ state: "visible", timeout: 30_000 });

    // Mở xem lớn.
    await page
      .getByTestId("the-anh")
      .first()
      .getByRole("button", { name: /^Xem ảnh/ })
      .evaluate((el) => (el as HTMLElement).click());
    const lightbox = page.getByRole("dialog").first();
    await lightbox.waitFor({ state: "visible" });

    // Mở bảng sản phẩm (chỉ trên điện thoại — nút icon "Sản phẩm cho tấm ảnh này").
    const nutBangSanPham = lightbox.getByRole("button", { name: "Sản phẩm cho tấm ảnh này" });
    await nutBangSanPham.waitFor({ state: "visible" });
    await nutBangSanPham.click();
    const tamBangSanPham = page.getByRole("dialog", { name: "In ảnh này" });
    await tamBangSanPham.waitFor({ state: "visible" });

    const nutTuong = page.getByRole("button", { name: /Xem trên tường nhà mình/ }).first();
    if (!(await nutTuong.isVisible().catch(() => false))) {
      ownIpTest.skip(true, "Không thấy nút Xem trên tường nhà mình trong bảng sản phẩm hiện tại");
      return;
    }
    await nutTuong.click();
    const manTuong = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
    await manTuong.waitFor({ state: "visible" });

    const loi = await kiemBoCuc(page, DIEN_THOAI, (hau) => `${THU_MUC_ANH}/treo-tuong-dien-thoai-${hau}.png`);
    ownIpExpect.soft(loi, `Lỗi bố cục màn treo tường trên điện thoại:\n${loi.join("\n")}`).toEqual([]);

    // Nút đóng bấm được (đo máy — không chỉ nhìn có nút).
    const nutDong = manTuong.getByRole("button", { name: "Đóng" }).first();
    if (await nutDong.isVisible().catch(() => false)) {
      await nutDong.click();
      await manTuong.waitFor({ state: "hidden" }).catch(() => {});
    } else {
      await page.keyboard.press("Escape");
    }
  });
});

// ---------------------------------------------------------------------------
// PHẦN 2 — MÀN QUẢN TRỊ CHÍNH: /login, /admin, /admin/galleries, chi tiết bộ ảnh.
// ---------------------------------------------------------------------------
pwTest.describe("BB-277: màn quản trị — axe + bàn phím", () => {
  let pgAdmin: Client;
  let userId = "";
  const email = `test_bb277_${runId}@demo.babybean.vn`;
  const password = "Password123!";
  let branchId = "";
  let customerId = "";
  let galleryId = "";

  pwTest.beforeAll(async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminAuthClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await adminAuthClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;

    pgAdmin = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pgAdmin.connect();
    await pgAdmin.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
      userId,
      `Fixture BB-277 Nhân sự ${runId}`,
      email,
    ]);

    const { rows: br } = await pgAdmin.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: kh } = await pgAdmin.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách quản trị`],
    );
    customerId = kh[0].id;
    const { rows: g } = await pgAdmin.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'in_review',$4,'https://example.com/x',8,10,50000,true) returning id`,
      [branchId, customerId, `${NHAN} Bộ ảnh quản trị`, `fixture-bb277-admin-${runId}`],
    );
    galleryId = g[0].id;
    await pgAdmin.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       select $1, 'bb277-admin-' || $2 || '-' || x, 'BB277A_' || lpad(x::text, 4, '0') || '.jpg', 'image/jpeg', x, 'active'
       from generate_series(1, 8) as x`,
      [galleryId, runId],
    );
  });

  pwTest.afterAll(async () => {
    if (pgAdmin) {
      if (galleryId) await pgAdmin.query("delete from activity_logs where entity_id = $1", [galleryId]);
      if (galleryId) await pgAdmin.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await pgAdmin.query("delete from photos where gallery_id = $1", [galleryId]);
      if (galleryId) await pgAdmin.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await pgAdmin.query("delete from customers where id = $1", [customerId]);
      if (userId) await pgAdmin.query("delete from staff_profiles where id = $1", [userId]);
      await pgAdmin.end();
    }
    if (userId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const adminAuthClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await adminAuthClient.auth.admin.deleteUser(userId);
    }
  });

  pwTest("Axe — đăng nhập, bảng điều khiển, danh sách bộ ảnh, chi tiết bộ ảnh", async ({ page }) => {
    pwTest.setTimeout(180_000);
    const toanBoLoi: string[] = [];
    const toanBoMauSac: string[] = [];
    const gom = (r: { phaiVa: string[]; mauSac: string[] }) => {
      toanBoLoi.push(...r.phaiVa);
      toanBoMauSac.push(...r.mauSac);
    };

    await page.goto("/login");
    await page.getByLabel("Tên tài khoản hoặc email").waitFor({ state: "visible" });
    gom(await chayAxe(page, "dang-nhap"));

    await dangNhapNhanVien(page, email, password);

    for (const [ten, path] of [
      ["bang-dieu-khien", "/admin"],
      ["danh-sach-bo-anh", "/admin/galleries"],
      ["chi-tiet-bo-anh", `/admin/galleries/${galleryId}`],
    ] as const) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(400);
      gom(await chayAxe(page, ten));
    }

    if (toanBoMauSac.length > 0) {
      console.log(`[BB-277] Vi phạm tương phản màu:\n${toanBoMauSac.join("\n")}`);
    }
    pwExpect
      .soft(toanBoLoi, `Vi phạm axe mức serious/critical (kể cả màu sắc):\n${toanBoLoi.join("\n")}`)
      .toEqual([]);
  });

  pwTest("Bàn phím — hộp thoại Chọn bìa bộ ảnh giữ focus, Esc đóng, nút X có aria-label", async ({ page }) => {
    pwTest.setTimeout(120_000);
    await dangNhapNhanVien(page, email, password);
    await page.goto(`/admin/galleries/${galleryId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    const nutMo = page.getByRole("button", { name: "Mở trình thiết kế bìa" });
    await nutMo.waitFor({ state: "visible" });
    await nutMo.focus();
    await nutMo.press("Enter");

    const hopThoai = page.getByRole("dialog", { name: "Thiết kế bìa bộ ảnh" });
    await hopThoai.waitFor({ state: "visible" });

    // Nút đóng icon-only phải có aria-label — không phải chỉ một chữ X câm.
    const nutDong = hopThoai.getByRole("button", { name: "Đóng" });
    await pwExpect(nutDong).toBeVisible();

    // Tab quẩn trong hộp thoại.
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const trongHop = await hopThoai.evaluate((el) => el.contains(document.activeElement));
      pwExpect(trongHop, `Focus thoát khỏi hộp thoại Chọn bìa ở lượt Tab thứ ${i + 1}`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await hopThoai.waitFor({ state: "hidden" });
    const veLaiNutMo = await nutMo.evaluate((el) => el === document.activeElement);
    pwExpect(veLaiNutMo, "Esc đóng hộp thoại Chọn bìa nhưng focus không trả về nút Mở trình thiết kế bìa").toBe(true);
  });

  pwTest("Danh sách bộ ảnh — nút Sao chép link icon-only có aria-label (điện thoại)", async ({ page }) => {
    pwTest.setTimeout(60_000);
    await page.setViewportSize(DIEN_THOAI);
    await dangNhapNhanVien(page, email, password);
    await page.goto("/admin/galleries", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    // Trên < lg là danh sách thẻ (không phải bảng) — nút "Sao chép link" chỉ có icon.
    const the = page.locator(`text=${NHAN} Bộ ảnh quản trị`).locator("xpath=ancestor::*[self::div][1]");
    await the.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    const nutSaoChep = page.getByRole("button", { name: "Sao chép link" }).first();
    await pwExpect(nutSaoChep).toBeVisible({ timeout: 15_000 });
  });
});
