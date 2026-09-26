/**
 * BB-240 + BB-241 — màn khách trên MÁY TÍNH: cân lưới (bìa, đầu trang, lưới
 * ảnh, chân trang), chân trang thông tin studio gọn, bỏ khối "Thành phần hợp
 * đồng / Tổng cộng 0 ₫" khỏi màn khách, "Lưu app" thành lời gợi ý đúng lúc.
 *
 * Đo TRƯỚC khi sửa (24/09/2026, 1440×900, DevTools boundingBox):
 * - Đầu trang (`#dau-luoi-anh` > div): trái = px-3/sm:px-6, KHÔNG có bậc lg
 *   → 24px ở 1440px (sm đã áp).
 * - Lưới ảnh (section "Ảnh của buổi chụp"): trái = sm:px-3 lg:px-6 → 24px ở
 *   1440px (dưới breakpoint lg cũ là px-6 = 24px, TRÙNG với đầu trang tình cờ
 *   ở 1440, nhưng khác `max-w-4xl` của chân trang bên dưới).
 * - Chân trang (`<footer>` > div): `max-w-4xl mx-auto px-4` — RIÊNG một
 *   max-width (56rem = 896px) không liên quan `max-w-[1600px]` của ba khối
 *   kia. Ở 1440px: box rộng 896px, canh giữa → mép trái = (1440-896)/2 =
 *   272px. LỆCH 272-24 = 248px so với lưới ảnh.
 * - Bìa (`bia-bo-anh.tsx` cột chữ): `lg:px-16` cố định = 64px, không dùng
 *   max-width nào — LỆCH 64-24 = 40px so với lưới ảnh ở 1440px, và lệch xa
 *   hơn nữa ở màn rộng hơn (1920px) vì không tự co giãn như `mx-auto`.
 *
 * Sau khi sửa: cả bốn khối dùng chung một mép trái tính theo `mx-auto
 * max-w-[1600px] lg:px-10` (hoặc công thức tương đương cho bìa, xem
 * `src/styles/tokens.css`) — phép thử dưới đo lại đúng ba khối chủ studio nêu
 * tên (2-1: bìa/lưới ảnh, 2-2: chân trang) và phải ≤ 1px.
 *
 * Dữ liệu: chỉ tạo dòng "Fixture BB-240 …", xoá sạch ở afterAll. Theo mẫu
 * `tests/e2e/bb-217-218-so-sanh-treo-tuong.spec.ts` — số điện thoại giả MỚI
 * mỗi lượt (`soGia`) để không va `uq_customers_phone_branch` khi nhiều
 * worktree chạy song song.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-240 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Playwright chạy Chromium với --hide-scrollbars (thanh cuộn 0px). Cả tệp này
// chạy KHÔNG có cờ đó — như máy Windows thật của studio — để ca 1920 phân biệt
// được 100vw (tính cả thanh cuộn) với 100cqw.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test.describe("BB-240 + BB-241: màn khách máy tính — lưới, chân trang, lời gợi ý Lưu app", () => {
  let pg: Client;
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(
      `delete from galleries where title like 'Fixture BB-240%' and created_at < now() - interval '6 hours'`,
    );
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-240%' and created_at < now() - interval '6 hours'`,
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
       values ($1,$2,$3,'ready',$4,'https://example.com/x',6,10,50000,false) returning id`,
      [br[0].id, customerId, NHAN, `fixture-bb240-${runId}`],
    );
    galleryId = g[0].id;
    // Ảnh 1: bìa DỌC (2000x3000). Ảnh 2: bìa NGANG khả dĩ — cả hai tỉ lệ đều
    // phải đo được vì đề bài yêu cầu thử với cả bìa dọc và bìa ngang.
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
       values ($1,$2,$3,'image/jpeg',1,'active',2000,3000)`,
      [galleryId, `bb240-${runId}-1.jpg`, `BB240_0001.jpg`],
    );
    for (let i = 2; i <= 6; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
         values ($1,$2,$3,'image/jpeg',$4,'active',3000,2000)`,
        [galleryId, `bb240-${runId}-${i}.jpg`, `BB240_000${i}.jpg`, i],
      );
    }
    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner','Fixture BB-240','active')`,
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

  test("1440×900: mép trái bìa, lưới ảnh, chân trang lệch nhau ≤ 1px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLink}`);

    const tieuDeBia = page.locator("section[aria-label='Ảnh bìa'] h1");
    const tamDau = page.getByTestId("the-anh").first();
    const tieuDeChanTrang = page.locator("footer h2");

    await expect(tieuDeBia).toBeVisible();
    await expect(tamDau).toBeVisible();
    await expect(tieuDeChanTrang).toBeVisible();

    const xBia = (await tieuDeBia.boundingBox())!.x;
    const xLuoi = (await tamDau.boundingBox())!.x;
    const xChanTrang = (await tieuDeChanTrang.boundingBox())!.x;

    // eslint-disable-next-line no-console
    console.log(`[BB-240] mép trái 1440×900 — bìa=${xBia} lưới=${xLuoi} chân trang=${xChanTrang}`);

    // BB-258 — hoàn lại khẳng định chặt như trước BB-253: bìa tràn toàn màn,
    // bố cục quay về XẾP DỌC (không còn cột trái/phải), nên mép trái bìa/lưới
    // ảnh/chân trang lại phải lệch nhau ≤ 1px như công thức `khach-le-trai-lg`
    // gốc (xem `src/styles/tokens.css`).
    expect(Math.abs(xBia - xLuoi)).toBeLessThanOrEqual(1);
    expect(Math.abs(xChanTrang - xLuoi)).toBeLessThanOrEqual(1);
  });

  /**
   * Opus soát (25/09/2026): trên màn RỘNG HƠN 1600px công thức canh mép bìa
   * dùng `100vw` — tính cả thanh cuộn (~15–17px trên Windows), trong khi lưới
   * ảnh `mx-auto` canh theo bề rộng KHÔNG có thanh cuộn → chữ bìa lệch ~8px.
   * Ca 1440 không bắt được (dưới 1600px phần dư bằng 0). Nay dùng `100cqw`.
   */
  test("1920×1080 (có thanh cuộn): mép trái bìa và lưới ảnh lệch ≤ 1px", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/g/${maLink}`);
    const tieuDeBia = page.locator("section[aria-label='Ảnh bìa'] h1");
    const tamDau = page.getByTestId("the-anh").first();
    await expect(tieuDeBia).toBeVisible();
    await expect(tamDau).toBeVisible();
    const thanhCuon = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
    expect(thanhCuon).toBeGreaterThan(0);
    const xBia = (await tieuDeBia.boundingBox())!.x;
    const xLuoi = (await tamDau.boundingBox())!.x;
    // eslint-disable-next-line no-console
    console.log(`[BB-240] 1920 — thanh cuộn=${thanhCuon}px bìa=${xBia} lưới=${xLuoi}`);
    // BB-258 — hoàn lại khẳng định chặt như trước BB-253 (xem giải thích ở ca
    // 1440×900 phía trên).
    expect(Math.abs(xBia - xLuoi)).toBeLessThanOrEqual(1);
  });

  test("không còn 'Thành phần hợp đồng' hay 'Tổng cộng' trên màn khách", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLink}`);
    await expect(page.getByTestId("the-anh").first()).toBeVisible();

    await expect(page.getByText("Thành phần hợp đồng")).toHaveCount(0);
    await expect(page.getByText("Tổng cộng")).toHaveCount(0);

    // Hạn mức vẫn hiện, đúng điều ba mẹ dùng được (2-3: giữ lại).
    await expect(page.getByText(/Gói của ba mẹ gồm 10 ảnh chỉnh/)).toBeVisible();
  });

  test("chân trang: chi nhánh + nút nhắn tin cùng hàng ở máy tính, xếp dọc ở 375px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLink}`);
    await expect(page.getByTestId("the-anh").first()).toBeVisible();

    const footer = page.locator("footer");
    await footer.scrollIntoViewIfNeeded();
    const tenChiNhanh = footer.locator("p.font-display");
    const nutNhan = footer.getByRole("link", { name: "Nhắn cho studio" });

    if ((await nutNhan.count()) > 0) {
      const boxTen = (await tenChiNhanh.boundingBox())!;
      const boxNut = (await nutNhan.boundingBox())!;
      // Cùng một hàng: nút bắt đầu (top) TRƯỚC KHI khối tên/địa chỉ kết
      // thúc — nghĩa là chúng chồng lên nhau theo trục dọc (cùng hàng), chứ
      // không nối đuôi nhau như bố cục xếp dọc (đúng phần bù của điều kiện
      // "xếp dọc" đo ở 375px bên dưới).
      expect(boxNut.y).toBeLessThan(boxTen.y + boxTen.height);
      // Và nút nằm bên PHẢI khối tên/địa chỉ, không đè lên nhau.
      expect(boxNut.x).toBeGreaterThan(boxTen.x + boxTen.width / 2);
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.getByTestId("the-anh").first()).toBeVisible();
    await footer.scrollIntoViewIfNeeded();
    if ((await nutNhan.count()) > 0) {
      const boxTen2 = (await tenChiNhanh.boundingBox())!;
      const boxNut2 = (await nutNhan.boundingBox())!;
      // Xếp dọc: nút nằm HẲN bên dưới khối tên/địa chỉ.
      expect(boxNut2.y).toBeGreaterThanOrEqual(boxTen2.y + boxTen2.height);
    }
  });

  test("Lưu app: gợi ý hiện sau lần thả tim đầu, 'Để sau' thì tải lại không hiện nữa", async ({
    page,
  }) => {
    // Mỗi `test()` của Playwright dựng một context/trang MỚI — localStorage
    // trống sẵn, không cần tự xoá (addInitScript ở đây từng là lỗi: nó chạy
    // lại trước CẢ `page.reload()` bên dưới, xoá luôn timestamp "Để sau" vừa
    // ghi, khiến ca thử tự làm hỏng chính điều mình đang canh).
    //
    // Trạng thái "đã chọn" thì nằm ở SERVER (dùng chung `maLink` giữa các ca
    // thử trong tệp này), khác hẳn localStorage — dọn trước để tín hiệu
    // "thả tim tấm đầu" (0 -> >0) đúng nghĩa "tấm ĐẦU TIÊN", không bị ca thử
    // chạy trước để lại một tấm đã chọn từ trước.
    await pg.query("delete from selection_items where selection_id in (select id from selections where gallery_id = $1)", [galleryId]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLink}`);

    // Nút biểu tượng "Lưu app" cũ ở đầu trang phải KHÔNG còn.
    await expect(page.getByRole("button", { name: "Lưu app ra màn hình chính" })).toHaveCount(0);

    const tamDau = page.getByTestId("the-anh").first();
    await expect(tamDau).toBeVisible();
    await tamDau.getByRole("button", { name: "Chọn ảnh này" }).click();
    await expect(tamDau.getByRole("button", { name: "Bỏ chọn" })).toBeVisible();
    // Chờ lượt thả tim GHI XONG vào cơ sở dữ liệu trước khi đi tiếp: "Bỏ chọn"
    // hiện ngay nhờ cập nhật lạc quan, còn PATCH có thể tới máy chủ SAU khi ca
    // kế đã dọn dữ liệu — ca kế từng thấy sẵn 1 tấm đã chọn (Opus soát 25/09).
    await expect
      .poll(async () =>
        (await pg.query(
          "select count(*)::int n from selection_items si join selections s on s.id = si.selection_id where s.gallery_id = $1 and si.mark = 'selected'",
          [galleryId],
        )).rows[0].n as number, { timeout: 10_000 })
      .toBe(1);

    const goiY = page.getByRole("status", {
      name: "Lưu bộ ảnh ra màn hình điện thoại để mở lại chỉ bằng một chạm",
    });
    await expect(goiY).toBeVisible();
    // Opus soát (25/09): bản đầu trên máy tính đặt gợi ý góc dưới phải, ĐÈ LÊN
    // nút "Chốt danh sách" — E-1/E-2/E-8 không bấm được Chốt. Gợi ý và thanh
    // đáy không được chồng nhau, ở máy tính lẫn điện thoại.
    const khongChong = async () => {
      const a = (await goiY.boundingBox())!;
      const b = (await page.getByRole("button", { name: "Chốt danh sách" }).first().boundingBox())!;
      const chong = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(chong, `gợi ý ${JSON.stringify(a)} đè nút Chốt ${JSON.stringify(b)}`).toBe(false);
    };
    await khongChong();
    await page.setViewportSize({ width: 375, height: 812 });
    await khongChong();
    await page.setViewportSize({ width: 1440, height: 900 });

    await goiY.getByRole("button", { name: "Để sau" }).click();
    await expect(goiY).toBeHidden();

    await page.reload();
    await expect(page.getByTestId("the-anh").first()).toBeVisible();
    await page.waitForTimeout(500);
    await expect(
      page.getByRole("status", { name: "Lưu bộ ảnh ra màn hình điện thoại để mở lại chỉ bằng một chạm" }),
    ).toHaveCount(0);
  });

  test("Lưu app: 'Xem cách lưu' mở đúng tấm hướng dẫn có sẵn", async ({ page }) => {
    // Dọn lựa chọn còn sót từ ca thử trước — cùng lý do ghi ở ca "Để sau"
    // phía trên: trạng thái "đã chọn" nằm ở server, dùng chung `maLink`.
    await pg.query("delete from selection_items where selection_id in (select id from selections where gallery_id = $1)", [galleryId]);
    const soDaChonDb = async () =>
      (await pg.query(
        "select count(*)::int n from selection_items si join selections s on s.id = si.selection_id where s.gallery_id = $1 and si.mark = 'selected'",
        [galleryId],
      )).rows[0].n as number;
    await expect.poll(soDaChonDb, { timeout: 10_000 }).toBe(0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLink}`);

    const tamDau = page.getByTestId("the-anh").first();
    await expect(tamDau).toBeVisible();
    await tamDau.getByRole("button", { name: "Chọn ảnh này" }).click();

    const goiY = page.getByRole("status", {
      name: "Lưu bộ ảnh ra màn hình điện thoại để mở lại chỉ bằng một chạm",
    });
    await expect(goiY).toBeVisible();
    await goiY.getByRole("button", { name: "Xem cách lưu" }).click();

    await expect(page.getByRole("dialog", { name: "Lưu app ra màn hình chính" })).toBeVisible();
  });
});
