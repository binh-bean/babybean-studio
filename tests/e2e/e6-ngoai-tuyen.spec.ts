/**
 * E-6: Ngắt mạng giữa lúc chọn ảnh (docs/10-testing-qa.md §5, BB-232).
 *
 * OWNER: QA-BOT (đây là DEV-FE viết thay, đúng đường mà `tests/e2e/**`
 * cho phép R — chỉ QA-BOT mới W; nếu QA-BOT có bản khác, hai bên đối chiếu
 * trước khi merge). Kịch bản gốc: "Ngắt mạng giữa lúc chọn ảnh → chọn tiếp
 * 3 ảnh → thấy 'Chưa lưu' → nối mạng → tự đồng bộ → reload vẫn đủ."
 */

import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-232 E6 ${runId}`;

const CHO_ANH = 30_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const ANH = Array.from({ length: 6 }, (_, i) => ({
  ten: `E6_${String(i + 1).padStart(4, "0")}.jpg`,
  idx: i + 1,
}));

test.describe("E-6: Ngắt mạng giữa lúc chọn ảnh", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    // Dọn rác của những lần chạy hỏng dở trước đó.
    await client.query(`delete from galleries where title like 'Fixture BB-232%' and created_at < now() - interval '1 hour'`);
    await client.query(`delete from customers where full_name like 'Fixture BB-232%' and created_at < now() - interval '1 hour'`);

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`]
    );
    customerId = kh[0].id;

    // Hạn mức rộng (10) — E-6 canh hàng chờ ngoại tuyến, không canh vượt hạn
    // mức (đó là việc của e2-vuot-han-muc.spec.ts).
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',$5,10,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-e6-${runId}`, ANH.length]
    );
    galleryId = g[0].id;

    for (const a of ANH) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `e6-${runId}-${a.ten}`, a.ten, a.idx]
      );
    }

    maLink = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)]
    );
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
      // selections phải đi trước galleries — thiếu dòng này là bộ ảnh thử ở lại
      // trong cơ sở dữ liệu thật (xem tests/e2e/e12-dien-thoai.spec.ts).
      if (galleryId) await client.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      await client.end();
    }
  });

  test("Mất mạng giữa lúc chọn → chọn tiếp 3 ảnh → 'Chưa lưu' → nối mạng → tự đồng bộ → reload vẫn đủ", async ({
    page,
    context,
  }) => {
    await page.goto(`/g/${maLink}`);

    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    const nutChon = page.locator('button[aria-label="Chọn ảnh này"]');
    const dem = page.getByTestId("dem-da-chon");

    // Thả tim tấm đầu tiên LÚC CÒN MẠNG — canh rằng đường bình thường (không
    // ngắt mạng) không bị BB-232 đụng vào.
    await nutChon.first().click();
    await expect(dem).toHaveText("1", { timeout: 10_000 });
    await expect(page.getByTestId("chua-luu")).toHaveCount(0);

    // Ngắt mạng NGAY GIỮA LÚC CHỌN.
    await context.setOffline(true);

    // Chọn tiếp 3 ảnh trong lúc mất mạng.
    for (let i = 0; i < 3; i++) {
      await nutChon.first().click();
    }

    // Bộ đếm vẫn nhích lên đủ 4 — optimistic update không đợi máy chủ.
    await expect(dem).toHaveText("4", { timeout: 10_000 });
    // Và ba mẹ THẤY "Chưa lưu" — không phải im lặng như trước BB-232.
    const chuaLuu = page.getByTestId("chua-luu");
    await expect(chuaLuu).toBeVisible();
    await expect(chuaLuu).toContainText("Chưa lưu");

    // Nối mạng lại — hàng chờ tự gửi qua sự kiện 'online', không cần bấm gì.
    await context.setOffline(false);
    await expect(chuaLuu).toBeHidden({ timeout: 15_000 });

    // Trong CƠ SỞ DỮ LIỆU: đủ 4 tấm mark='selected'.
    await expect
      .poll(
        async () => {
          const { rows } = await client.query(
            `select count(*)::int n from selection_items where gallery_id = $1 and mark = 'selected'`,
            [galleryId]
          );
          return rows[0]?.n;
        },
        { timeout: 15_000, message: "Hàng chờ chưa gửi đủ 4 tấm vào cơ sở dữ liệu" }
      )
      .toBe(4);

    // Tải lại trang — vẫn đủ 4, không mất về tay không (localStorage đã bù
    // trong lúc gửi, nhưng ở đây quan trọng hơn là dữ liệu đã THẬT SỰ ở máy
    // chủ nên reload đọc lại đúng từ đó).
    await page.reload();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });
    await expect(dem).toHaveText("4", { timeout: 10_000 });
    await expect(page.getByTestId("chua-luu")).toHaveCount(0);
  });

  test("Mất mạng, chọn thêm 2 ảnh, RELOAD ngay khi vẫn còn mất mạng", async ({ page, context }) => {
    await page.goto(`/g/${maLink}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    // Nối tiếp ca trước: 4/6 tấm đã chọn và đã gửi lên máy chủ. Chọn thêm 2
    // tấm cuối trong lúc mất mạng.
    await context.setOffline(true);
    const nutChon = page.locator('button[aria-label="Chọn ảnh này"]');
    await nutChon.first().click();
    await nutChon.first().click();
    await expect(page.getByTestId("chua-luu")).toBeVisible({ timeout: 10_000 });

    // RELOAD trong lúc VẪN mất mạng. `context.setOffline` của Playwright chặn
    // TOÀN BỘ request mạng — kể cả request điều hướng lấy tài liệu HTML, không
    // riêng API — nên trang có thể không tải được gì cả (không giống mất mạng
    // thật ngoài đời, nơi trình duyệt còn phục vụ HTML/JS đã cache). Đề bài
    // BB-232 cho phép bỏ ca này nếu rơi vào đúng cảnh đó; ghi rõ lý do bằng
    // test.skip thay vì để test đỏ vì một giới hạn của công cụ, không phải
    // của mã đang kiểm.
    let taiLaiDuoc = true;
    try {
      await page.reload({ timeout: 8_000 });
      await page.waitForSelector('img[src*="/api/img/"]', { state: "visible", timeout: 8_000 });
    } catch {
      taiLaiDuoc = false;
    }

    if (!taiLaiDuoc) {
      await context.setOffline(false);
      test.skip(
        true,
        "Reload khi context.setOffline(true) chặn luôn request tài liệu HTML — trang trắng, không phải lỗi của hàng chờ. Bỏ ca này theo đúng lối thoát BB-232 cho phép."
      );
      return;
    }

    // Trang tải được (ví dụ phục vụ từ cache Service Worker nào đó) — khi đó
    // hàng chờ (đọc lại từ localStorage) VẪN phải còn nguyên 2 tấm.
    await expect(page.getByTestId("chua-luu")).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByTestId("chua-luu")).toBeHidden({ timeout: 15_000 });

    await expect
      .poll(
        async () => {
          const { rows } = await client.query(
            `select count(*)::int n from selection_items where gallery_id = $1 and mark = 'selected'`,
            [galleryId]
          );
          return rows[0]?.n;
        },
        { timeout: 15_000 }
      )
      .toBe(6);
  });

  /**
   * Opus soát BB-232 (25/09/2026): máy chủ TỪ CHỐI HẲN lô gửi lại (bộ ảnh bị
   * khoá trong lúc ba mẹ mất mạng) thì hàng chờ không được kẹt mãi — bản đầu
   * giữ lô lại vĩnh viễn: "Chưa lưu" không bao giờ tắt, tim lệch dữ liệu thật,
   * nút Chốt bị chặn với câu báo "mất mạng" sai.
   */
  test("Máy chủ từ chối lô gửi lại (bộ ảnh bị khoá lúc mất mạng) → hàng chờ thông, báo, tim khớp lại", async ({
    page,
    context,
  }) => {
    const soTruoc = async () =>
      (
        await client.query(
          `select count(*)::int n from selection_items where gallery_id = $1 and mark = 'selected'`,
          [galleryId],
        )
      ).rows[0].n as number;
    // Ca trước có thể đã chọn hết 6 tấm — bắt đầu từ trắng (chỉ dữ liệu Fixture).
    await client.query(`delete from selections where gallery_id = $1`, [galleryId]);
    const truocDb = await soTruoc();

    await page.goto(`/g/${maLink}`);
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_ANH });
    const dem = page.getByTestId("dem-da-chon");
    await expect(dem).not.toHaveText("", { timeout: 10_000 });
    // Bộ đếm trên màn có thể khác số dòng selection_items (ca trước để lại) —
    // canh "KHÔNG ĐỔI so với trước", mỗi bên so với chính nó.
    const truoc = Number(await dem.textContent());

    await context.setOffline(true);
    await page.locator('button[aria-label="Chọn ảnh này"]').first().click();
    await expect(dem).toHaveText(String(truoc + 1), { timeout: 10_000 });
    await expect(page.getByTestId("chua-luu")).toBeVisible();

    // CSKH khoá bộ ảnh trong lúc ba mẹ đang mất mạng.
    await client.query(`update galleries set status = 'in_retouch' where id = $1`, [galleryId]);
    try {
      await context.setOffline(false);
      await expect(page.getByTestId("chua-luu")).toBeHidden({ timeout: 20_000 });
      await expect(page.getByText(/chưa lưu được/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(dem).toHaveText(String(truoc), { timeout: 15_000 });
      expect(await soTruoc()).toBe(truocDb);
    } finally {
      await client.query(`update galleries set status = 'ready' where id = $1`, [galleryId]);
    }
  });
});
