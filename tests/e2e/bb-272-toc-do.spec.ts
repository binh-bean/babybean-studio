/**
 * BB-272 — đo tốc độ màn khách trên bộ ảnh lớn (~1.235 tấm) và canh chống lùi.
 *
 * OWNER: QA-BOT (chỉ file này; sản phẩm do DEV-FE sửa theo số liệu).
 *
 * Dữ liệu: chỉ tạo "Fixture BB-272 …", xoá sạch ở afterAll — theo đúng mẫu
 * `tests/e2e/e11-bo-anh-lon.spec.ts`. `/api/img/**` đã được chặn ở tầng mạng
 * bởi `tests/fixtures/mock-drive-network.cjs` (nạp qua `--require` trong
 * `playwright.config.ts`) nên không có lượt gọi Drive thật nào — không cần
 * `page.route` thêm ở đây.
 *
 * Ngưỡng dưới đây RỘNG có chủ đích: mục tiêu là bắt được việc lỡ tay bỏ ảo
 * hoá lưới hoặc bỏ lazy-load (tăng vọt số nút DOM / số lượt gọi ảnh), không
 * phải khoá cứng một con số đẹp. Bảng đo TRƯỚC/SAU thật nằm trong báo cáo
 * bàn giao, không nằm trong file này.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page, Request as PwRequest, Response as PwResponse } from "@playwright/test";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-272 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Ngưỡng chống lùi — xem đầu file.
const NGUONG_THE_ANH_DOM = 260; // ảo hoá tốt: chỉ vài chục tấm quanh khung nhìn
const NGUONG_GOI_ANH_5S = 40; // lượt gọi /api/img trong 5 giây đầu

async function batLongTasks(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __btLongTasks: number[] }).__btLongTasks = [];
    try {
      const po = new PerformanceObserver((list: PerformanceObserverEntryList) => {
        for (const e of list.getEntries()) {
          (window as unknown as { __btLongTasks: number[] }).__btLongTasks.push(e.duration);
        }
      });
      po.observe({ type: "longtask", buffered: true });
    } catch {
      // Trình duyệt không hỗ trợ longtask — bỏ qua, không chặn phép thử.
    }
  });
}

async function docLongTasks(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as unknown as { __btLongTasks?: number[] }).__btLongTasks ?? []);
}

test.describe("BB-272: tốc độ màn khách, bộ ảnh lớn", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    await client.query(`delete from galleries where title like 'Fixture BB-272%' and created_at < now() - interval '6 hours'`);
    await client.query(`delete from customers where full_name like 'Fixture BB-272%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',1235,10,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-bb272-${runId}`],
    );
    galleryId = g[0].id;

    // Ảnh bìa (đứng đầu, sort_index thấp nhất) + 1.235 ảnh lưới — khớp cỡ lớn
    // nhất chủ studio nêu trong brief.
    await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       select $1, 'bb272-' || $2 || '-' || x, 'BB272_' || lpad(x::text, 4, '0') || '.jpg', 'image/jpeg', x, 'active'
       from generate_series(1, 1235) as x`,
      [galleryId, runId],
    );

    maLink = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      await client.end();
    }
  });

  async function doMotLan(page: Page, nhan: string) {
    let loi = "";
    page.on("pageerror", (e: Error) => {
      loi += `${e.message}\n`;
    });

    const goiAnh: number[] = [];
    const t0 = Date.now();
    page.on("request", (req: PwRequest) => {
      if (req.url().includes("/api/img/")) goiAnh.push(Date.now() - t0);
    });

    const jsBytes: number[] = [];
    page.on("response", async (res: PwResponse) => {
      const ct = res.headers()["content-type"] || "";
      if (ct.includes("javascript") && res.request().resourceType() === "script") {
        try {
          const b = await res.body();
          jsBytes.push(b.length);
        } catch {
          // response có thể đã bị huỷ (điều hướng) — bỏ qua, không phải số đo chính.
        }
      }
    });

    await batLongTasks(page);

    const tTaiTrang0 = Date.now();
    await page.goto(`/g/${maLink}`);

    // Bìa hiện: ảnh bìa dùng fetchpriority="high", chỉ có ĐÚNG MỘT tấm dùng
    // thuộc tính này trên trang (xem `bia-bo-anh.tsx`) — mốc ổn định, không
    // cần thêm data-testid mới.
    const anhBia = page.locator('img[fetchpriority="high"]');
    await anhBia.first().waitFor({ state: "visible", timeout: 30000 });
    const msBiaHien = Date.now() - tTaiTrang0;

    const theAnh = page.getByTestId("the-anh");

    // Cuộn tới lưới bằng bánh xe chuột, giống `e11-bo-anh-lon.spec.ts` — tránh
    // phụ thuộc vào nhãn nút "bắt đầu chọn" (tiếng Việt, có thể đổi).
    const tCuon0 = Date.now();
    let msTheDauTien = -1;
    for (let i = 0; i < 100; i++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(30);
      if (await theAnh.first().isVisible().catch(() => false)) {
        msTheDauTien = Date.now() - tCuon0;
        break;
      }
    }
    expect(msTheDauTien).toBeGreaterThan(-1);

    // Số the-anh trong DOM ngay khi vừa vào lưới — số này CAO nghĩa là ảo hoá
    // không chạy (đang dựng cả bộ thay vì chỉ khung nhìn).
    const soTheDom = await theAnh.count();

    // Cuộn nhanh để đo tác vụ chặn dài (long tasks).
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(15);
    }
    await page.waitForTimeout(200);
    const longTasks = await docLongTasks(page);
    const tacVuChanDaiNhat = longTasks.length ? Math.max(...longTasks) : 0;

    await page.waitForTimeout(Math.max(0, 5000 - (Date.now() - t0)));
    const soGoiAnh5s = goiAnh.filter((t) => t <= 5000).length;

    const tongKbJs = Math.round(jsBytes.reduce((a, b) => a + b, 0) / 1024);

    // eslint-disable-next-line no-console
    console.log(
      `[BB-272][${nhan}] bìa=${msBiaHien}ms | thẻ đầu=${msTheDauTien}ms | ` +
        `the-anh DOM=${soTheDom} | gọi /api/img (5s)=${soGoiAnh5s} | ` +
        `tác vụ chặn dài nhất=${tacVuChanDaiNhat.toFixed(0)}ms | JS tải về≈${tongKbJs}KB`,
    );

    expect(loi).toBe("");

    return { msBiaHien, msTheDauTien, soTheDom, soGoiAnh5s, tacVuChanDaiNhat, tongKbJs };
  }

  test("điện thoại 390×844, CPU chậm 4×", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const session = await page.context().newCDPSession(page);
    try {
      await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    } catch {
      // CDP không sẵn (trình duyệt khác chromium) — đo không throttle.
    }

    const ketQua = await doMotLan(page, "điện thoại 4×");
    expect(ketQua.soTheDom).toBeLessThan(NGUONG_THE_ANH_DOM);
    expect(ketQua.soGoiAnh5s).toBeLessThan(NGUONG_GOI_ANH_5S);
  });

  test("máy tính 1440×900", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const ketQua = await doMotLan(page, "máy tính");
    expect(ketQua.soTheDom).toBeLessThan(NGUONG_THE_ANH_DOM);
    expect(ketQua.soGoiAnh5s).toBeLessThan(NGUONG_GOI_ANH_5S);
  });
});
