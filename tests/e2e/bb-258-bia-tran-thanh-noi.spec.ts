/**
 * BB-258 — bìa tràn toàn màn trên máy tính + thanh nổi không che tên mục/
 * thanh lọc.
 *
 * Chủ studio 26/09/2026 (kèm ảnh chụp màn khách 1920px):
 * 1) Bìa máy tính đang CHIA ĐÔI (chữ trái nền kem, ảnh phải, BB-253). Muốn:
 *    ảnh tràn toàn màn (~100dvh, object-cover), chữ đè lên ảnh.
 * 2) Thanh nổi (ThanhChon) đang nằm giữa đáy màn, CHE tên mục và thanh lọc.
 *
 * Phép thử dưới đây canh đúng hai điều đó — không phải để xanh, mà để ĐỎ nếu
 * bìa quay lại chia đôi hoặc thanh nổi quay lại che nội dung. Đã kiểm ngược:
 * hoàn nguyên bia-bo-anh.tsx/gallery-app.tsx/thanh-chon.tsx về bản BB-253 thì
 * các khẳng định bên dưới đỏ (ghi trong báo cáo bàn giao).
 *
 * Dữ liệu: chỉ tạo dòng "Fixture BB-258 …", xoá sạch ở afterAll — theo đúng
 * mẫu `tests/e2e/bb-240-man-khach-may-tinh.spec.ts`.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-258 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Cùng lý do BB-240: chạy KHÔNG ẩn thanh cuộn — máy Windows thật của studio
// luôn có thanh cuộn choán chỗ, và đề bài yêu cầu đo đúng ±2px "trừ thanh
// cuộn thật".
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test.describe("BB-258: bìa tràn toàn màn + thanh nổi không che tên mục/thanh lọc", () => {
  let pg: Client;
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(
      `delete from galleries where title like 'Fixture BB-258%' and created_at < now() - interval '1 hour'`,
    );
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-258%' and created_at < now() - interval '1 hour'`,
    );

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [br[0].id, `${NHAN} Khách`, soGia],
    );
    customerId = kh[0].id;
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',24,10,50000,false) returning id`,
      [br[0].id, customerId, NHAN, `fixture-bb258-${runId}`],
    );
    galleryId = g[0].id;
    // 24 ảnh — đủ để lưới cao hơn 100dvh, cần cuộn thật trên cả 1440/1920/390.
    for (let i = 1; i <= 24; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
         values ($1,$2,$3,'image/jpeg',$4,'active',3000,2000)`,
        [galleryId, `bb258-${runId}-${i}.jpg`, `BB258_${String(i).padStart(4, "0")}.jpg`, i],
      );
    }
    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner','Fixture BB-258','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
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

  for (const vp of [
    { w: 1440, h: 900 },
    { w: 1920, h: 1080 },
  ]) {
    test(`${vp.w}×${vp.h}: ảnh bìa tràn khung nhìn, tiêu đề nằm trong vùng ảnh`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto(`/g/${maLink}`);

      const bia = page.locator("section[aria-label='Ảnh bìa']");
      const tieuDe = bia.locator("h1");
      await expect(tieuDe).toBeVisible();

      const boxBia = (await bia.boundingBox())!;
      const boxTieuDe = (await tieuDe.boundingBox())!;
      const thanhCuon = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);

      // eslint-disable-next-line no-console
      console.log(`[BB-258] ${vp.w}×${vp.h} bìa=${JSON.stringify(boxBia)} thanhCuon=${thanhCuon}`);

      // Rộng bằng khung nhìn, trừ thanh cuộn thật (±2px).
      expect(Math.abs(boxBia.width - (vp.w - thanhCuon))).toBeLessThanOrEqual(2);
      // Cao tối thiểu 90% khung nhìn — không còn chia đôi/co lại theo cột.
      expect(boxBia.height).toBeGreaterThanOrEqual(vp.h * 0.9);

      // Tiêu đề nằm TRONG vùng ảnh bìa (đè lên ảnh, không phải ngoài/dưới nó).
      expect(boxTieuDe.x).toBeGreaterThanOrEqual(boxBia.x - 1);
      expect(boxTieuDe.x + boxTieuDe.width).toBeLessThanOrEqual(boxBia.x + boxBia.width + 1);
      expect(boxTieuDe.y).toBeGreaterThanOrEqual(boxBia.y - 1);
      expect(boxTieuDe.y + boxTieuDe.height).toBeLessThanOrEqual(boxBia.y + boxBia.height + 1);
    });
  }

  test("1440×900: bìa còn hiện thì thanh nổi ẩn; cuộn xuống thì thanh nổi không che tên mục/thanh lọc; cuộn lên thì bấm lại được", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLink}`);

    const bia = page.locator("section[aria-label='Ảnh bìa']");
    await expect(bia).toBeVisible();
    await expect(page.getByTestId("the-anh").first()).toBeVisible();

    const thanhNoi = page.getByTestId("thanh-noi");

    // (1) Bìa còn trong khung nhìn (chưa cuộn) → thanh nổi ẩn (aria-hidden).
    await expect(thanhNoi).toHaveAttribute("aria-hidden", "true");

    // Cuộn xuống tới tiêu đề mục. KHÔNG dùng `scrollIntoViewIfNeeded()` trên
    // `#dau-luoi-anh`: nó là phần tử `sticky top-0`, và Chromium coi nó "đã đủ
    // trong khung nhìn" sau một đoạn cuộn NGẮN hơn hẳn chiều cao thật của bìa
    // (đo được scrollY≈522 ở viewport 900 cao — bìa cao ~900 nên còn hiện quá
    // nửa, đúng lúc chủ studio phàn nàn thanh nổi che tên mục). `mouse.wheel`
    // cũng không đáng tin ở bề rộng điện thoại (đo được scrollY vẫn = 0) —
    // dùng thẳng `window.scrollBy`, phát đúng sự kiện "scroll" thật mà trình
    // lắng nghe của thanh nổi đang nghe, không phụ thuộc vị trí con trỏ chuột.
    await page.evaluate(() => window.scrollBy(0, 1400));
    // Đợi hết bộ đếm giờ "vừa dừng cuộn" (150ms) rồi mới đọc — tránh đọc giữa
    // lúc còn đang coi là "đang cuộn xuống".
    await page.waitForTimeout(300);

    await expect(thanhNoi).toHaveAttribute("aria-hidden", "false");

    const tieuDeMuc = page.locator("#dau-luoi-anh p.font-display").first();
    const nutLoc = page.getByRole("button", { name: /^Tất cả/ });
    await expect(tieuDeMuc).toBeVisible();
    await expect(nutLoc).toBeVisible();

    const khongGiao = async (a: { x: number; y: number; width: number; height: number }, hop: string) => {
      const b = (await (hop === "tieuDe" ? tieuDeMuc : nutLoc).boundingBox())!;
      const giao = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(giao, `thanh nổi ${JSON.stringify(a)} đè lên ${hop} ${JSON.stringify(b)}`).toBe(false);
    };

    const boxThanhNoi = (await thanhNoi.boundingBox())!;
    await khongGiao(boxThanhNoi, "tieuDe");
    await khongGiao(boxThanhNoi, "nutLoc");

    // Cuộn LÊN một chút → thanh nổi hiện lại NGAY, nút chính bấm được.
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(50);
    await expect(thanhNoi).toHaveAttribute("aria-hidden", "false");
    const nutTrongThanhNoi = thanhNoi.locator("button").last();
    await expect(nutTrongThanhNoi).toBeVisible();
    await expect(nutTrongThanhNoi).toBeEnabled();
  });

  test("390×844 (điện thoại): thanh nổi không che thanh lọc lúc cuộn tới lưới ảnh", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${maLink}`);
    // Chờ lưới ảnh dựng xong TRƯỚC khi cuộn — trang lúc đang tải chỉ cao đúng
    // bằng khung nhìn (`min-h-[80dvh]`, chưa có gì để cuộn), cuộn lúc đó vô ích.
    await expect(page.getByTestId("the-anh").first()).toBeVisible();

    // Xem lý do không dùng `scrollIntoViewIfNeeded()` trên phần tử sticky ở
    // ca thử 1440×900 phía trên — cùng áp dụng ở điện thoại.
    await page.evaluate(() => window.scrollBy(0, 1400));
    await page.waitForTimeout(300);

    const nutLoc = page.getByRole("button", { name: /^Tất cả/ });
    await expect(nutLoc).toBeVisible();

    const thanhNoi = page.getByTestId("thanh-noi");
    await expect(thanhNoi).toHaveAttribute("aria-hidden", "false");

    const boxThanhNoi = (await thanhNoi.boundingBox())!;
    const boxNutLoc = (await nutLoc.boundingBox())!;
    const giao =
      boxThanhNoi.x < boxNutLoc.x + boxNutLoc.width &&
      boxNutLoc.x < boxThanhNoi.x + boxThanhNoi.width &&
      boxThanhNoi.y < boxNutLoc.y + boxNutLoc.height &&
      boxNutLoc.y < boxThanhNoi.y + boxThanhNoi.height;
    expect(giao, `thanh nổi ${JSON.stringify(boxThanhNoi)} đè lên thanh lọc ${JSON.stringify(boxNutLoc)}`).toBe(false);
  });
});
