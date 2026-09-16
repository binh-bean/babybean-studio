/**
 * BB-134 — phép thử tự động đi đúng đường của khách.
 *
 * OWNER: QA-BOT.
 *
 * Mở `/g/<mã>` bằng trình duyệt thật (Playwright + Chromium), kiểm tra:
 *   1. Ảnh TẢI ĐƯỢC THẬT (naturalWidth > 0) — điều kiện đã phát hiện lỗi hôm
 *      14.09.2026.
 *   2. Thả tim chọn ảnh → con số "Đã chọn" tăng từ 0 lên 1.
 *   3. Ảnh của bộ KHÁC bị chặn (403 FORBIDDEN).
 *
 * Dữ liệu tự dựng, mang nhãn runId riêng, dọn theo đúng nhãn của mình.
 * Fixture cũ hơn 1 giờ bị dọn tự động phòng tiến trình chết giữa chừng.
 *
 * Drive ảnh bị chặn ở tầng mạng bằng mock-drive-network.cjs (nạp vào dev
 * server qua --require). Tuyệt đối KHÔNG giả lập createAdminClient, Supabase
 * queries, cookie signing, hay bất kỳ tầng xét quyền nào.
 *
 * Kho mã nguồn công khai — không ảnh trẻ em thật, không tên khách thật.
 */

import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomUUID } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-134 ${runId}`;

// Thời gian tối đa chờ sản phẩm thật — ảnh cần fetch qua /api/img, dev server
// có thể biên dịch theo yêu cầu.
const IMAGE_TIMEOUT = 30_000;

// ── Helpers ────────────────────────────────────────────────────────────────────

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Dọn rác của lần chạy CŨ HƠN 1 GIỜ — không dọn fixture mới phòng tiến
 * trình song song (bài học BB-136).
 */
async function donRacCu(c: Client): Promise<void> {
  const cutoff = "now() - interval '1 hour'";

  // selection_items → selections → share_links → photos → galleries → shoots → customers
  await c.query(
    `DELETE FROM selection_items WHERE gallery_id IN
       (SELECT id FROM galleries WHERE title LIKE 'Fixture BB-134%' AND created_at < ${cutoff})`,
  );
  await c.query(
    `DELETE FROM selections WHERE gallery_id IN
       (SELECT id FROM galleries WHERE title LIKE 'Fixture BB-134%' AND created_at < ${cutoff})`,
  );
  await c.query(
    `DELETE FROM share_links WHERE gallery_id IN
       (SELECT id FROM galleries WHERE title LIKE 'Fixture BB-134%' AND created_at < ${cutoff})`,
  );
  await c.query(
    `DELETE FROM photos WHERE gallery_id IN
       (SELECT id FROM galleries WHERE title LIKE 'Fixture BB-134%' AND created_at < ${cutoff})`,
  );
  await c.query(
    `DELETE FROM galleries WHERE title LIKE 'Fixture BB-134%' AND created_at < ${cutoff}`,
  );
  await c.query(
    `DELETE FROM shoots WHERE customer_id IN
       (SELECT id FROM customers WHERE full_name LIKE 'Fixture BB-134%' AND created_at < ${cutoff})`,
  );
  await c.query(
    `DELETE FROM customers WHERE full_name LIKE 'Fixture BB-134%' AND created_at < ${cutoff}`,
  );
}

/** Dọn CHÍNH XÁC dữ liệu của lần chạy này (theo runId). */
async function donDep(c: Client, ids: FixtureIds): Promise<void> {
  // Xoá theo đúng thứ tự phụ thuộc
  if (ids.boA || ids.boB) {
    const boAll = [ids.boA, ids.boB].filter(Boolean);
    await c.query(`DELETE FROM selection_items WHERE gallery_id = ANY($1)`, [boAll]);
    await c.query(`DELETE FROM selections WHERE gallery_id = ANY($1)`, [boAll]);
    await c.query(`DELETE FROM share_links WHERE gallery_id = ANY($1)`, [boAll]);
    await c.query(`DELETE FROM photos WHERE gallery_id = ANY($1)`, [boAll]);
    await c.query(`DELETE FROM galleries WHERE id = ANY($1)`, [boAll]);
  }
  if (ids.shootA || ids.shootB) {
    const shootAll = [ids.shootA, ids.shootB].filter(Boolean);
    await c.query(`DELETE FROM shoots WHERE id = ANY($1)`, [shootAll]);
  }
  if (ids.khachA || ids.khachB) {
    const khachAll = [ids.khachA, ids.khachB].filter(Boolean);
    await c.query(`DELETE FROM customers WHERE id = ANY($1)`, [khachAll]);
  }
}

interface FixtureIds {
  branchId: string;
  khachA: string;
  khachB: string;
  shootA: string;
  shootB: string;
  boA: string;
  boB: string;
  anhA1: string;
  anhA2: string;
  anhB: string;
  maLink: string;
  linkId: string;
}

async function dungDuLieu(c: Client): Promise<FixtureIds> {
  // Chi nhánh có sẵn (đã seed)
  const { rows: br } = await c.query("SELECT id FROM branches ORDER BY name LIMIT 1");
  if (!br[0]) throw new Error("Cần ít nhất một chi nhánh — chạy npm run db:seed trước");
  const branchId = br[0].id as string;

  // ── Khách hàng ──────────────────────────────────────────────────────────
  const { rows: cA } = await c.query(
    `INSERT INTO customers (branch_id, full_name, phone)
     VALUES ($1, $2, $3) RETURNING id`,
    [branchId, `${NHAN} Khách A`, `0901${runId.slice(0, 6)}`],
  );
  const khachA = cA[0].id as string;

  const { rows: cB } = await c.query(
    `INSERT INTO customers (branch_id, full_name, phone)
     VALUES ($1, $2, $3) RETURNING id`,
    [branchId, `${NHAN} Khách B`, `0902${runId.slice(0, 6)}`],
  );
  const khachB = cB[0].id as string;

  // ── Buổi chụp ──────────────────────────────────────────────────────────
  const { rows: sA } = await c.query(
    `INSERT INTO shoots (branch_id, customer_id, shoot_date) VALUES ($1,$2,'2026-06-01') RETURNING id`,
    [branchId, khachA],
  );
  const shootA = sA[0].id as string;

  const { rows: sB } = await c.query(
    `INSERT INTO shoots (branch_id, customer_id, shoot_date) VALUES ($1,$2,'2026-07-01') RETURNING id`,
    [branchId, khachB],
  );
  const shootB = sB[0].id as string;

  // ── Bộ ảnh ─────────────────────────────────────────────────────────────
  const { rows: gA } = await c.query(
    `INSERT INTO galleries (branch_id, customer_id, shoot_id, title, status,
                            drive_folder_id, drive_folder_url, photo_count,
                            included_quota, extra_photo_price)
     VALUES ($1,$2,$3,$4,'ready',$5,'https://example.com/gia',2, 10, 50000)
     RETURNING id`,
    [branchId, khachA, shootA, `${NHAN} Bộ A`, `fixture-bb134-a-${runId}`],
  );
  const boA = gA[0].id as string;

  const { rows: gB } = await c.query(
    `INSERT INTO galleries (branch_id, customer_id, shoot_id, title, status,
                            drive_folder_id, drive_folder_url, photo_count,
                            included_quota, extra_photo_price)
     VALUES ($1,$2,$3,$4,'ready',$5,'https://example.com/gia',1, 10, 50000)
     RETURNING id`,
    [branchId, khachB, shootB, `${NHAN} Bộ B`, `fixture-bb134-b-${runId}`],
  );
  const boB = gB[0].id as string;

  // ── Ảnh ────────────────────────────────────────────────────────────────
  const { rows: pA1 } = await c.query(
    `INSERT INTO photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
     VALUES ($1,$2,'anh-a1.jpg','image/jpeg',1,'active',800,600) RETURNING id`,
    [boA, `fixture-bb134-drive-a1-${runId}`],
  );
  const anhA1 = pA1[0].id as string;

  const { rows: pA2 } = await c.query(
    `INSERT INTO photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
     VALUES ($1,$2,'anh-a2.jpg','image/jpeg',2,'active',800,600) RETURNING id`,
    [boA, `fixture-bb134-drive-a2-${runId}`],
  );
  const anhA2 = pA2[0].id as string;

  const { rows: pB } = await c.query(
    `INSERT INTO photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
     VALUES ($1,$2,'anh-b.jpg','image/jpeg',1,'active',800,600) RETURNING id`,
    [boB, `fixture-bb134-drive-b-${runId}`],
  );
  const anhB = pB[0].id as string;

  // ── Link chia sẻ (legacy: gắn theo bộ ảnh, không PIN) ────────────────
  const maLink = `bb134-${randomUUID()}`;
  const { rows: sl } = await c.query(
    `INSERT INTO share_links (gallery_id, token_hash, token_prefix, role, status, requires_pin)
     VALUES ($1,$2,$3,'owner','active',false) RETURNING id`,
    [boA, sha256(maLink), maLink.slice(0, 6)],
  );
  const linkId = sl[0].id as string;

  return { branchId, khachA, khachB, shootA, shootB, boA, boB, anhA1, anhA2, anhB, maLink, linkId };
}

// ── Test suite ─────────────────────────────────────────────────────────────────

test.describe("BB-134: đi đúng đường của khách", () => {
  let client: Client;
  let ids: FixtureIds;

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    await donRacCu(client);
    ids = await dungDuLieu(client);
  });

  test.afterAll(async () => {
    if (client) {
      await donDep(client, ids);
      await client.end();
    }
  });

  test("1. Ảnh TẢI ĐƯỢC THẬT: naturalWidth > 0", async ({ page }) => {
    // Mở trang gallery bằng link khách
    await page.goto(`/g/${ids.maLink}`);

    // Chờ ít nhất một thẻ img trỏ tới /api/img xuất hiện và tải xong thật
    const imgLocator = page.locator('img[src*="/api/img/"]').first();
    await imgLocator.waitFor({ state: "visible", timeout: IMAGE_TIMEOUT });

    // Chờ ảnh tải xong — naturalWidth > 0 chứng minh byte PNG thật đã về
    await expect.poll(
      async () => {
        return imgLocator.evaluate((el: HTMLImageElement) => el.naturalWidth);
      },
      { timeout: IMAGE_TIMEOUT, message: "Ảnh không tải được (naturalWidth vẫn là 0)" },
    ).toBeGreaterThan(0);
  });

  test("2. Thả tim → con số Đã chọn tăng từ 0 lên 1", async ({ page }) => {
    await page.goto(`/g/${ids.maLink}`);

    // Chờ ảnh nạp xong (tránh bấm khi lưới chưa sẵn sàng)
    const imgLocator = page.locator('img[src*="/api/img/"]').first();
    await imgLocator.waitFor({ state: "visible", timeout: IMAGE_TIMEOUT });
    await expect.poll(
      async () => imgLocator.evaluate((el: HTMLImageElement) => el.naturalWidth),
      { timeout: IMAGE_TIMEOUT },
    ).toBeGreaterThan(0);

    // Xác nhận ban đầu = 0 ảnh đã chọn
    // Block "1. Đã chọn" chứa span lớn hiển thị số
    const counterBlock = page.locator("text=1. Đã chọn").locator("..");
    const counter = counterBlock.locator("span.text-2xl");
    await expect(counter).toHaveText("0");

    // Bấm nút thả tim trên ảnh đầu tiên
    const heartBtn = page.locator('button[aria-label="Chọn ảnh này"]').first();
    await heartBtn.click();

    // Chờ counter tăng lên 1 (optimistic update + API response)
    await expect(counter).toHaveText("1", { timeout: 10_000 });
  });

  test("3. Ảnh của bộ KHÁC bị chặn (403)", async ({ page }) => {
    // Mở trang bộ A trước để có cookie phiên bb_gs
    await page.goto(`/g/${ids.maLink}`);
    const imgLocator = page.locator('img[src*="/api/img/"]').first();
    await imgLocator.waitFor({ state: "visible", timeout: IMAGE_TIMEOUT });

    // Dùng ngữ cảnh request của page (có cookie bb_gs) gọi ảnh của bộ B
    const res = await page.request.get(`/api/img/${ids.anhB}?w=400`);

    // Phải bị chặn — nếu được 200 thì chính là lỗ hổng phân quyền
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body?.error?.code).toBe("FORBIDDEN");
  });

  test("4. Cấp lại link (BB-157 & BB-148): mở link mới đè lên cookie cũ", async ({ page }) => {
    // 1. Mở trang bộ A bằng link cũ (có thể test trước đã mở, làm lại cho chắc)
    await page.goto(`/g/${ids.maLink}`);
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: IMAGE_TIMEOUT });

    // 2. Chắc chắn ảnh đầu tiên đã được chọn (nếu test 2 đã chọn thì giờ nó vẫn là 1, nếu không thì phải chọn)
    const counterBlock = page.locator("text=1. Đã chọn").locator("..");
    const counter = counterBlock.locator("span.text-2xl");
    let currentCount = "0";
    try {
      currentCount = await counter.innerText({ timeout: 2000 });
    } catch {
      // ignore
    }
    
    if (currentCount === "0") {
      const heartBtn = page.locator('button[aria-label="Chọn ảnh này"]').first();
      await heartBtn.click();
      await expect(counter).toHaveText("1", { timeout: 10_000 });
    }

    // 3. Cấp lại link mới bằng DB (như studio làm)
    const maLinkMoi = `bb134-new-${randomUUID()}`;
    const dbClient = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await dbClient.connect();
    // Vô hiệu hóa link cũ
    await dbClient.query(`UPDATE share_links SET status = 'revoked' WHERE id = $1`, [ids.linkId]);
    // Tạo link mới
    await dbClient.query(
      `INSERT INTO share_links (gallery_id, token_hash, token_prefix, role, status, requires_pin)
       VALUES ($1,$2,$3,'owner','active',false)`,
      [ids.boA, sha256(maLinkMoi), maLinkMoi.slice(0, 6)],
    );
    await dbClient.end();

    // 4. Khách mở link mới (ngay trên browser đang có cookie phiên cũ)
    await page.goto(`/g/${maLinkMoi}`);
    
    // Phải mở được, không bị văng ra "Link đã hết hạn" (BB-157)
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: IMAGE_TIMEOUT });

    // Ảnh đã chọn phải còn nguyên (BB-148)
    const counterMoi = page.locator("text=1. Đã chọn").locator("..").locator("span.text-2xl");
    await expect(counterMoi).toHaveText("1");
  });
});
