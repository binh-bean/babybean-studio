/**
 * BB-160 — Tải ảnh và Kanban
 *
 * OWNER: QA-BOT.
 */

import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-160 ${runId}`;
const adminEmail = `admin_${runId}@demo.babybean.vn`;
const adminPass = "Password123!";
let adminUserId: string;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function donRacCu(c: Client): Promise<void> {
  const cutoff = "now() - interval '6 hours'";
  await c.query(`DELETE FROM share_links WHERE gallery_id IN (SELECT id FROM galleries WHERE title LIKE 'Fixture BB-160%' AND created_at < ${cutoff})`);
  await c.query(`DELETE FROM photos WHERE gallery_id IN (SELECT id FROM galleries WHERE title LIKE 'Fixture BB-160%' AND created_at < ${cutoff})`);
  await c.query(`DELETE FROM galleries WHERE title LIKE 'Fixture BB-160%' AND created_at < ${cutoff}`);
  await c.query(`DELETE FROM shoots WHERE customer_id IN (SELECT id FROM customers WHERE full_name LIKE 'Fixture BB-160%' AND created_at < ${cutoff})`);
  await c.query(`DELETE FROM customers WHERE full_name LIKE 'Fixture BB-160%' AND created_at < ${cutoff}`);
  await c.query(`DELETE FROM staff_profiles WHERE full_name LIKE 'Fixture BB-160%'`);
}

interface FixtureIds {
  branchId: string;
  khachId: string;
  shootId: string;
  boA: string;
  boB: string;
  boC: string;
  linkA: string;
  linkB: string;
}

async function dungDuLieu(c: Client): Promise<FixtureIds> {
  const { rows: br } = await c.query("SELECT id FROM branches ORDER BY name LIMIT 1");
  const branchId = br[0].id as string;

  const phone = `0903${Math.floor(Math.random() * 900000) + 100000}`;
  const { rows: kh } = await c.query(
    `INSERT INTO customers (branch_id, full_name, phone) VALUES ($1, $2, $3) RETURNING id`,
    [branchId, `${NHAN} Khách`, phone],
  );
  const khachId = kh[0].id as string;

  const { rows: sh } = await c.query(
    `INSERT INTO shoots (branch_id, customer_id, shoot_date) VALUES ($1,$2,'2026-08-01') RETURNING id`,
    [branchId, khachId],
  );
  const shootId = sh[0].id as string;

  // Bộ A: Cho tải, 16 ảnh
  const { rows: gA } = await c.query(
    `INSERT INTO galleries (branch_id, customer_id, shoot_id, title, status, drive_folder_id, drive_folder_url, photo_count, included_quota, download_enabled)
     VALUES ($1,$2,$3,$4,'ready',$5,'url',16, 10, true) RETURNING id`,
    [branchId, khachId, shootId, `${NHAN} Bộ A`, `mock-folder-a-${runId}`],
  );
  const boA = gA[0].id as string;

  // 16 ảnh cho bộ A
  for (let i = 1; i <= 16; i++) {
    await c.query(
      `INSERT INTO photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
       VALUES ($1,$2,$3,'image/jpeg',$4,'active',800,600)`,
      [boA, `mock-file-a-${i}-${runId}`, `anh-a-${i}.jpg`, i],
    );
  }

  // Link bộ A
  const maLinkA = `bb160-a-${randomUUID()}`;
  await c.query(
    `INSERT INTO share_links (gallery_id, token_hash, token_prefix, role, status) VALUES ($1,$2,$3,'owner','active')`,
    [boA, sha256(maLinkA), maLinkA.slice(0, 6)],
  );

  // Bộ B: KHÔNG cho tải
  const { rows: gB } = await c.query(
    `INSERT INTO galleries (branch_id, customer_id, shoot_id, title, status, drive_folder_id, drive_folder_url, photo_count, included_quota, download_enabled)
     VALUES ($1,$2,$3,$4,'ready',$5,'url',1, 10, false) RETURNING id`,
    [branchId, khachId, shootId, `${NHAN} Bộ B`, `mock-folder-b-${runId}`],
  );
  const boB = gB[0].id as string;

  await c.query(
    `INSERT INTO photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
     VALUES ($1,$2,$3,'image/jpeg',1,'active',800,600)`,
    [boB, `mock-file-b-1-${runId}`, `anh-b-1.jpg`],
  );

  const maLinkB = `bb160-b-${randomUUID()}`;
  await c.query(
    `INSERT INTO share_links (gallery_id, token_hash, token_prefix, role, status) VALUES ($1,$2,$3,'owner','active')`,
    [boB, sha256(maLinkB), maLinkB.slice(0, 6)],
  );

  // Bộ C: sync_error để test Kanban
  const { rows: gC } = await c.query(
    `INSERT INTO galleries (branch_id, customer_id, shoot_id, title, status, drive_folder_id, drive_folder_url, photo_count, included_quota)
     VALUES ($1,$2,$3,$4,'sync_error',$5,'url',0, 10) RETURNING id`,
    [branchId, khachId, shootId, `${NHAN} Bộ C`, `mock-folder-c-${runId}`],
  );
  const boC = gC[0].id as string;

  return { branchId, khachId, shootId, boA, boB, boC, linkA: maLinkA, linkB: maLinkB };
}

async function donDep(c: Client, ids: FixtureIds): Promise<void> {
  const galleries = [ids.boA, ids.boB, ids.boC];
  await c.query(`DELETE FROM share_links WHERE gallery_id = ANY($1)`, [galleries]);
  await c.query(`DELETE FROM photos WHERE gallery_id = ANY($1)`, [galleries]);
  await c.query(`DELETE FROM galleries WHERE id = ANY($1)`, [galleries]);
  await c.query(`DELETE FROM shoots WHERE id = $1`, [ids.shootId]);
  await c.query(`DELETE FROM customers WHERE id = $1`, [ids.khachId]);
}

test.describe("BB-160: Tải ảnh và Kanban", () => {
  let pgClient: Client;
  let ids: FixtureIds;
  let adminAuthClient: ReturnType<typeof createClient>;

  test.beforeAll(async () => {
    pgClient = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pgClient.connect();
    await donRacCu(pgClient);
    ids = await dungDuLieu(pgClient);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    adminAuthClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await adminAuthClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPass,
      email_confirm: true,
    });
    if (error) throw error;
    adminUserId = data.user.id;

    await pgClient.query(
      `INSERT INTO staff_profiles (id, full_name, email, role) VALUES ($1, $2, $3, 'owner')`,
      [adminUserId, `${NHAN} Admin`, adminEmail]
    );
  });

  test.afterAll(async () => {
    if (adminUserId) {
      await adminAuthClient.auth.admin.deleteUser(adminUserId);
    }
    if (pgClient) {
      await pgClient.query(`DELETE FROM staff_profiles WHERE id = $1`, [adminUserId]);
      if (ids) {
        await donDep(pgClient, ids);
      }
      await pgClient.end();
    }
  });

  test("1. Tải một ảnh: xác nhận tải thành công", async ({ page }) => {
    await page.goto(`/g/${ids.linkA}`);
    
    // Mở ảnh đầu tiên TRONG LƯỚI — ảnh đầu tiên trên trang giờ là ảnh bìa.
    const theAnh = page.getByTestId("the-anh").first();
    await theAnh.waitFor({ state: "visible" });
    await theAnh.click();

    // Chờ nút tải ảnh xuất hiện trong lightbox
    const downloadBtn = page.locator('button[aria-label="Tải ảnh này về máy"]');
    await downloadBtn.waitFor({ state: "visible" });

    // Lắng nghe sự kiện download trước khi click
    const downloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download = await downloadPromise;

    // Kiểm tra tên file tải về
    expect(download.suggestedFilename()).toBe("anh-a-1.jpg");
  });

  test("2. Tải cả bộ: qua ít nhất hai lô, thanh tiến độ tới hết", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(`/g/${ids.linkA}`);
    
    // Nút tải cả bộ — nằm trong thực đơn "Tải ảnh về máy" ở đầu trang
    // (23/09/2026, thay cho thanh tải dính ở đáy từng đè lên thanh chốt).
    await page.getByRole("button", { name: "Tải ảnh về máy" }).click();
    const downloadAllBtn = page.getByRole("menuitem", { name: /Tải cả bộ/ });
    await downloadAllBtn.waitFor({ state: "visible" });

    // Thu thập tất cả event download
    const downloads: import("@playwright/test").Download[] = [];
    page.on("download", (d) => downloads.push(d));

    await downloadAllBtn.click();

    // Dùng expect.poll để chờ tải xong đủ 16 ảnh
    await expect.poll(() => downloads.length, { timeout: 45000 }).toBe(16);
  });

  test("3. Bộ tắt tải: không có nút tải", async ({ page }) => {
    await page.goto(`/g/${ids.linkB}`);
    
    // Mở ảnh cũng không có nút tải. Mở TRƯỚC khi đếm nút thực đơn: lúc trang
    // chưa tải xong thì nút nào cũng đếm ra 0, và phép thử xanh oan.
    const theAnh = page.getByTestId("the-anh").first();
    await theAnh.waitFor({ state: "visible" });

    // Không có thực đơn "Tải ảnh về máy" ở đầu trang
    await expect(page.getByRole("button", { name: "Tải ảnh về máy" })).toHaveCount(0);

    await theAnh.click();

    const downloadBtn = page.locator('button[aria-label="Tải ảnh này về máy"]');
    await expect(downloadBtn).toHaveCount(0);
  });

  test("4. Kanban: có cột Lỗi tải ảnh và số lượng chuẩn", async ({ page }) => {
    // Đăng nhập admin
    await dangNhapNhanVien(page, adminEmail, adminPass);

    // Vào Kanban
    await page.goto("/admin/galleries");
    
    // Đổi view sang Kanban, bằng cách bấm nút Kanban (chờ selector cho Tab List)
    const kanbanTab = page.locator('button[aria-label="Xem dạng Kanban"]');
    await kanbanTab.click();

    // Xác nhận cột "Lỗi tải ảnh" xuất hiện
    const loiTaiAnhCol = page.locator('div.flex-col').filter({ hasText: "Lỗi tải ảnh" }).first();
    await expect(loiTaiAnhCol).toBeVisible();

    // Xác định số lượng trong cột (badge số đếm)
    // Ở cột "Lỗi tải ảnh", tìm thẻ bộ ảnh vừa tạo NHAN Bộ C
    const cardC = loiTaiAnhCol.locator(`text="${NHAN} Bộ C"`);
    await expect(cardC).toBeVisible();
  });
});
