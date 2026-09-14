/**
 * BB-127 — CSKH tạo link gửi khách.
 *
 * Chủ studio mô tả từ đầu: "nhân viên tạo link app của khách và gán lại vào
 * cột link app trong hậu kỳ Lark". Cho tới hôm nay KHÔNG có đường nào tạo
 * link — chỉ có đường đổi PIN, và link duy nhất trong cơ sở dữ liệu là của dữ
 * liệu mẫu.
 *
 * Ba điều phép thử này canh:
 *   1. Mã KHÔNG bao giờ nằm trong cơ sở dữ liệu, chỉ bản băm.
 *   2. Tạo link mới thì thu hồi link cũ — hai link cùng sống nghĩa là mã cũ
 *      vẫn mở được, kể cả khi CSKH tạo mới vì nghi mã cũ lọt ra ngoài.
 *   3. Vai 'owner', không phải mặc định 'viewer' — chỉ vai đó mới chốt chọn
 *      ảnh và duyệt ảnh đã chỉnh được.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Client } from "pg";
import { createHash } from "node:crypto";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { POST as taoLink } from "@/app/api/admin/galleries/[id]/share-link/route";

describe("BB-127: tạo link gửi khách", () => {
  let client: Client;
  let branchId: string;
  let galleryId: string;
  let customerId: string;
  let staffId: string;

  const params = () => ({ params: Promise.resolve({ id: galleryId }) });
  const body = (v: unknown = {}) =>
    new Request("http://localhost", { method: "POST", body: JSON.stringify(v) });

  function asRole(role: string) {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role,
      branchIds: [branchId],
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: st } = await client.query("select id from staff_profiles limit 1");
    staffId = st[0].id;
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name)
       values ($1,'Fixture BB-127 Khách') returning id`,
      [branchId],
    );
    customerId = c[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,'Fixture BB-127','ready',$3,'https://example.com/x', 12)
       returning id`,
      [branchId, customerId, `fixture-bb127-${Date.now()}`],
    );
    galleryId = g[0].id;
  });

  afterAll(async () => {
    await client.query("delete from share_links where gallery_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  beforeEach(async () => {
    await client.query("delete from share_links where gallery_id = $1", [galleryId]);
    await client.query("update galleries set photo_count = 12 where id = $1", [galleryId]);
  });

  const linkDangSong = async () => {
    const { rows } = await client.query(
      "select id, role::text, status::text, token_hash, token_prefix from share_links where gallery_id = $1 and status = 'active'",
      [galleryId],
    );
    return rows;
  };

  it("1. Tạo được link, trả về đường dẫn /g/<mã>", async () => {
    asRole("cs");
    const res = await taoLink(body(), params());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.duongDan).toMatch(/^\/g\/[A-Za-z0-9_-]{40,}$/);

    const links = await linkDangSong();
    expect(links).toHaveLength(1);
    expect(links[0].role).toBe("owner");
  });

  it("2. Cơ sở dữ liệu KHÔNG giữ mã, chỉ giữ bản băm", async () => {
    asRole("cs");
    const json = await (await taoLink(body(), params())).json();
    const ma = json.data.duongDan.replace("/g/", "");

    const links = await linkDangSong();
    // Bản băm khớp mã, nhưng chính mã thì không nằm ở đâu cả.
    expect(links[0].token_hash).toBe(createHash("sha256").update(ma).digest("hex"));
    expect(links[0].token_hash).not.toBe(ma);

    const { rows } = await client.query(
      "select count(*)::int n from share_links where gallery_id = $1 and (token_hash = $2 or token_prefix = $2)",
      [galleryId, ma],
    );
    expect(rows[0].n).toBe(0);
  });

  it("3. Tạo link mới thì THU HỒI link cũ", async () => {
    asRole("cs");
    const cu = await (await taoLink(body(), params())).json();
    const moi = await (await taoLink(body(), params())).json();
    expect(moi.data.duongDan).not.toBe(cu.data.duongDan);

    const dangSong = await linkDangSong();
    expect(dangSong).toHaveLength(1);
    expect(dangSong[0].id).toBe(moi.data.shareLinkId);

    const { rows } = await client.query(
      "select count(*)::int n from share_links where gallery_id = $1 and status = 'revoked' and revoked_at is not null",
      [galleryId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("4. Nói rõ giữ link cũ thì cả hai cùng sống", async () => {
    asRole("cs");
    await taoLink(body(), params());
    await taoLink(body({ giuLinkCu: true }), params());
    expect(await linkDangSong()).toHaveLength(2);
  });

  it("5. Bộ ảnh chưa có ảnh -> từ chối", async () => {
    // Gửi link cho khách khi chưa có tấm nào là để khách mở ra thấy trang
    // trắng rồi gọi điện.
    await client.query("update galleries set photo_count = 0 where id = $1", [galleryId]);
    asRole("cs");
    const res = await taoLink(body(), params());
    expect(res.status).toBe(400);
    expect(await linkDangSong()).toHaveLength(0);
  });

  it("6. Mỗi lần tạo ra một mã khác nhau", async () => {
    asRole("cs");
    const ma = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const json = await (await taoLink(body({ giuLinkCu: true }), params())).json();
      ma.add(json.data.duongDan);
    }
    expect(ma.size).toBe(5);
  });

  it("7. Người chỉnh ảnh không tạo link được", async () => {
    asRole("photoshop_ctv");
    const res = await taoLink(body(), params());
    expect(res.status).toBe(403);
    expect(await linkDangSong()).toHaveLength(0);
  });

  it("8. Nhật ký chỉ ghi sáu ký tự đầu, không ghi cả mã", async () => {
    asRole("cs");
    const json = await (await taoLink(body(), params())).json();
    const ma = json.data.duongDan.replace("/g/", "");

    const { rows } = await client.query(
      "select metadata from activity_logs where entity_id = $1 and action = 'share_link.created' order by created_at desc limit 1",
      [galleryId],
    );
    const meta = JSON.stringify(rows[0].metadata);
    expect(meta).toContain(ma.slice(0, 6));
    expect(meta).not.toContain(ma);
  });
});
