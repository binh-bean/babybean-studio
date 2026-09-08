import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { requireRole, PERMISSIONS } from "../../src/lib/auth/staff";
import { Client } from "pg";

describe("Database RLS Policies & Security (BB-020)", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString: process.env.SUPABASE_DB_URL,
    });
    await client.connect();

    const { rows } = await client.query("SELECT COUNT(*) FROM staff_profiles");
    if (parseInt(rows[0].count, 10) === 0) {
      throw new Error("Dữ liệu trống, cần chạy npm run db:seed trước khi chạy test");
    }
  });

  afterAll(async () => {
    await client.end();
  });

  it("Ca 1: cs chi nhánh thấy album chi nhánh mình và KHÔNG thấy album chi nhánh khác", async () => {
    await client.query("BEGIN");
    
    // Tìm 1 nhân viên CS
    const csRes = await client.query("SELECT id FROM staff_profiles WHERE role = 'cs' LIMIT 1");
    expect(csRes.rows.length).toBe(1);
    const csId = csRes.rows[0].id;

    // Tìm branch mà CS này quản lý
    const sbRes = await client.query("SELECT branch_id FROM staff_branches WHERE staff_id = $1 LIMIT 1", [csId]);
    expect(sbRes.rows.length).toBe(1);
    const csBranchId = sbRes.rows[0].branch_id;

    // Đăng nhập làm CS này
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${csId}", "role": "authenticated"}'`);
    
    // Đọc galleries
    const res = await client.query("SELECT * FROM galleries");
    
    // Phải thấy ít nhất 1 album của chi nhánh mình (từ seed)
    const ownGalleries = res.rows.filter(g => g.branch_id === csBranchId);
    expect(ownGalleries.length).toBeGreaterThan(0);
    
    // Không được có album nào thuộc chi nhánh khác
    const otherGalleries = res.rows.filter(g => g.branch_id !== csBranchId);
    expect(otherGalleries.length).toBe(0);
    
    await client.query("ROLLBACK");
  });

  it("Ca 2 (Lỗ hổng 0001): photographer KHÔNG được phép sửa hồ sơ khách hàng", async () => {
    await client.query("BEGIN");

    // Lấy 1 photographer và 1 customer của chính photographer đó (cùng branch)
    const photoRes = await client.query("SELECT id FROM staff_profiles WHERE role = 'photographer' LIMIT 1");
    expect(photoRes.rows.length).toBe(1);
    const photoId = photoRes.rows[0].id;

    const sbRes = await client.query("SELECT branch_id FROM staff_branches WHERE staff_id = $1 LIMIT 1", [photoId]);
    const photoBranchId = sbRes.rows[0].branch_id;

    const custRes = await client.query("SELECT id FROM customers WHERE branch_id = $1 LIMIT 1", [photoBranchId]);
    expect(custRes.rows.length).toBe(1);
    const custId = custRes.rows[0].id;

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${photoId}", "role": "authenticated"}'`);

    const updateRes = await client.query("UPDATE customers SET full_name = 'Hacked Name' WHERE id = $1", [custId]);
    // RLS sẽ chặn update, do USING clause của policy false nên không tìm thấy dòng để update
    expect(updateRes.rowCount).toBe(0);

    // Kiểm tra lại bằng cách vượt quyền, đảm bảo tên không đổi
    await client.query("SET LOCAL ROLE postgres");
    const checkRes = await client.query("SELECT full_name FROM customers WHERE id = $1", [custId]);
    expect(checkRes.rows[0].full_name).not.toBe('Hacked Name');

    await client.query("ROLLBACK");
  });

  it("Ca 3: cs gọi POST /admin/galleries/:id/reopen (mở lại album) -> 403 ở tầng ứng dụng", () => {
    // Tránh lập luận vòng tròn bằng cách sử dụng PERMISSIONS export từ src/lib/auth/staff
    const session = {
      staffId: "user-cs",
      role: "cs" as const,
      branchIds: []
    };
    let error: unknown;
    try {
      requireRole(session, PERMISSIONS.REOPEN_GALLERY);
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.code).toBe("FORBIDDEN");
  });

  it("Đối chứng dương: cs SỬA được khách hàng của chính chi nhánh mình", async () => {
    await client.query("BEGIN");

    // Lấy 1 cs
    const csRes = await client.query("SELECT id FROM staff_profiles WHERE role = 'cs' LIMIT 1");
    const csId = csRes.rows[0].id;

    const sbRes = await client.query("SELECT branch_id FROM staff_branches WHERE staff_id = $1 LIMIT 1", [csId]);
    const csBranchId = sbRes.rows[0].branch_id;

    // Lấy 1 khách hàng của cùng chi nhánh
    const custRes = await client.query("SELECT id, full_name FROM customers WHERE branch_id = $1 LIMIT 1", [csBranchId]);
    const custId = custRes.rows[0].id;

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${csId}", "role": "authenticated"}'`);

    // Sửa khách hàng thành công
    await client.query("UPDATE customers SET full_name = 'New Name' WHERE id = $1", [custId]);
    
    // Đọc lại xem có sửa được không
    const checkRes = await client.query("SELECT full_name FROM customers WHERE id = $1", [custId]);
    expect(checkRes.rows[0].full_name).toBe("New Name");

    await client.query("ROLLBACK");
  });

  it("Ca 4: Nhân viên bất kỳ UPDATE selection_items -> lỗi RLS/quyền", async () => {
    await client.query("BEGIN");
    
    // Lấy 1 cs
    const csRes = await client.query("SELECT id FROM staff_profiles WHERE role = 'cs' LIMIT 1");
    const csId = csRes.rows[0].id;
    
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${csId}", "role": "authenticated"}'`);
    
    let error;
    try {
      await client.query("UPDATE selection_items SET mark = 'selected'");
    } catch (e) {
      error = e;
    }
    
    expect(error).toBeDefined();
    expect((error as Error).message).toMatch(/permission denied for table selection_items|new row violates row-level security policy/i);
    
    await client.query("ROLLBACK");
  });

  it("Ca 5: Nhân viên tự UPDATE role của mình -> lỗi RLS", async () => {
    await client.query("BEGIN");

    // Lấy 1 cs
    const csRes = await client.query("SELECT id FROM staff_profiles WHERE role = 'cs' LIMIT 1");
    const csId = csRes.rows[0].id;

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${csId}", "role": "authenticated"}'`);

    let error;
    try {
      await client.query("UPDATE staff_profiles SET role = 'owner' WHERE id = $1", [csId]);
    } catch (e) {
      error = e;
    }
    
    expect(error).toBeDefined();
    expect((error as Error).message).toMatch(/new row violates row-level security policy|permission denied/i);
    
    await client.query("ROLLBACK");
  });

  it("Ca 6: anon SELECT bất kỳ bảng nào -> lỗi quyền", async () => {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE anon");
    
    let error;
    try {
      await client.query("SELECT * FROM galleries");
    } catch (e) {
      error = e;
    }
    
    expect(error).toBeDefined();
    expect((error as Error).message).toContain("permission denied");
    
    await client.query("ROLLBACK");
  });
});
