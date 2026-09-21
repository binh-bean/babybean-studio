import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { GET } from "@/app/api/admin/dashboard/route";
import * as staffAuth from "@/lib/auth/staff";

vi.mock("server-only", () => ({}));

describe("BB-060 - Bảng điều khiển", () => {
  let client: Client;
  let staffId = "";
  let branchA = "";
  let branchB = "";
  let galleryB_id = "";

  const goi = (q = "") => GET(new Request(`http://localhost/api/admin/dashboard${q}`));

  function nhu(role: string, branchIds: string[]) {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role,
      branchIds,
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 2");
    if (br.length < 2) throw new Error("Cần ít nhất hai chi nhánh.");
    branchA = br[0].id;
    branchB = br[1].id;

    const { rows: st } = await client.query("select id from staff_profiles limit 1");
    staffId = st[0].id;

    const { rows: c } = await client.query("select id from customers where branch_id = $1 limit 1", [branchB]);
    const customerB = c[0].id;

    // Insert a gallery in branch B that is "ready" so it counts as "waitingForSelection"
    const res = await client.query(`
      insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url)
      values ($1, $2, 'Test BB-060 Branch B', 'ready', 'test_b', 'http')
      returning id
    `, [branchB, customerB]);
    galleryB_id = res.rows[0].id;
  });

  afterAll(async () => {
    if (galleryB_id) {
      await client.query("delete from galleries where id = $1", [galleryB_id]);
    }
    await client.end();
  });

  it("người của chi nhánh A không đếm được album của chi nhánh B (báo 403 nếu cố xin nhánh B)", async () => {
    nhu("cs", [branchA]);
    // Cố tình hỏi data nhánh B
    const res = await goi("?branchId=" + branchB);
    expect(res.status).toBe(403);
    
    // N?u không truyền branchId, API phải tự lấy branchA và không đếm galleryB
    const res2 = await goi();
    expect(res2.status).toBe(200);
    const json = await res2.json();
    
    // Đảm bảo actionRequired không chứa galleryB
    const found = json.data.actionRequired.find((g: { id: string }) => g.id === galleryB_id);
    expect(found).toBeUndefined();
  });
});
