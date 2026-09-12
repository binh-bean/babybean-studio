/**
 * CTV thời vụ chỉ thấy việc của mình — soát toàn bộ, không chỉ bảng vừa sửa.
 *
 * OWNER: PM. Task BB-124.
 *
 * Sau khi vá `deliveries`, soát 22 bảng còn lại: đếm bảng nào có chính sách
 * đọc KHÔNG nhắc tới `photoshop_ctv`. Ra tám bảng, trong đó bốn bảng chứa dữ
 * liệu khách:
 *
 *   babies          tên, biệt danh, NGÀY SINH, giới tính của em bé
 *   shoots          buổi chụp của mọi khách trong chi nhánh
 *   notifications   target + payload — số điện thoại, link chat, nội dung nhắn
 *   activity_logs   toàn bộ hoạt động của chi nhánh
 *
 * Dự án đã cố ý giấu tên PHỤ HUYNH khỏi CTV (bảng `customers` chặn từ đầu),
 * nhưng để ngỏ tên và ngày sinh của CHÍNH ĐỨA TRẺ. Đó là bảng nhạy cảm nhất
 * trong cơ sở dữ liệu.
 *
 * Không màn hình nào hỏng vì siết: cả bốn bảng chỉ được đọc qua service_role,
 * vốn đi vòng qua RLS.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

describe("BB-124: CTV chỉ thấy việc của mình", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  /**
   * Dựng một CTV, một khách KHÔNG liên quan tới CTV đó, rồi trả về số dòng
   * CTV đọc được ở từng bảng. Mọi thứ nằm trong giao dịch và bị huỷ sau đó.
   */
  async function demSoDongCtvDocDuoc() {
    const { rows: br } = await client.query("SELECT id FROM branches ORDER BY name LIMIT 1");
    const branchId = br[0].id;

    const { rows: u } = await client.query(
      `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', 'fixture.bb124b.' || gen_random_uuid() || '@staff.babybeanstudio.vn',
               '', now(), now(), now())
       RETURNING id`,
    );
    const ctvId = u[0].id;
    await client.query(
      `INSERT INTO staff_profiles (id, full_name, email, role, is_active)
       SELECT $1, 'Fixture CTV BB-124b', email, 'photoshop_ctv', true FROM auth.users WHERE id = $1`,
      [ctvId],
    );
    await client.query("INSERT INTO staff_branches (staff_id, branch_id) VALUES ($1,$2)", [
      ctvId,
      branchId,
    ]);

    // Khách của người khác — CTV này không được gán bộ ảnh nào của họ.
    const { rows: cust } = await client.query(
      `INSERT INTO customers (branch_id, full_name) VALUES ($1,'Fixture BB-124b Khách') RETURNING id`,
      [branchId],
    );
    const custId = cust[0].id;

    const { rows: baby } = await client.query(
      `INSERT INTO babies (customer_id, full_name, nickname, birth_date)
       VALUES ($1,'Fixture Bé BB-124b','Bé Fixture','2025-01-01') RETURNING id`,
      [custId],
    );
    await client.query(
      `INSERT INTO shoots (branch_id, customer_id, baby_id, shoot_date, concept)
       VALUES ($1,$2,$3, current_date, 'Fixture concept BB-124b')`,
      [branchId, custId, baby[0].id],
    );
    await client.query(
      `INSERT INTO notifications (branch_id, channel, template, payload, target, status)
       VALUES ($1,'zalo','fixture','{"noi_dung":"fixture"}','0900000000','pending')`,
      [branchId],
    );
    await client.query(
      `INSERT INTO activity_logs (branch_id, actor_type, actor_label, action, entity_type)
       VALUES ($1,'staff','cs','fixture.bb124b','gallery')`,
      [branchId],
    );

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(
      `SET LOCAL request.jwt.claims = '{"sub": "${ctvId}", "role": "authenticated"}'`,
    );

    const dem: Record<string, number> = {};
    for (const t of ["babies", "shoots", "notifications", "activity_logs"]) {
      const { rows } = await client.query(`SELECT count(*)::int n FROM ${t}`);
      dem[t] = rows[0].n as number;
    }
    return dem;
  }

  it("CTV không đọc được dữ liệu khách ở bốn bảng còn lại", async () => {
    await client.query("BEGIN");
    try {
      const dem = await demSoDongCtvDocDuoc();

      // Em bé: tên, biệt danh, NGÀY SINH. Bảng nhạy cảm nhất.
      expect(dem.babies, "babies").toBe(0);
      expect(dem.shoots, "shoots").toBe(0);
      // target là số điện thoại hoặc link chat của khách.
      expect(dem.notifications, "notifications").toBe(0);
      // Nhật ký do người khác tạo.
      expect(dem.activity_logs, "activity_logs").toBe(0);
    } finally {
      await client.query("ROLLBACK");
    }
  });
});
