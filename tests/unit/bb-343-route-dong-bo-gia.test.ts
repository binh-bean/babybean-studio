/**
 * BB-343 — POST /api/admin/san-pham/dong-bo-gia, chạy qua chính route.
 *
 * Lark GIẢ ở biên mạng, trả ÍT sản phẩm hơn 80% số đang có trong app nên chốt an
 * toàn phải chặn: bb-dev KHÔNG bị ghi giá nào. Phép thử chỉ để lại hai thứ rồi
 * trả lại sạch: dòng nhật ký (xoá theo id) và khoá mốc 1-lần-mỗi-phút trong
 * `settings` (khôi phục giá trị cũ, hoặc xoá nếu trước đó chưa có).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import { POST } from "@/app/api/admin/san-pham/dong-bo-gia/route";
import { KHOA_MOC_BAM_NUT } from "@/lib/lark/dong-bo-gia-san-pham";

const fetchThat = globalThis.fetch;

describe("BB-343 · route Đồng bộ giá ngay", () => {
  let client: Client;
  let giaTriCu: unknown = undefined; // undefined = chưa có dòng
  let luc0 = "";
  const bienCu: Record<string, string | undefined> = {};

  const asVai = (vai: string) =>
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000343",
      role: vai,
      branchIds: [],
      permissions: quyenCuaVai(vai),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows } = await client.query(`select value from settings where key = $1 and branch_id is null`, [KHOA_MOC_BAM_NUT]);
    if (rows[0]) giaTriCu = rows[0].value;
    // Mốc cũ không được làm phép thử bị 429 oan.
    await client.query(`delete from settings where key = $1 and branch_id is null`, [KHOA_MOC_BAM_NUT]);
    luc0 = new Date(Date.now() - 1000).toISOString();

    for (const k of ["LARK_APP_ID", "LARK_APP_SECRET", "LARK_BASE_APP_TOKEN", "CHO_PHEP_GOI_MANG_TRONG_PHEP_THU"]) bienCu[k] = process.env[k];
    process.env.LARK_APP_ID = "id-giả";
    process.env.LARK_APP_SECRET = "bí-mật-giả";
    process.env.LARK_BASE_APP_TOKEN = "base-giả";
    process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (!u.includes("open.larksuite.com")) return fetchThat(url, init);
        const json = (o: unknown) => new Response(JSON.stringify(o));
        if (u.includes("/auth/v3/")) return json({ tenant_access_token: "t" });
        if (u.includes("/tables?page_size")) return json({ code: 0, data: { items: [{ table_id: "tblSP", name: "Sản phẩm" }] } });
        if (u.includes("/tables/tblSP/records")) {
          // 3 dòng: xa dưới 80% của ~130 sản phẩm thật có mã Lark.
          const items = [1, 2, 3].map((i) => ({
            record_id: `recFixtureBB343${i}`,
            fields: { "Tên SP/DV": `Fixture BB-343-${i}`, "Phân Loại Sản Xuất": [{ text: "In Ấn" }], "Giá Bán": 1 },
          }));
          return json({ code: 0, data: { items, has_more: false } });
        }
        throw new Error(`Lark giả: ${u}`);
      }),
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const [k, v] of Object.entries(bienCu)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const { rows } = await client.query(`select id from activity_logs where action = 'san_pham.dong_bo_gia' and created_at >= $1`, [luc0]);
    if (rows.length) await client.query(`delete from activity_logs where id = any($1::bigint[])`, [rows.map((r) => r.id)]);
    await client.query(`delete from settings where key = $1 and branch_id is null`, [KHOA_MOC_BAM_NUT]);
    if (giaTriCu !== undefined) {
      await client.query(`insert into settings (key, value) values ($1, $2::jsonb)`, [KHOA_MOC_BAM_NUT, JSON.stringify(giaTriCu)]);
    }
    await client.end();
  });

  it("1. Vai không có settings:system → 403, không gọi Lark, không ghi gì", async () => {
    asVai("photographer");
    const truoc = vi.mocked(globalThis.fetch).mock.calls.length;
    const res = await POST();
    expect(res.status).toBe(403);
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(truoc);
    const { rows } = await client.query(`select count(*)::int n from activity_logs where action = 'san_pham.dong_bo_gia' and created_at >= $1`, [luc0]);
    expect(rows[0].n).toBe(0);
  });

  it("2. Admin: Lark trả quá ít → 500, KHÔNG đổi giá nào, nhật ký ghi rõ lý do; bấm lại ngay → 429", async () => {
    const { rows: truoc } = await client.query(`select md5(string_agg(id::text || coalesce(list_price::text,'-') || is_active::text, ',' order by id)) h from products`);
    asVai("owner");
    const res = await POST();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toContain("không ghi gì");

    const { rows: sau } = await client.query(`select md5(string_agg(id::text || coalesce(list_price::text,'-') || is_active::text, ',' order by id)) h from products`);
    expect(sau[0].h).toBe(truoc[0].h); // bảng products y nguyên

    const { rows: nk } = await client.query(
      `select actor_type, actor_label, entity_type, metadata from activity_logs where action = 'san_pham.dong_bo_gia' and created_at >= $1`,
      [luc0],
    );
    expect(nk).toHaveLength(1);
    expect(nk[0].actor_type).toBe("staff");
    expect(nk[0].metadata).toMatchObject({ ketQua: "loi", loi: "DOC_QUA_IT", daGhi: false, soDocTuLark: 3, soGiaDoi: 0 });
    expect(nk[0].metadata.soCoMaTrongApp).toBeGreaterThan(3);

    const lai = await POST();
    expect(lai.status).toBe(429);
    const { rows: nk2 } = await client.query(`select count(*)::int n from activity_logs where action = 'san_pham.dong_bo_gia' and created_at >= $1`, [luc0]);
    expect(nk2[0].n).toBe(1); // lần bị 429 không gọi Lark, không thêm dòng nhật ký
  });
});
