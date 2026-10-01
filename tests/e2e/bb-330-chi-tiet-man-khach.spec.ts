/**
 * BB-330 — màn khách, chi tiết nhỏ (30/09/2026).
 *
 *   1. Nút tải ở màn xem ảnh lớn mở thực đơn 3 lựa chọn như màn ngoài.
 *   2. Câu cảm ơn ở chân trang.
 *   3. Nút tròn "Lên đầu trang": chỉ hiện sau ~1,5 màn, không che thanh đáy,
 *      bấm thì về đầu trang.
 *   5. "Mời ông bà" có ở máy tính (và ở bộ ảnh đang chọn bình thường — hạn mức
 *      đã biết, chưa khoá — nơi trước đây thẻ bị kẹt sau cổng thông báo).
 *   6. Link mời ông bà: payload `navigator.share` (giả lập) và link đã chép là
 *      link TỚI BỘ ẢNH, và trang /g/<mã> không còn khai `og:url` = trang chủ.
 *
 * Dữ liệu: MỘT bộ ảnh "Fixture BB-330 …" (hạn mức 10, cho tải), xoá theo id
 * ở afterAll (AGENTS.md §6). Ảnh lh3 chặn ngay trên trình duyệt.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-330 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const SO_ANH = 40;

let pg: Client;
let galleryId = "";
let customerId = "";
let maLink = "";

test.beforeAll(async () => {
  pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();

  const { rows: br } = await pg.query(
    "select id from branches where name not like 'Fixture%' order by name limit 1",
  );
  const { rows: kh } = await pg.query(
    "insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id",
    [br[0].id, NHAN, `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`],
  );
  customerId = kh[0].id;

  // Hạn mức ĐÃ BIẾT (10) + chưa khoá = trạng thái chọn ảnh bình thường — đúng
  // ca mà thẻ "Mời ông bà" từng biến mất (kẹt sau cổng thông báo trạng thái).
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                            photo_count, included_quota, download_enabled)
     values ($1,$2,$3,'in_review',$4,'https://example.com/x',$5,10,true) returning id`,
    [br[0].id, customerId, NHAN, `fixture-bb330e2e-${runId}`, SO_ANH],
  );
  galleryId = g[0].id;

  for (let i = 1; i <= SO_ANH; i++) {
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
       values ($1,$2,$3,'image/jpeg',$4,'active',800,1200)`,
      [galleryId, `fixture-bb330e2e-${runId}-${i}`, `BB330_${String(i).padStart(3, "0")}.jpg`, i],
    );
  }

  maLink = randomBytes(32).toString("base64url");
  const { rows: lk } = await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'owner',$4,'active') returning id`,
    [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
  );
  await pg.query(
    "insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true)",
    [galleryId, lk[0].id],
  );
});

test.afterAll(async () => {
  if (galleryId) {
    await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
    await pg.query(
      "delete from selection_items where selection_id in (select id from selections where gallery_id = $1)",
      [galleryId],
    ).catch(() => undefined);
    await pg.query("delete from selections where gallery_id = $1", [galleryId]);
    await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
    await pg.query("delete from photos where gallery_id = $1", [galleryId]);
    await pg.query("delete from galleries where id = $1", [galleryId]);
  }
  if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
  await pg.end();
});

test.describe("BB-330: chi tiết màn khách", () => {
  // Máy chủ dev biên dịch route/chunk ở lượt đầu — ca đầu cần rộng giờ hơn 60s mặc định.
  test.describe.configure({ timeout: 120_000 });

  test("6 + 5: link mời ông bà (share + chép) là link bộ ảnh; og:url không trỏ trang chủ", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await chanLh3TrenTrinhDuyet(page);
    // Giả lập Web Share + clipboard ở BIÊN trình duyệt: ghi lại đúng payload.
    await page.addInitScript(() => {
      const w = window as unknown as { __share: unknown[]; __chep: string[] };
      w.__share = [];
      w.__chep = [];
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: unknown) => {
          w.__share.push(data);
        },
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (s: string) => {
            w.__chep.push(s);
          },
        },
      });
    });

    await page.goto(`/g/${maLink}`);
    // Lượt đầu của máy chủ dev còn biên dịch route — chờ lưới ảnh lên hẳn.
    await expect(page.getByAltText("Ảnh 1").first()).toBeVisible({ timeout: 45_000 });

    // Gốc lỗi: layout gốc khai og:url = trang chủ cho MỌI trang /g/<mã>.
    // Đọc thẳng DOM: `locator().getAttribute` sẽ CHỜ tới hết giờ khi thẻ không tồn tại (đúng ca đã vá).
    const ogUrl = await page.evaluate(
      () => document.querySelector('meta[property="og:url"]')?.getAttribute("content") ?? null,
    );
    const goc = new URL(page.url()).origin;
    expect(
      ogUrl === null || /\/g\//.test(ogUrl),
      `og:url của trang bộ ảnh đang là "${ogUrl}" — Zalo/Messenger sẽ mở trang chủ thay vì bộ ảnh`,
    ).toBe(true);

    await expect(page.getByText("Mời ông bà cùng xem")).toBeVisible();
    await page.getByRole("button", { name: "Mời", exact: true }).click();
    await page.getByPlaceholder("Ví dụ: Bà nội").fill("Bà nội");
    await page.getByRole("button", { name: "Tạo link" }).click();
    await expect(page.getByText("Đã tạo link cho")).toBeVisible();

    // BB-338: mỗi dòng "Đã mời" cũng có "Chia sẻ" — bấm nút của khối vừa tạo (đứng đầu).
    await page.getByRole("button", { name: "Chia sẻ" }).first().click();
    const share = (await page.evaluate(() => (window as unknown as { __share: { url?: string }[] }).__share)) ?? [];
    expect(share.length).toBe(1);
    const url = share[0]?.url ?? "";
    expect(url, "navigator.share phải mang link bộ ảnh").toMatch(/^https?:\/\/[^/]+\/g\/[A-Za-z0-9_-]{20,}$/);
    expect(url).not.toBe(`${goc}/`);
    expect(url).not.toContain(maLink); // link RIÊNG của ông bà, không phải link ba mẹ

    await page.getByRole("button", { name: "Sao chép link" }).click();
    const chep = await page.evaluate(() => (window as unknown as { __chep: string[] }).__chep);
    expect(chep).toEqual([url]);

    // Link đó mở ĐÚNG bộ ảnh (vai xem) ở phiên khác.
    const maOngBa = url.split("/g/")[1] ?? "";
    const { rows } = await pg.query(
      "select role from share_links where gallery_id = $1 and token_hash = $2",
      [galleryId, sha256(maOngBa)],
    );
    expect(rows.map((r) => r.role)).toEqual(["viewer"]);
  });

  test("5: thẻ Mời ông bà có ở máy tính 1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maLink}`);
    await expect(page.getByAltText("Ảnh 1").first()).toBeVisible({ timeout: 45_000 });
    const the = page.getByTestId("khoi-moi-ong-ba");
    await expect(the).toHaveCount(1);
    await the.scrollIntoViewIfNeeded();
    await expect(the.getByText("Mời ông bà cùng xem")).toBeVisible();
    await expect(the.getByRole("button", { name: "Mời", exact: true })).toBeVisible();
  });

  test("3 + 2: nút Lên đầu trang (390×844) — hiện sau 1,5 màn, không che thanh đáy, về đầu; câu cảm ơn", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maLink}`);
    await expect(page.getByAltText("Ảnh 1")).toBeVisible();

    const nut = page.getByRole("button", { name: "Lên đầu trang" });
    await expect(nut).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.2));
    await page.waitForTimeout(300);
    await expect(nut, "chưa tới 1,5 màn thì chưa hiện").toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.2));
    await expect(nut).toBeVisible();

    const hopNut = await nut.boundingBox();
    const hopThanh = await page.getByTestId("thanh-noi").locator("> div").boundingBox();
    expect(hopNut && hopThanh).toBeTruthy();
    // Không chồng: đáy nút phải nằm trên mép trên của thanh chọn/chốt.
    expect(hopNut!.y + hopNut!.height).toBeLessThanOrEqual(hopThanh!.y);
    // Góc dưới bên phải.
    expect(hopNut!.x + hopNut!.width).toBeGreaterThan(390 - 40);

    await nut.click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBe(0);
    await expect(nut).toHaveCount(0);

    await page.locator("footer").last().scrollIntoViewIfNeeded();
    await expect(page.getByText("Cảm ơn ba mẹ và các con đã yêu thương Bean ạ")).toBeVisible();
  });

  test("1: nút tải ở màn xem lớn mở thực đơn 3 lựa chọn", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await chanLh3TrenTrinhDuyet(page);
    await page.goto(`/g/${maLink}`);
    await expect(page.getByAltText("Ảnh 1")).toBeVisible();

    // Thả tim 1 tấm NGOÀI lưới để có lựa chọn "ảnh đã chọn".
    await page.getByLabel("Xem ảnh 2").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Chọn ảnh này" }).first().click();
    await expect(page.getByRole("button", { name: "Bỏ chọn" }).first()).toBeVisible();

    await page.getByLabel("Xem ảnh 2").click();
    await expect(page.getByTestId("chi-so-anh")).toBeVisible();

    // Nút tải NẰM TRONG màn xem lớn (không phải nút đầu trang phía sau lớp phủ).
    const nutTai = page.getByRole("dialog").getByRole("button", { name: "Tải ảnh về máy" });
    await expect(nutTai).toBeVisible();
    await nutTai.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Tải ảnh đang xem" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Tải cả bộ/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Tải \d+ ảnh đã chọn/ })).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveCount(3);
    // Mở thực đơn KHÔNG tải ngay, và màn xem lớn vẫn mở.
    await expect(page.getByTestId("chi-so-anh")).toBeVisible();
  });
});
