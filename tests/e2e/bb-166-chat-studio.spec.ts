import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";

function sha256(str: string) {
  return createHash("sha256").update(str).digest("hex");
}

test.describe("BB-166: Nút Nhắn cho studio", () => {
  let supabase: ReturnType<typeof createClient>;
  let pgClient: Client;
  let galleryId: string;
  let token: string;

  test.beforeAll(async () => {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    pgClient = new Client({
      connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    });
    await pgClient.connect();

    const { data: gallery } = await supabase.from("galleries").select("id").limit(1).single() as { data: { id: string } | null };
    if (!gallery) throw new Error("No gallery found");
    galleryId = gallery.id;

    token = `bb166-${randomUUID()}`;
    await pgClient.query(
      `INSERT INTO share_links (gallery_id, token_hash, token_prefix, role, status, requires_pin) VALUES ($1,$2,$3,'owner','active',false)`,
      [galleryId, sha256(token), token.slice(0, 6)]
    );
  });

  test.afterAll(async () => {
    if (token) {
      await pgClient.query(`DELETE FROM share_links WHERE token_prefix = $1`, [token.slice(0, 6)]);
    }
    await pgClient.end();
  });

  test("Hiển thị nút khi có cấu hình, ẩn khi không có hoặc sai, hiện khi đã chốt", async ({ page }) => {
    // 1. Có cấu hình hợp lệ
    await pgClient.query(`INSERT INTO settings (key, branch_id, value) VALUES ('chat.page_url', null, '"https://m.me/113878833349843"') ON CONFLICT (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO UPDATE SET value = EXCLUDED.value`);
    
    await page.goto(`/g/${token}`);
    
    // Đợi page load
    const chatLink = page.locator("a:has-text(\"Nhắn cho studio\")");
    await expect(chatLink).toBeVisible();
    await expect(chatLink).toHaveAttribute("href", "https://m.me/113878833349843");
    await expect(chatLink).toHaveAttribute("target", "_blank");
    const rel = await chatLink.getAttribute("rel");
    expect(rel).toContain("noopener");

    // 2. Cấu hình trống -> không có nút
    await pgClient.query(`UPDATE settings SET value = '""' WHERE key = 'chat.page_url' AND branch_id IS NULL`);
    await page.reload();
    await expect(page.locator("a:has-text(\"Nhắn cho studio\")")).toHaveCount(0);

    // 3. Cấu hình không bắt đầu bằng https:// -> không có nút
    await pgClient.query(`UPDATE settings SET value = '"http://m.me/123"' WHERE key = 'chat.page_url' AND branch_id IS NULL`);
    await page.reload();
    await expect(page.locator("a:has-text(\"Nhắn cho studio\")")).toHaveCount(0);

    // 4. Khóa không tồn tại -> không có nút
    await pgClient.query(`DELETE FROM settings WHERE key = 'chat.page_url' AND branch_id IS NULL`);
    await page.reload();
    await expect(page.locator("a:has-text(\"Nhắn cho studio\")")).toHaveCount(0);

    // 5. Cấu hình hợp lệ và bộ ảnh đã chốt -> nút vẫn hiện
    await pgClient.query(`INSERT INTO settings (key, branch_id, value) VALUES ('chat.page_url', null, '"https://m.me/113878833349843"')`);
    await pgClient.query(`UPDATE galleries SET status = 'submitted' WHERE id = $1`, [galleryId]);
    await page.reload();
    await expect(page.locator("a:has-text(\"Nhắn cho studio\")")).toBeVisible();

    // Revert status to keep fixture clean
    await pgClient.query(`UPDATE galleries SET status = 'in_review' WHERE id = $1`, [galleryId]);
  });
});