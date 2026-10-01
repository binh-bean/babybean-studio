/**
 * BB-346 — nút "Đồng bộ ngay" khách hàng (BB-337) ghi dữ liệu thì phải để lại
 * dòng nhật ký, và dòng đó chỉ chứa SỐ ĐẾM.
 *
 * Phép thử cấu trúc ở bb-052 chỉ canh "có nhắc tới ghiNhatKy"; phép thử này
 * chạy ĐƯỜNG THẬT: gọi route, rồi đọc activity_logs trên cơ sở dữ liệu.
 * Chỉ giả lập biên giới Lark (`dongBoBoAnhTuLark` — hàm đọc bảng Hậu Kỳ),
 * nên không gửi gì sang Lark.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/lark/dong-bo-bo-anh", () => ({
  dongBoBoAnhTuLark: vi.fn(),
}));

import * as staffAuth from "@/lib/auth/staff";
import { dongBoBoAnhTuLark } from "@/lib/lark/dong-bo-bo-anh";
import { POST as dongBo } from "@/app/api/admin/customers/dong-bo/route";

describe("BB-346: Đồng bộ ngay khách hàng để lại nhật ký", () => {
  let client: Client;
  let staffId = "";
  const tamEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows } = await client.query(
      "select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1",
    );
    staffId = rows[0].id;

    // Giá trị giả: route chỉ kiểm có mặt, còn Lark đã bị giả lập ở trên.
    for (const k of ["LARK_APP_ID", "LARK_APP_SECRET", "LARK_BASE_APP_TOKEN"]) {
      tamEnv[k] = process.env[k];
      process.env[k] = "fixture-bb-346";
    }
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role: "owner",
      roleName: "owner",
      branchIds: [],
      permissions: quyenCuaVai("owner"),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  });

  afterAll(async () => {
    for (const [k, v] of Object.entries(tamEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await client.query(
      "delete from activity_logs where action = 'customer.dong_bo_lark' and metadata->>'docDuoc' = '777'",
    );
    await client.end();
  });

  it("lượt chạy xong để lại MỘT dòng customer.dong_bo_lark, chỉ có số đếm", async () => {
    // 777 là dấu riêng của phép thử này để dọn đúng dòng của nó.
    vi.mocked(dongBoBoAnhTuLark).mockResolvedValue({
      fetched: 777,
      qualified: 5,
      created: 3,
      updated: 4,
      errors: 1,
      lastModifiedTime: 0,
    });
    const { rows: truoc } = await client.query(
      "select count(*)::int n from activity_logs where action = 'customer.dong_bo_lark'",
    );

    const res = await dongBo();
    expect(res.status).toBe(200);

    const { rows } = await client.query(
      `select actor_type, actor_id, metadata from activity_logs
        where action = 'customer.dong_bo_lark' and metadata->>'docDuoc' = '777'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].actor_type).toBe("staff");
    expect(rows[0].actor_id).toBe(staffId);
    expect(rows[0].metadata).toEqual({ docDuoc: 777, taoMoi: 3, daCo: 4, loi: 1 });

    const { rows: sau } = await client.query(
      "select count(*)::int n from activity_logs where action = 'customer.dong_bo_lark'",
    );
    expect(sau[0].n).toBe(truoc[0].n + 1);
  });

  it("lượt bị nhường (đang có lượt khác chạy) không ghi gì", async () => {
    vi.mocked(dongBoBoAnhTuLark).mockResolvedValue({
      nhuong: true,
      fetched: 0,
      qualified: 0,
      created: 0,
      updated: 0,
      errors: 0,
      lastModifiedTime: 0,
    });
    const { rows: truoc } = await client.query(
      "select count(*)::int n from activity_logs where action = 'customer.dong_bo_lark'",
    );
    const res = await dongBo();
    expect(res.status).toBe(200);
    expect((await res.json()).data.dangChay).toBe(true);
    const { rows: sau } = await client.query(
      "select count(*)::int n from activity_logs where action = 'customer.dong_bo_lark'",
    );
    expect(sau[0].n).toBe(truoc[0].n);
  });
});
