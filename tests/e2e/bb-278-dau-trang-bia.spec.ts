/**
 * BB-278 — màn khách: thương hiệu lên đầu trang, chữ bìa không đè ảnh trên
 * máy tính, thanh chọn/chốt nhỏ và màu tinh tế.
 *
 * OWNER: QA-BOT (chỉ file này; sản phẩm do DEV-FE sửa theo phát hiện).
 *
 * Chủ studio 27/09/2026 (nguyên văn, xem brief):
 *  "màn khách từ baby bean để phía trên như bản trước không đưa xuống dưới /
 *   phần thông tin ảnh bìa trên pc màn ngang rất dễ đè lấp mất hình / phần
 *   bóng chọn và chốt hình nhỏ lại nữa đổi màu cho tinh tế".
 *
 * NĂM PHÉP ĐO MÁY (không đoán bằng mắt):
 *  (1) "Baby Bean" nằm trong thanh thương hiệu đầu trang
 *      (`data-testid="thanh-thuong-hieu"`) và NẰM TRỌN trong khung nhìn ngay
 *      khi mở trang — chưa cuộn — cả điện thoại (390×844) lẫn máy tính
 *      (1440×900).
 *  (2) Hộp ảnh bìa (`data-testid="bia-khoi-anh"`) và hộp chữ bìa
 *      (`data-testid="bia-khoi-chu"`) KHÔNG GIAO NHAU trên máy tính màn ngang
 *      (1440×900 và 1280×720) — đo bằng bounding rect, không suy luận từ
 *      class CSS. Ảnh bìa phải TẢI THẬT (naturalWidth > 0), không chỉ
 *      "nhìn thấy" (`visible` của Playwright không đợi ảnh giải mã xong).
 *  (3) Thanh nổi chọn/chốt (`data-testid="thanh-noi"`, viên bên trong) có
 *      chiều cao ≤ 48px trên điện thoại và ≤ 44px trên máy tính.
 *  (4) Chip gợi ý "Lưu ra màn hình chính" (mở sau khi thả tim tấm đầu) và
 *      thanh nổi chọn/chốt KHÔNG GIAO NHAU ở 390×844 — hai thẻ nổi độc lập
 *      canh nhau bằng số đo tay từng đè lên nhau khi một bên đổi kích thước
 *      (BB-278/BB-281, ảnh chụp máy thật chủ studio gửi 27/09/2026).
 *  (5) "BABY BEAN" (`data-testid="ten-thuong-hieu"`) CĂN GIỮA THẬT theo bề
 *      ngang màn điện thoại — |tâm chữ − 195px| ≤ 4px ở 390×844. Đo tâm CHỮ,
 *      không phải tâm khối bọc (Opus soát lần 2, 27/09/2026: cụm 3 nút bên
 *      phải từng kéo lệch chữ ~25px vì lưới `1fr auto 1fr` thiếu
 *      `minmax(0,…)`).
 *
 * Dữ liệu: chỉ tạo "Fixture BB-278 …", xoá sạch ở afterAll + dọn cũ ≥ 6 giờ,
 * đúng khuôn `bb-274-bo-cuc.spec.ts` + `helpers/kiem-bo-cuc.ts`. Mỗi ca dùng
 * một IP riêng (`helpers/ip-rieng-moi-ca`) vì mở link `/g/[token]` bị giới
 * hạn theo IP (BB-160/BB-266).
 *
 * Ảnh chụp: `test-results/bb-278/` (đã gitignore) — tự xem, không phải bằng
 * chứng nộp kèm.
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import type { Locator } from "@playwright/test";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

/**
 * Đợi ẢNH THẬT SỰ tải xong (`load`/`error`, hoặc đã `complete` sẵn), không
 * chỉ đợi thẻ <img> hiện trên trang. `waitFor({state:"visible"})` của
 * Playwright chỉ xét bố cục/CSS — thẻ <img> có kích thước đặt trước nên
 * "visible" ngay cả khi ảnh còn đang tải; máy chủ ảnh (`/api/img/[id]`) ở
 * môi trường thử phải xin lại lượt Storage thật (không phải chỉ Drive giả
 * lập), có thể mất hơn nửa giây — chụp ảnh/đo trước lúc đó thấy khung TRỐNG
 * dù không có lỗi bố cục nào (đã xác minh: cùng hiện tượng ở cả mã trước và
 * sau BB-278, không phải hồi quy — chỉ là chụp quá sớm).
 */
async function doiAnhTai(anh: Locator, timeoutMs = 15000): Promise<void> {
  await anh.evaluate(
    (img: HTMLImageElement, timeout: number) =>
      img.complete
        ? undefined
        : new Promise<void>((resolve) => {
            const xong = () => resolve();
            img.addEventListener("load", xong, { once: true });
            img.addEventListener("error", xong, { once: true });
            setTimeout(xong, timeout);
          }),
    timeoutMs,
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-278 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const THU_MUC_ANH = "test-results/bb-278";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

const DIEN_THOAI = { width: 390, height: 844 };
const MAY_TINH = { width: 1440, height: 900 };
const MAY_TINH_NHO = { width: 1280, height: 720 };

function tenAnh(tenMan: string, kichThuoc: { width: number; height: number }) {
  return `${THU_MUC_ANH}/${tenMan.replace(/[^a-z0-9-]+/gi, "-")}-${kichThuoc.width}x${kichThuoc.height}.png`;
}

ownIpTest.describe("BB-278: đầu trang thương hiệu + bìa máy tính + thanh nổi", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    await pg.query(`delete from galleries where title like 'Fixture BB-278%' and created_at < now() - interval '6 hours'`);
    await pg.query(`delete from customers where full_name like 'Fixture BB-278%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',20,10,50000,true) returning id`,
      [branchId, customerId, NHAN, `fixture-bb278-${runId}`],
    );
    galleryId = g[0].id;

    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       select $1, 'bb278-' || $2 || '-' || x, 'BB278_' || lpad(x::text, 4, '0') || '.jpg', 'image/jpeg', x, 'active'
       from generate_series(1, 20) as x`,
      [galleryId, runId],
    );

    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
  });

  ownIpTest.afterAll(async () => {
    if (pg) {
      if (galleryId) await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
      await pg.end();
    }
  });

  // -------------------------------------------------------------------------
  // (1) "Baby Bean" luôn thấy ở đầu trang, chưa cuộn — điện thoại + máy tính.
  // -------------------------------------------------------------------------
  for (const [tenKichThuoc, kichThuoc] of [
    ["dien-thoai", DIEN_THOAI],
    ["may-tinh", MAY_TINH],
  ] as const) {
    ownIpTest(`"Baby Bean" hiện ở đầu trang, chưa cuộn — ${tenKichThuoc}`, async ({ page }) => {
      await page.setViewportSize(kichThuoc);
      await page.goto(`/g/${maLink}`);
      const anhBia = page.locator('img[fetchpriority="high"]');
      await anhBia.first().waitFor({ state: "visible", timeout: 30000 });
      await doiAnhTai(anhBia.first());

      const thanhThuongHieu = page.getByTestId("thanh-thuong-hieu");
      await thanhThuongHieu.waitFor({ state: "visible" });
      await ownIpExpect(thanhThuongHieu).toContainText("Baby Bean");

      await page.screenshot({ path: tenAnh("dau-trang", kichThuoc), fullPage: false });

      const hop = await thanhThuongHieu.boundingBox();
      if (!hop) throw new Error("Không đo được thanh thương hiệu");
      ownIpExpect
        .soft(hop.y, `Thanh thương hiệu không nằm ở đầu trang (y=${hop.y})`)
        .toBeLessThanOrEqual(2);
      ownIpExpect
        .soft(hop.y + hop.height, `Thanh thương hiệu tràn khỏi khung nhìn (đáy=${hop.y + hop.height}, cao khung=${kichThuoc.height})`)
        .toBeLessThanOrEqual(kichThuoc.height);
    });
  }

  // -------------------------------------------------------------------------
  // (1b) Opus soát lần 2 (27/09/2026) — "BABY BEAN" phải CĂN GIỮA THẬT theo
  // bề ngang màn điện thoại, không lệch trái vì cụm 3 nút bên phải kéo cột
  // lưới rộng ra (đo ảnh chụp trước bản vá: tâm chữ ~170px/390 thay vì
  // 195px — lệch tới 25px, mắt thường thấy rõ). Đo tâm CHỮ, không đo tâm
  // khối bọc quanh nó (khối bọc luôn full-width nên tâm nó không nói lên gì).
  // -------------------------------------------------------------------------
  ownIpTest('"BABY BEAN" căn giữa thật theo bề ngang — dien-thoai (390×844)', async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLink}`);
    const anhBia = page.locator('img[fetchpriority="high"]');
    await anhBia.first().waitFor({ state: "visible", timeout: 30000 });

    const ten = page.getByTestId("ten-thuong-hieu");
    await ten.waitFor({ state: "visible" });

    const hop = await ten.boundingBox();
    if (!hop) throw new Error("Không đo được tên thương hiệu");
    const tamChu = hop.x + hop.width / 2;
    const tamKhung = DIEN_THOAI.width / 2; // 195

    ownIpExpect
      .soft(
        Math.abs(tamChu - tamKhung),
        `"Baby Bean" lệch tâm màn: tâm chữ=${tamChu.toFixed(1)}px, tâm khung=${tamKhung}px, lệch=${Math.abs(tamChu - tamKhung).toFixed(1)}px`,
      )
      .toBeLessThanOrEqual(4);

    // Opus soát lần 3: căn giữa xong thì biểu tượng nhắn tin ĐÈ chữ "BEAN".
    // Không nút nào trong thanh thương hiệu được giao hộp chữ.
    const nut = page.getByTestId("thanh-thuong-hieu").locator("a:visible, button:visible");
    for (const h of await nut.all()) {
      const b = await h.boundingBox();
      if (!b) continue;
      const giao = b.x < hop.x + hop.width && hop.x < b.x + b.width;
      ownIpExpect.soft(giao, `Nút ${await h.getAttribute("aria-label")} đè lên chữ Baby Bean`).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // (2) Hộp ảnh bìa và hộp chữ bìa KHÔNG GIAO NHAU trên máy tính màn ngang.
  // -------------------------------------------------------------------------
  for (const [tenKichThuoc, kichThuoc] of [
    ["1440x900", MAY_TINH],
    ["1280x720", MAY_TINH_NHO],
  ] as const) {
    ownIpTest(`Hộp chữ bìa không giao hộp ảnh bìa — ${tenKichThuoc}`, async ({ page }) => {
      await page.setViewportSize(kichThuoc);
      await page.goto(`/g/${maLink}`);
      const anhBia = page.locator('img[fetchpriority="high"]');
      await anhBia.first().waitFor({ state: "visible", timeout: 30000 });
      await doiAnhTai(anhBia.first());

      const khoiAnh = page.getByTestId("bia-khoi-anh");
      const khoiChu = page.getByTestId("bia-khoi-chu");
      await khoiAnh.waitFor({ state: "visible" });
      await khoiChu.waitFor({ state: "visible" });

      // Ảnh bìa phải TẢI THẬT — không chỉ khung <img> hiện trên trang.
      const naturalWidth = await anhBia.first().evaluate((img: HTMLImageElement) => img.naturalWidth);
      ownIpExpect
        .soft(naturalWidth, `Ảnh bìa chưa tải xong (naturalWidth=${naturalWidth}) ở ${tenKichThuoc}`)
        .toBeGreaterThan(0);

      await page.screenshot({ path: tenAnh("bia-may-tinh", kichThuoc), fullPage: false });

      const rAnh = await khoiAnh.boundingBox();
      const rChu = await khoiChu.boundingBox();
      if (!rAnh || !rChu) throw new Error("Không đo được khối ảnh/chữ của bìa");

      // Không giao nhau nghĩa là một hộp nằm HẲN trên/dưới/trái/phải hộp kia.
      const khongGiao =
        rChu.y >= rAnh.y + rAnh.height - 1 || // chữ nằm dưới ảnh
        rAnh.y >= rChu.y + rChu.height - 1 || // ảnh nằm dưới chữ (không nên xảy ra)
        rChu.x >= rAnh.x + rAnh.width - 1 ||
        rAnh.x >= rChu.x + rChu.width - 1;

      ownIpExpect
        .soft(
          khongGiao,
          `Hộp chữ bìa giao hộp ảnh bìa (${tenKichThuoc}): ảnh={y:${rAnh.y}-${rAnh.y + rAnh.height}}, chữ={y:${rChu.y}-${rChu.y + rChu.height}}`,
        )
        .toBe(true);
    });
  }

  // -------------------------------------------------------------------------
  // (3) Thanh nổi chọn/chốt nhỏ lại — ≤48px điện thoại, ≤44px máy tính.
  // -------------------------------------------------------------------------
  for (const [tenKichThuoc, kichThuoc, nguong] of [
    ["dien-thoai", DIEN_THOAI, 48],
    ["may-tinh", MAY_TINH, 44],
  ] as const) {
    ownIpTest(`Thanh nổi chọn/chốt cao ≤ ${nguong}px — ${tenKichThuoc}`, async ({ page }) => {
      await page.setViewportSize(kichThuoc);
      await page.goto(`/g/${maLink}`);
      const anhBia = page.locator('img[fetchpriority="high"]');
      await anhBia.first().waitFor({ state: "visible", timeout: 30000 });

      // Cuộn qua khỏi bìa để thanh nổi hiện (BB-258: ẩn khi bìa còn >40% màn).
      await page.evaluate(() => document.getElementById("dau-luoi-anh")?.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(400);

      const thanhNoi = page.getByTestId("thanh-noi");
      const vien = thanhNoi.locator("> div").first();
      await vien.waitFor({ state: "visible" });

      await page.screenshot({ path: tenAnh("thanh-noi", kichThuoc), fullPage: false });

      const hop = await vien.boundingBox();
      if (!hop) throw new Error("Không đo được thanh nổi");
      ownIpExpect
        .soft(hop.height, `Thanh nổi cao ${hop.height}px, vượt ngưỡng ${nguong}px (${tenKichThuoc})`)
        .toBeLessThanOrEqual(nguong + 0.5);
    });
  }

  // -------------------------------------------------------------------------
  // (4) Chip gợi ý "Lưu ra màn hình chính" và thanh nổi chọn/chốt KHÔNG GIAO
  // NHAU — kể cả khi cả hai cùng có mặt trên trang (đã cuộn qua bìa, vừa thả
  // tim tấm ảnh đầu tiên là đúng lúc gợi ý bật lên, xem `loi-goi-y-luu-app.tsx`).
  // -------------------------------------------------------------------------
  ownIpTest("Chip gợi ý Lưu app không giao thanh nổi chọn/chốt — dien-thoai", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLink}`);
    const anhBia = page.locator('img[fetchpriority="high"]');
    await anhBia.first().waitFor({ state: "visible", timeout: 30000 });
    await doiAnhTai(anhBia.first());

    // Cuộn qua khỏi bìa để thanh nổi hiện, rồi thả tim tấm đầu tiên — đúng
    // tín hiệu `loi-goi-y-luu-app.tsx` chờ để tự bật (0 -> >0).
    await page.evaluate(() => document.getElementById("dau-luoi-anh")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Chọn ảnh này" }).first().click();

    const chip = page.getByTestId("goi-y-luu-app");
    await chip.waitFor({ state: "visible", timeout: 10000 });

    // Ảnh riêng cuộn về đầu trang — để TỰ SO chip với bản vẽ
    // `babybean-assets/BB-281/goi-y-luu-app.png` (chip nằm ngay dưới thanh
    // thương hiệu, không phải để đo bố cục).
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: tenAnh("goi-y-luu-app-dau-trang", DIEN_THOAI), fullPage: false });
    await page.evaluate(() => document.getElementById("dau-luoi-anh")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);

    const thanhNoi = page.getByTestId("thanh-noi");
    const vien = thanhNoi.locator("> div").first();
    await vien.waitFor({ state: "visible" });

    // KHÔNG cuộn thêm gì nữa — đo đúng lúc cả hai cùng "đang có trên trang"
    // như ba mẹ thật sẽ thấy khi vừa chọn ảnh xong (ảnh chụp máy thật chủ
    // studio gửi 27/09/2026 bắt được lúc này).
    await page.screenshot({ path: tenAnh("goi-y-luu-app", DIEN_THOAI), fullPage: false });

    const rChip = await chip.boundingBox();
    const rThanhNoi = await vien.boundingBox();
    if (!rChip || !rThanhNoi) throw new Error("Không đo được chip gợi ý / thanh nổi");

    const khongGiao =
      rChip.y >= rThanhNoi.y + rThanhNoi.height - 1 ||
      rThanhNoi.y >= rChip.y + rChip.height - 1 ||
      rChip.x >= rThanhNoi.x + rThanhNoi.width - 1 ||
      rThanhNoi.x >= rChip.x + rChip.width - 1;

    ownIpExpect
      .soft(
        khongGiao,
        `Chip gợi ý giao thanh nổi: chip={y:${rChip.y}-${rChip.y + rChip.height}}, thanh nổi={y:${rThanhNoi.y}-${rThanhNoi.y + rThanhNoi.height}}`,
      )
      .toBe(true);
  });
});
