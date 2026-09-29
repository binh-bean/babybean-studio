/**
 * BB-320 (Link app, mục 2a) — link vừa tạo phải hiện lại được mỗi lần mở bộ
 * ảnh, và nếu app KHÔNG lưu được địa chỉ thì CSKH phải được báo, không im lặng.
 *
 * Hai điều canh ở đây (đường API, không đường giao diện — giao diện có ca e2e riêng):
 *   1. Tạo link bình thường → `luuDiaChiDuoc: true` và có dòng `share_link_ma`
 *      mà giải mã ra ĐÚNG mã vừa trả.
 *   2. Ghi bản mã hỏng (thiếu APP_SECRET nên mã hoá ném lỗi) → link VẪN được
 *      tạo (CSKH cầm được link), nhưng `luuDiaChiDuoc: false` và không có dòng
 *      `share_link_ma`. Trước bản vá, lỗi này chỉ nằm trong log máy chủ.
 *
 * Không đụng Lark: `ghiLinkAppVeLark` tự chặn khi đang chạy phép thử.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { Client } from "pg";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { giaiMaMaLink } from "@/lib/auth/ma-link";
import { POST as taoLink } from "@/app/api/admin/galleries/[id]/share-link/route";

describe("BB-320: tạo link app — lưu địa chỉ và báo khi lưu hỏng", () => {
  let client: Client;
  let branchId: string;
  let galleryId: string;
  let customerId: string;
  let staffId: string;

  const params = () => ({ params: Promise.resolve({ id: galleryId }) });
  const body = () => new Request("http://localhost", { method: "POST", body: JSON.stringify({}) });

  function asCs() {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role: "cs",
      branchIds: [branchId],
      permissions: quyenCuaVai("cs"),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: st } = await client.query(
      "select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1",
    );
    staffId = st[0].id;
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-320 Khách link') returning id`,
      [branchId],
    );
    customerId = c[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,'Fixture BB-320 link','ready',$3,'https://example.com/x', 12, 20)
       returning id`,
      [branchId, customerId, `fixture-bb320-${Date.now()}`],
    );
    galleryId = g[0].id;
  });

  afterAll(async () => {
    await client.query(
      "delete from share_link_ma where share_link_id in (select id from share_links where gallery_id = $1)",
      [galleryId],
    );
    await client.query("delete from share_links where gallery_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  beforeEach(async () => {
    await client.query(
      "delete from share_link_ma where share_link_id in (select id from share_links where gallery_id = $1)",
      [galleryId],
    );
    await client.query("delete from share_links where gallery_id = $1", [galleryId]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const banMa = async () => {
    const { rows } = await client.query(
      `select m.ma_hoa from share_link_ma m join share_links l on l.id = m.share_link_id where l.gallery_id = $1`,
      [galleryId],
    );
    return rows as { ma_hoa: string }[];
  };

  it("1. Tạo link: luuDiaChiDuoc = true, bản mã giải ra đúng mã vừa trả", async () => {
    asCs();
    const res = await taoLink(body(), params());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.luuDiaChiDuoc).toBe(true);

    const rows = await banMa();
    expect(rows).toHaveLength(1);
    expect(giaiMaMaLink(rows[0]!.ma_hoa)).toBe(json.data.duongDan.replace("/g/", ""));
  });

  it("2. Ghi bản mã hỏng: link VẪN tạo được, nhưng luuDiaChiDuoc = false và không có dòng share_link_ma", async () => {
    asCs();
    // Thiếu APP_SECRET → `maHoaMaLink` ném lỗi. Trước bản vá lỗi này không ai biết.
    vi.stubEnv("APP_SECRET", "");
    const res = await taoLink(body(), params());
    expect(res.status, "lưu địa chỉ hỏng không được làm hỏng việc tạo link").toBe(200);
    const json = await res.json();
    expect(json.data.duongDan).toMatch(/^\/g\/[A-Za-z0-9_-]{40,}$/);
    expect(json.data.luuDiaChiDuoc, "phải báo cho màn CSKH biết là chưa lưu được").toBe(false);
    expect(await banMa()).toHaveLength(0);
  });
});
