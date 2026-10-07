/**
 * BB-383 — kiểm migration 0099 trên cơ sở dữ liệu THẬT. CHỈ CHẠY SAU KHI ÁP 0099.
 *
 * VIẾT NHƯNG CHƯA CHẠY (luật chung Đợt 19: cấm chạm DB). Claude chạy khi vắng
 * khách. Mọi dòng thử nằm trong giao dịch và bị ROLLBACK — không để lại gì.
 *
 *   1. Bộ quyền của các vai hệ thống sau 0099 đúng ý anh chốt 06/10 + 07/10
 *      (BB-383b: thợ chụp có `galleries:edit_info`, KHÔNG `galleries:write`).
 *   2. CTV chỉnh ảnh (`photoshop_ctv`, nay có `selections:read`) đọc được
 *      lượt chọn của bộ ĐƯỢC GIAO, KHÔNG đọc được lượt chọn bộ khác cùng chi
 *      nhánh (luật `selections_select` mới của 0099).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Client } from "pg";
import { randomUUID, createHash } from "node:crypto";

describe("BB-383 · 0099 quyền theo vai (DB thật)", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
  });
  afterEach(async () => {
    await client.query("ROLLBACK").catch(() => {});
  });
  afterAll(async () => {
    await client.end();
  });

  it("1. bộ quyền vai hệ thống đúng ý anh", async () => {
    const { rows } = await client.query(`select name, permissions from roles where is_system`);
    const q = Object.fromEntries(rows.map((r) => [r.name as string, r.permissions as string[]]));
    expect(q.photoshop_ctv).toContain("selections:read");
    expect(q.photoshop_ctv).not.toContain("galleries:all_in_branch");
    for (const v of ["owner", "admin", "cs", "retoucher"]) expect(q[v], v).toContain("anh_chinh:gui_khach");
    for (const v of ["accountant", "viewer", "photoshop_ctv"]) expect(q[v], v).not.toContain("anh_chinh:gui_khach");
    expect(q.photographer).toContain("galleries:sync");
    // BB-383b (anh chốt 07/10 "Chỉ sửa thông tin bộ, không tiền"): quyền hẹp,
    // KHÔNG `galleries:write` (thu tiền, xác nhận, dòng hàng) và KHÔNG gửi khách duyệt.
    expect(q.photographer).toContain("galleries:edit_info");
    expect(q.photographer).not.toContain("galleries:write");
    expect(q.photographer).not.toContain("anh_chinh:gui_khach");
    for (const v of ["owner", "admin", "branch_manager", "cs"]) expect(q[v], v).toContain("galleries:edit_info");
    for (const v of ["retoucher", "accountant", "viewer", "photoshop_ctv"]) {
      expect(q[v], v).not.toContain("galleries:edit_info");
    }
  });

  it("2. CTV chỉ đọc lượt chọn của bộ được giao", async () => {
    await client.query("BEGIN");
    const { rows: br } = await client.query("SELECT id FROM branches ORDER BY name LIMIT 1");
    const branchId = br[0].id;

    const { rows: u } = await client.query(
      `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', 'fixture.bb383.' || gen_random_uuid() || '@staff.babybeanstudio.vn',
               '', now(), now(), now())
       RETURNING id`,
    );
    const ctvId = u[0].id as string;
    await client.query(
      `INSERT INTO staff_profiles (id, full_name, email, role, is_active)
       SELECT $1, 'Fixture CTV BB-383', email, 'photoshop_ctv', true FROM auth.users WHERE id = $1`,
      [ctvId],
    );
    await client.query("INSERT INTO staff_branches (staff_id, branch_id) VALUES ($1,$2)", [ctvId, branchId]);
    const { rows: cust } = await client.query(
      `INSERT INTO customers (branch_id, full_name) VALUES ($1,'Fixture BB-383 Khách') RETURNING id`,
      [branchId],
    );

    const taoBoCoLuotChon = async (ten: string, editorId: string | null) => {
      const { rows } = await client.query(
        `INSERT INTO galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, editor_id)
         VALUES ($1,$2,$3,'in_retouch',$4,'https://example.com/x',$5) RETURNING id`,
        [branchId, cust[0].id, `Fixture BB-383 ${ten}`, `fixture-bb383-${ten}-${randomUUID()}`, editorId],
      );
      const gid = rows[0].id as string;
      const ma = randomUUID();
      const { rows: l } = await client.query(
        `INSERT INTO share_links (gallery_id, token_hash, token_prefix, role, status)
         VALUES ($1,$2,$3,'owner','active') RETURNING id`,
        [gid, createHash("sha256").update(ma).digest("hex"), ma.slice(0, 6)],
      );
      await client.query(
        `INSERT INTO selections (gallery_id, share_link_id, is_primary) VALUES ($1,$2,true)`,
        [gid, l[0].id],
      );
      return gid;
    };
    const cuaMinh = await taoBoCoLuotChon("cua-minh", ctvId);
    const cuaNguoiKhac = await taoBoCoLuotChon("cua-nguoi-khac", null);

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${ctvId}", "role": "authenticated"}'`);

    const { rows: thay } = await client.query(
      "SELECT gallery_id FROM selections WHERE gallery_id = any($1::uuid[])",
      [[cuaMinh, cuaNguoiKhac]],
    );
    expect(thay.map((r) => r.gallery_id)).toEqual([cuaMinh]);
  });
});
