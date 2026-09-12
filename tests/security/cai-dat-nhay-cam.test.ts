/**
 * Cài đặt có hình dạng bí mật chỉ chủ và quản trị đọc được.
 *
 * OWNER: PM. Task BB-124.
 *
 * Tìm ra bằng cách đo ma trận vai-trò × bảng: dựng một nhân viên giả cho từng
 * vai rồi đếm số dòng mỗi vai đọc được ở 23 bảng. `settings` là bảng DUY NHẤT
 * mà cả chín vai, kể cả CTV thời vụ, đọc được hết — dòng toàn cục
 * (branch_id null) không có điều kiện nào.
 *
 * Trong bảng có `lark.webhook_url`. Hôm nay giá trị rỗng nên chưa rò gì, nhưng
 * webhook là thứ ai cầm cũng nhắn được vào Lark của studio. Đây đúng hình dạng
 * lỗ hổng `deliveries`: chính sách viết cho bảng chưa có dữ liệu thì không ai
 * soát, và nằm im tới ngày bảng có dữ liệu.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

describe("BB-124: cài đặt nhạy cảm", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  /** Dựng nhân viên vai `role`, trả về số cài đặt đọc được. */
  async function demCaiDat(role: string) {
    const { rows: br } = await client.query("SELECT id FROM branches ORDER BY name LIMIT 1");
    const { rows: u } = await client.query(
      `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', 'fixture.bb124c.' || gen_random_uuid() || '@staff.babybeanstudio.vn',
               '', now(), now(), now())
       RETURNING id`,
    );
    const id = u[0].id;
    await client.query(
      `INSERT INTO staff_profiles (id, full_name, email, role, is_active)
       SELECT $1, 'Fixture BB-124c', email, $2::staff_role, true FROM auth.users WHERE id = $1`,
      [id, role],
    );
    await client.query("INSERT INTO staff_branches (staff_id, branch_id) VALUES ($1,$2)", [
      id,
      br[0].id,
    ]);

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(
      `SET LOCAL request.jwt.claims = '{"sub": "${id}", "role": "authenticated"}'`,
    );

    const { rows: tong } = await client.query("SELECT count(*)::int n FROM settings");
    const { rows: nhay } = await client.query(
      "SELECT count(*)::int n FROM settings WHERE app.setting_is_sensitive(key)",
    );
    return { tong: tong[0].n as number, nhay: nhay[0].n as number };
  }

  it("1. Có ít nhất một khoá nhạy cảm để phép thử có nghĩa", async () => {
    // Kiểm chứng ngược: không có khoá nhạy cảm nào thì mọi phép thử dưới đây
    // xanh một cách vô nghĩa.
    const { rows } = await client.query(
      "SELECT count(*)::int n FROM settings WHERE app.setting_is_sensitive(key)",
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("2. CSKH đọc được cài đặt thường, KHÔNG đọc được khoá nhạy cảm", async () => {
    await client.query("BEGIN");
    try {
      const d = await demCaiDat("cs");
      expect(d.tong).toBeGreaterThan(0);
      expect(d.nhay).toBe(0);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("3. Kế toán và người xem cũng không đọc được", async () => {
    for (const role of ["accountant", "viewer", "retoucher", "photographer"]) {
      await client.query("BEGIN");
      try {
        const d = await demCaiDat(role);
        expect(d.nhay, role).toBe(0);
      } finally {
        await client.query("ROLLBACK");
      }
    }
  });

  it("4. CTV thời vụ không đọc được cài đặt NÀO", async () => {
    await client.query("BEGIN");
    try {
      const d = await demCaiDat("photoshop_ctv");
      expect(d.tong).toBe(0);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("5. Chủ và quản trị thì đọc được", async () => {
    for (const role of ["owner", "admin"]) {
      await client.query("BEGIN");
      try {
        const d = await demCaiDat(role);
        expect(d.nhay, role).toBeGreaterThan(0);
      } finally {
        await client.query("ROLLBACK");
      }
    }
  });

  it("6. Khoá thêm sau này trúng hình dạng tên là tự được chặn", async () => {
    // Bắt theo hình dạng chứ không theo danh sách liệt kê — khoá mới không ai
    // nhớ bổ sung vào danh sách.
    const { rows } = await client.query(
      `SELECT app.setting_is_sensitive($1) a, app.setting_is_sensitive($2) b,
              app.setting_is_sensitive($3) c, app.setting_is_sensitive($4) d`,
      ["zalo.api_token", "smtp.password", "gallery.default_due_days", "photo.expected_long_edge_px"],
    );
    expect(rows[0].a).toBe(true);
    expect(rows[0].b).toBe(true);
    expect(rows[0].c).toBe(false);
    expect(rows[0].d).toBe(false);
  });
});
