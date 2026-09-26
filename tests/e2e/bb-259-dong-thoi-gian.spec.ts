import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

/**
 * BB-259 — khối "Dòng thời gian hoạt động" ở màn chi tiết bộ ảnh quản trị.
 *
 * Nhân viên `cs` mở chi tiết một bộ Fixture có vài dòng nhật ký giả, phải
 * thấy khối, đúng thứ tự mới nhất trước, câu tiếng Việt đúng.
 */

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-259 E2E ${runId}`;
const email = `test_bb259_e2e_${runId}@demo.babybean.vn`;
const password = "Password123!";

test.describe("BB-259: Dòng thời gian hoạt động", () => {
  let client: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryId = "";

  const suKienAdmin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { data, error } = await suKienAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;

    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`,
      [userId, `${NHAN} Nhân viên`, email],
    );
    await client.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [
      userId,
      branchId,
    ]);

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: gal } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url)
       values ($1,$2,$3,'submitted',$4,'https://drive.google.com/fixture-bb259-e2e') returning id`,
      [branchId, customerId, `${NHAN} Bộ ảnh`, `fixture-bb259e2e-${runId}`],
    );
    galleryId = gal[0].id;

    const goc = Date.now() - 3 * 3600_000;
    const dong = (msSauGoc: number, hang: Record<string, unknown>) =>
      client.query(
        `insert into activity_logs (branch_id, actor_type, actor_id, actor_label, action, entity_type, entity_id, gallery_id, metadata, created_at)
         values ($1,$2,$3,$4,$5,'gallery',$6,$6,$7,$8)`,
        [
          branchId,
          hang.actorType,
          hang.actorId ?? null,
          hang.actorLabel ?? null,
          hang.action,
          galleryId,
          JSON.stringify(hang.metadata ?? {}),
          new Date(goc + msSauGoc).toISOString(),
        ],
      );

    // Cũ nhất → mới nhất, để kiểm chắc màn hình lật lại đúng thứ tự.
    await dong(0, {
      actorType: "staff",
      actorId: userId,
      actorLabel: "cs",
      action: "share_link.created",
      metadata: {},
    });
    await dong(60_000, {
      actorType: "customer",
      actorId: randomUUID(),
      actorLabel: "Khách chính",
      action: "selection.submit",
      metadata: { selectedCount: 12 },
    });
    await dong(120_000, {
      actorType: "staff",
      actorId: userId,
      actorLabel: "cs",
      action: "gallery.payment_recorded",
      metadata: { amount: 500000, method: "chuyen_khoan" },
    });
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) await client.query("delete from activity_logs where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (userId) await client.query("delete from staff_branches where staff_id = $1", [userId]);
      if (userId) await client.query("delete from staff_profiles where id = $1", [userId]);
      await client.end();
    }
    if (userId) await suKienAdmin().auth.admin.deleteUser(userId);
  });

  test("nhân viên cs thấy khối, đúng thứ tự mới nhất trước, câu tiếng Việt đúng", async ({ page }) => {
    await page.goto("/login");
    await page.waitForURL("**/login**");
    await page.getByLabel("Tên tài khoản hoặc email").fill(email);
    await page.getByLabel("Mật khẩu").fill(password);
    await page.getByRole("button", { name: /Đăng nhập/i }).click();
    await page.waitForURL("**/admin**");

    await page.goto(`/admin/galleries/${galleryId}`);

    const khoi = page.getByRole("heading", { name: "Dòng thời gian hoạt động" }).locator("..");
    await expect(khoi.getByText("Nhân viên ghi nhận thu 500.000đ")).toBeVisible();

    // Thứ tự MỚI NHẤT TRƯỚC: dòng tiền (mới nhất) phải nằm TRƯỚC dòng tạo link (cũ nhất).
    const chuoiVanBan = await khoi.innerText();
    const viTriTien = chuoiVanBan.indexOf("Nhân viên ghi nhận thu 500.000đ");
    const viTriChot = chuoiVanBan.indexOf("Ba mẹ chốt lựa chọn 12 tấm");
    const viTriLink = chuoiVanBan.indexOf("Nhân viên tạo link gửi khách");
    expect(viTriTien).toBeGreaterThanOrEqual(0);
    expect(viTriChot).toBeGreaterThan(viTriTien);
    expect(viTriLink).toBeGreaterThan(viTriChot);
  });
});
