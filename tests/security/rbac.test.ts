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

  /**
   * Dựng một thợ ảnh và một khách trong cùng chi nhánh, ngay trong transaction
   * của bài test.
   *
   * Trước đây bài test đi tìm `role = 'photographer'` trong dữ liệu mẫu. Ngày
   * 10/09/2026 chủ studio đổi vai trò của người thợ ảnh duy nhất sang retoucher
   * — một thao tác quản trị hoàn toàn bình thường — và bài kiểm tra bảo mật này
   * đỏ vì không còn ai để thử. Bài test bảo mật không được phụ thuộc vào thứ
   * người dùng sửa được qua giao diện.
   */
  async function makePhotographerAndCustomer(): Promise<{ photoId: string; custId: string }> {
    const { rows: branch } = await client.query("SELECT id FROM branches LIMIT 1");
    if (branch.length === 0) throw new Error("Cần ít nhất một chi nhánh, chạy npm run db:seed");
    const branchId = branch[0].id;

    const { rows: user } = await client.query(
      `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               'fixture.photographer.' || gen_random_uuid() || '@staff.babybeanstudio.vn', '', now(), now(), now())
       RETURNING id`,
    );
    const photoId = user[0].id;

    await client.query(
      `INSERT INTO staff_profiles (id, full_name, email, role, is_active)
       SELECT $1, 'Fixture Thợ Ảnh', email, 'photographer', true FROM auth.users WHERE id = $1`,
      [photoId],
    );
    await client.query(
      "INSERT INTO staff_branches (staff_id, branch_id) VALUES ($1, $2)",
      [photoId, branchId],
    );

    const { rows: cust } = await client.query(
      `INSERT INTO customers (branch_id, full_name, phone)
       VALUES ($1, 'Fixture Khách Hàng', '0900000' || floor(random() * 900 + 100)::text)
       RETURNING id`,
      [branchId],
    );

    return { photoId, custId: cust[0].id };
  }

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

    // Tự dựng thợ ảnh và khách, không đi tìm trong dữ liệu mẫu.
    const { photoId, custId } = await makePhotographerAndCustomer();

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
    expect((error as { code?: string }).code).toBe("FORBIDDEN");
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

  it.todo("Ca 7: Khách dùng cookie album A gọi /api/g/photos khi cookie trỏ album B -> chỉ ra ảnh album trong cookie (Chờ BB-032)");

  it.todo("Ca 8: viewer link gọi PATCH /api/g/selection -> 403 (Chờ BB-035)");

  it.todo("Ca 9: suggester gửi mark: 'selected' -> lưu thành 'suggested' (Chờ BB-035)");

  it.todo("Ca 10: Gọi /api/g/submit hai lần -> lần hai GALLERY_LOCKED (Chờ BB-039)");

  it.todo("Ca 11: Sai PIN 6 lần -> lần 6 trả PIN_LOCKED (Chờ BB-031)");

  it.todo("Ca 12: GET /api/img/<photo của album khác> -> 403 (Chờ BB-015)");

  it("Ca 13: accountant không thấy ảnh (SELECT photos trả về 0 dòng)", async () => {
    await client.query("BEGIN");

    // Lấy 1 staff bất kỳ (ví dụ cs) và ép thành accountant trong transaction này
    const staffRes = await client.query("SELECT id FROM staff_profiles WHERE role = 'cs' LIMIT 1");
    expect(staffRes.rows.length).toBeGreaterThan(0);
    const accId = staffRes.rows[0].id;
    
    await client.query("UPDATE staff_profiles SET role = 'accountant' WHERE id = $1", [accId]);

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${accId}", "role": "authenticated"}'`);

    // SELECT photos phải trả về 0 dòng vì chính sách photos_select chặn accountant
    const photosRes = await client.query("SELECT * FROM photos");
    expect(photosRes.rows.length).toBe(0);

    await client.query("ROLLBACK");
  });

  it("Đối chứng dương cho Ca 13: accountant VẪN thấy được album, và cs VẪN thấy được ảnh", async () => {
    await client.query("BEGIN");

    // Lấy 2 staff: ép 1 người làm accountant, người kia làm cs
    const staffsRes = await client.query("SELECT id FROM staff_profiles WHERE role IN ('cs', 'photographer', 'branch_manager') LIMIT 2");
    expect(staffsRes.rows.length).toBeGreaterThanOrEqual(2);
    
    const accId = staffsRes.rows[0].id;
    const csId = staffsRes.rows[1].id;
    
    await client.query("UPDATE staff_profiles SET role = 'accountant' WHERE id = $1", [accId]);
    await client.query("UPDATE staff_profiles SET role = 'cs' WHERE id = $1", [csId]);

    // Kiểm tra accountant thấy album
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${accId}", "role": "authenticated"}'`);
    const galleriesRes = await client.query("SELECT * FROM galleries");
    expect(galleriesRes.rows.length).toBeGreaterThan(0);

    // Kiểm tra CS thấy ảnh
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${csId}", "role": "authenticated"}'`);
    const photosRes = await client.query("SELECT * FROM photos");
    expect(photosRes.rows.length).toBeGreaterThan(0);

    await client.query("ROLLBACK");
  });

  it.todo("Ca 14: Token đã revoked -> 410 LINK_EXPIRED (Chờ BB-030)");
});
