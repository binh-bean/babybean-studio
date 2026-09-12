import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

describe("BB-115: Ghi nhận thanh toán phát sinh (gallery_payments)", () => {
  let client: Client;

  let branchAId: string;
  let branchBId: string;
  let customerId: string;

  let staffOwnerId: string;
  let staffManagerAId: string;
  let staffCsAId: string;
  let staffAccountantId: string;
  let staffPhotographerAId: string;
  let staffCtvId: string;

  const createdGalleryIds: string[] = [];
  const createdStaffIds: string[] = [];

  beforeAll(async () => {
    client = new Client({
      connectionString: process.env.SUPABASE_DB_URL,
    });
    await client.connect();

    // 1. Chi nhánh
    const { rows: branches } = await client.query("SELECT id FROM branches ORDER BY name LIMIT 2");
    if (branches.length < 2) throw new Error("Cần ít nhất 2 chi nhánh trong DB");
    branchAId = branches[0].id;
    branchBId = branches[1].id;

    // 2. Khách hàng
    const { rows: custs } = await client.query("SELECT id FROM customers LIMIT 1");
    if (custs.length === 0) throw new Error("Cần ít nhất 1 khách hàng trong DB");
    customerId = custs[0].id;

    // 3. Tạo nhân viên mẫu cho từng vai trò
    async function createStaffUser(role: string, branchId?: string): Promise<string> {
      const uid = randomUUID();
      createdStaffIds.push(uid);

      await client.query(`
        INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        VALUES ($1::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                'fixture.' || $1::text || '@babybeanstudio.vn', '', now(), now(), now())
      `, [uid]);

      await client.query(`
        INSERT INTO staff_profiles (id, full_name, email, role, is_active)
        VALUES ($1::uuid, 'Fixture ' || $2::text, 'fixture.' || $1::text || '@babybeanstudio.vn', $2::staff_role, true)
      `, [uid, role]);

      if (branchId) {
        await client.query(`
          INSERT INTO staff_branches (staff_id, branch_id) VALUES ($1::uuid, $2::uuid)
        `, [uid, branchId]);
      }
      return uid;
    }

    staffOwnerId = await createStaffUser("owner");
    staffManagerAId = await createStaffUser("branch_manager", branchAId);
    staffCsAId = await createStaffUser("cs", branchAId);
    staffAccountantId = await createStaffUser("accountant", branchAId);
    staffPhotographerAId = await createStaffUser("photographer", branchAId);
    staffCtvId = await createStaffUser("photoshop_ctv", branchAId);
  });

  afterAll(async () => {
    if (createdGalleryIds.length > 0) {
      await client.query("DELETE FROM galleries WHERE id = ANY($1::uuid[])", [createdGalleryIds]);
    }
    if (createdStaffIds.length > 0) {
      await client.query("DELETE FROM staff_branches WHERE staff_id = ANY($1::uuid[])", [createdStaffIds]);
      await client.query("DELETE FROM staff_profiles WHERE id = ANY($1::uuid[])", [createdStaffIds]);
      await client.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [createdStaffIds]);
    }
    await client.end();
  });

  async function createGalleryWithSubmittedSelection(options: {
    branchId: string;
    snapshotExtraAmount: number;
  }): Promise<{ galleryId: string; selectionId: string }> {
    const gid = randomUUID();
    createdGalleryIds.push(gid);

    await client.query(`
      INSERT INTO galleries (id, branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, included_quota, extra_photo_price)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'Gallery BB-115 Test', 'submitted', 'fixture-' || $1::text, 'https://drive.google.com/test', 10, 50000)
    `, [gid, options.branchId, customerId]);

    const linkId = randomUUID();
    await client.query(`
      INSERT INTO share_links (id, gallery_id, token_hash, token_prefix, role, status)
      VALUES ($1::uuid, $2::uuid, 'hash-' || $1::text, 'prefix', 'owner', 'active')
    `, [linkId, gid]);

    const selId = randomUUID();
    await client.query(`
      INSERT INTO selections (id, gallery_id, share_link_id, is_primary, submitted_at, snapshot_extra_amount)
      VALUES ($1::uuid, $2::uuid, $3::uuid, true, now(), $4)
    `, [selId, gid, linkId, options.snapshotExtraAmount]);

    return { galleryId: gid, selectionId: selId };
  }

  it("1. Luật 3: Kiểu dữ liệu số tiền là numeric(12,0), KHÔNG dùng float", async () => {
    const { rows } = await client.query(`
      SELECT column_name, data_type, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_name = 'gallery_payments' AND column_name IN ('amount', 'snapshot_extra_amount')
      ORDER BY column_name
    `);
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.data_type).toBe("numeric");
      expect(Number(r.numeric_precision)).toBe(12);
      expect(Number(r.numeric_scale)).toBe(0);
    }
  });

  it("2. Luật 1 & 2: Ghi nhận số tiền, hình thức, ai xác nhận, lúc nào, gắn với snapshot_extra_amount lúc chốt", async () => {
    const { galleryId, selectionId } = await createGalleryWithSubmittedSelection({
      branchId: branchAId,
      snapshotExtraAmount: 250000,
    });

    const paymentId = randomUUID();
    await client.query(`
      INSERT INTO gallery_payments (id, gallery_id, selection_id, amount, snapshot_extra_amount, payment_method, confirmed_by, note)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 250000, 250000, 'chuyen_khoan', $4::uuid, 'Khách chuyển khoản Vietcombank')
    `, [paymentId, galleryId, selectionId, staffCsAId]);

    const { rows } = await client.query("SELECT * FROM gallery_payments WHERE id = $1::uuid", [paymentId]);
    expect(rows.length).toBe(1);
    const p = rows[0];
    expect(p.gallery_id).toBe(galleryId);
    expect(p.selection_id).toBe(selectionId);
    expect(Number(p.amount)).toBe(250000);
    expect(Number(p.snapshot_extra_amount)).toBe(250000);
    expect(p.payment_method).toBe("chuyen_khoan");
    expect(p.confirmed_by).toBe(staffCsAId);
    expect(p.confirmed_at).toBeDefined();
    expect(p.note).toBe("Khách chuyển khoản Vietcombank");

    // Hàm app.gallery_paid_amount tính đúng 250.000
    const { rows: paidRows } = await client.query("SELECT app.gallery_paid_amount($1::uuid) as total", [galleryId]);
    expect(Number(paidRows[0].total)).toBe(250000);
  });

  it("3. Luật 4: Phân quyền INSERT - Chỉ CSKH trở lên mới được ghi nhận thanh toán", async () => {
    const { galleryId, selectionId } = await createGalleryWithSubmittedSelection({
      branchId: branchAId,
      snapshotExtraAmount: 100000,
    });

    // A. CSKH ghi nhận thành công
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${staffCsAId}", "role": "authenticated"}'`);

    const csInsert = await client.query(`
      INSERT INTO gallery_payments (gallery_id, selection_id, amount, payment_method, confirmed_by)
      VALUES ($1::uuid, $2::uuid, 100000, 'tien_mat', $3::uuid)
      RETURNING id
    `, [galleryId, selectionId, staffCsAId]);
    expect(csInsert.rows.length).toBe(1);

    await client.query("ROLLBACK");

    // A2. Owner ghi nhận thành công
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${staffOwnerId}", "role": "authenticated"}'`);

    const ownerInsert = await client.query(`
      INSERT INTO gallery_payments (gallery_id, selection_id, amount, payment_method, confirmed_by)
      VALUES ($1::uuid, $2::uuid, 100000, 'tien_mat', $3::uuid)
      RETURNING id
    `, [galleryId, selectionId, staffOwnerId]);
    expect(ownerInsert.rows.length).toBe(1);

    await client.query("ROLLBACK");

    // A3. CSKH chi nhánh A không thể ghi nhận cho album thuộc chi nhánh B
    const { galleryId: galB, selectionId: selB } = await createGalleryWithSubmittedSelection({
      branchId: branchBId,
      snapshotExtraAmount: 50000,
    });
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${staffCsAId}", "role": "authenticated"}'`);

    await expect(client.query(`
      INSERT INTO gallery_payments (gallery_id, selection_id, amount, payment_method, confirmed_by)
      VALUES ($1::uuid, $2::uuid, 50000, 'tien_mat', $3::uuid)
    `, [galB, selB, staffCsAId])).rejects.toThrow();

    await client.query("ROLLBACK");

    // B. Kế toán xem được nhưng KHÔNG ghi được (Luật 4)
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${staffAccountantId}", "role": "authenticated"}'`);

    await expect(client.query(`
      INSERT INTO gallery_payments (gallery_id, selection_id, amount, payment_method, confirmed_by)
      VALUES ($1::uuid, $2::uuid, 100000, 'tien_mat', $3::uuid)
    `, [galleryId, selectionId, staffAccountantId])).rejects.toThrow();

    await client.query("ROLLBACK");

    // C. Thợ ảnh KHÔNG ghi được
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${staffPhotographerAId}", "role": "authenticated"}'`);

    await expect(client.query(`
      INSERT INTO gallery_payments (gallery_id, selection_id, amount, payment_method, confirmed_by)
      VALUES ($1::uuid, $2::uuid, 100000, 'tien_mat', $3::uuid)
    `, [galleryId, selectionId, staffPhotographerAId])).rejects.toThrow();

    await client.query("ROLLBACK");
  });

  it("4. Luật 4: Phân quyền SELECT - Kế toán xem được, CTV thời vụ KHÔNG thấy", async () => {
    const { galleryId, selectionId } = await createGalleryWithSubmittedSelection({
      branchId: branchAId,
      snapshotExtraAmount: 150000,
    });

    // Thêm bản ghi thanh toán
    await client.query(`
      INSERT INTO gallery_payments (gallery_id, selection_id, amount, payment_method, confirmed_by)
      VALUES ($1::uuid, $2::uuid, 150000, 'chuyen_khoan', $3::uuid)
    `, [galleryId, selectionId, staffManagerAId]);

    // A. Kế toán xem được
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${staffAccountantId}", "role": "authenticated"}'`);

    const { rows: accRows } = await client.query("SELECT * FROM gallery_payments WHERE gallery_id = $1::uuid", [galleryId]);
    expect(accRows.length).toBe(1);

    await client.query("ROLLBACK");

    // B. CTV thời vụ KHÔNG thấy gì (0 dòng)
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${staffCtvId}", "role": "authenticated"}'`);

    const { rows: ctvRows } = await client.query("SELECT * FROM gallery_payments WHERE gallery_id = $1::uuid", [galleryId]);
    expect(ctvRows.length).toBe(0);

    await client.query("ROLLBACK");
  });

  it("5. Tính bất biến (Append-only): Không UPDATE đè, không DELETE", async () => {
    const { galleryId, selectionId } = await createGalleryWithSubmittedSelection({
      branchId: branchAId,
      snapshotExtraAmount: 200000,
    });

    const paymentId = randomUUID();
    await client.query(`
      INSERT INTO gallery_payments (id, gallery_id, selection_id, amount, payment_method, confirmed_by)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 200000, 'chuyen_khoan', $4::uuid)
    `, [paymentId, galleryId, selectionId, staffCsAId]);

    // Thử UPDATE khi đăng nhập làm CSKH -> bị chặn
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${staffCsAId}", "role": "authenticated"}'`);

    await expect(client.query(`
      UPDATE gallery_payments SET amount = 300000 WHERE id = $1::uuid
    `, [paymentId])).rejects.toThrow();

    await client.query("ROLLBACK");

    // Thử DELETE khi đăng nhập làm CSKH -> bị chặn
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${staffCsAId}", "role": "authenticated"}'`);

    await expect(client.query(`
      DELETE FROM gallery_payments WHERE id = $1::uuid
    `, [paymentId])).rejects.toThrow();

    await client.query("ROLLBACK");

    // Sửa bằng cách ghi thêm dòng đính chính (Ví dụ: khách chuyển thừa 50.000, hoàn lại hoặc giảm trừ)
    await client.query(`
      INSERT INTO gallery_payments (gallery_id, selection_id, amount, payment_method, confirmed_by, note)
      VALUES ($1::uuid, $2::uuid, -50000, 'hoan_tien', $3::uuid, 'Đính chính: hoàn lại tiền thừa')
    `, [galleryId, selectionId, staffCsAId]);

    const { rows: paidRows } = await client.query("SELECT app.gallery_paid_amount($1::uuid) as total", [galleryId]);
    expect(Number(paidRows[0].total)).toBe(150000); // 200.000 - 50.000 = 150.000
  });
});
