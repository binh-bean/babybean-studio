/**
 * CTV thời vụ không được thấy link thư mục ảnh hoàn thiện của bộ ảnh
 * KHÔNG PHẢI của mình.
 *
 * OWNER: PM. Task BB-124.
 *
 * Trước BB-121, bảng `deliveries` không ai ghi vào — nên chính sách RLS lỏng
 * của nó không lộ ra. BB-121 bắt đầu ghi `final_drive_url` vào đó: link thư
 * mục ảnh đã chỉnh của từng khách. Lúc ấy chính sách cũ
 *
 *     using (app.can_see_branch(branch_id))
 *
 * nghĩa là một CTV thời vụ đọc được link ảnh hoàn thiện của MỌI khách trong
 * chi nhánh, kể cả bộ không giao cho họ.
 *
 * Hai bảng cùng loại đã chặn đúng: `revision_requests` (chỉ bộ được gán) và
 * `gallery_payments` (CTV không thấy gì). `deliveries` bị bỏ sót vì lúc viết
 * chính sách, bảng còn rỗng.
 *
 * Phép thử tự dựng dữ liệu của mình. Mượn dòng có sẵn thì kết quả đổi theo dữ
 * liệu người khác để lại — dự án đã vấp năm lần.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

describe("BB-124: CTV không thấy link giao của bộ ảnh người khác", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("CTV chỉ đọc được deliveries của bộ ảnh được gán cho mình", async () => {
    await client.query("BEGIN");
    try {
      const { rows: br } = await client.query("SELECT id FROM branches ORDER BY name LIMIT 1");
      const branchId = br[0].id;

      // CTV thời vụ của riêng phép thử này.
      const { rows: u } = await client.query(
        `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                                 email_confirmed_at, created_at, updated_at)
         VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
                 'authenticated', 'fixture.bb124.' || gen_random_uuid() || '@staff.babybeanstudio.vn',
                 '', now(), now(), now())
         RETURNING id`,
      );
      const ctvId = u[0].id;
      await client.query(
        `INSERT INTO staff_profiles (id, full_name, email, role, is_active)
         SELECT $1, 'Fixture CTV BB-124', email, 'photoshop_ctv', true FROM auth.users WHERE id = $1`,
        [ctvId],
      );
      await client.query("INSERT INTO staff_branches (staff_id, branch_id) VALUES ($1,$2)", [
        ctvId,
        branchId,
      ]);

      const { rows: cust } = await client.query(
        `INSERT INTO customers (branch_id, full_name) VALUES ($1,'Fixture BB-124 Khách') RETURNING id`,
        [branchId],
      );

      // Hai bộ ảnh cùng chi nhánh: một giao cho CTV này, một KHÔNG.
      const mk = async (title: string, editorId: string | null) => {
        const { rows } = await client.query(
          `INSERT INTO galleries (branch_id, customer_id, title, status, drive_folder_id,
                                  drive_folder_url, editor_id)
           VALUES ($1,$2,$3,'in_retouch',$4,'https://example.com/x',$5) RETURNING id`,
          [branchId, cust[0].id, title, `fixture-bb124-${title}-${Date.now()}`, editorId],
        );
        await client.query(
          `INSERT INTO deliveries (gallery_id, branch_id, status, final_drive_url)
           VALUES ($1,$2,'ready',$3)`,
          [rows[0].id, branchId, `https://example.com/da-chinh/${title}`],
        );
        return rows[0].id as string;
      };

      const cuaMinh = await mk("cua-minh", ctvId);
      await mk("cua-nguoi-khac", null);

      await client.query("SET LOCAL ROLE authenticated");
      await client.query(
        `SET LOCAL request.jwt.claims = '{"sub": "${ctvId}", "role": "authenticated"}'`,
      );

      const { rows: thay } = await client.query(
        "SELECT gallery_id, final_drive_url FROM deliveries",
      );

      // Chỉ một dòng, và đúng dòng của bộ được gán.
      expect(thay).toHaveLength(1);
      expect(thay[0].gallery_id).toBe(cuaMinh);
      expect(thay[0].final_drive_url).toContain("cua-minh");
    } finally {
      await client.query("ROLLBACK");
    }
  });
});
