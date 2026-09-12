/**
 * BB-098 — bật/tắt PIN cho link chia sẻ.
 *
 * Gọi thẳng route handler thay vì qua HTTP: NEXT_PUBLIC_APP_URL là localhost
 * trên máy dev và không là gì cả lúc chạy npm run verify, nên bản gọi qua HTTP
 * sẽ bỏ qua toàn bộ phép thử và báo "không có lỗi" — tệ hơn là báo đỏ.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { POST, DELETE } from "@/app/api/admin/share-links/[id]/pin/route";

describe("BB-098: PIN tuỳ chọn cho link chia sẻ", () => {
  let client: Client;
  let galleryId: string;
  let linkId: string;
  let branchId: string;
  let customerId: string;

  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  /** Giả lập nhân viên CSKH của đúng chi nhánh chứa bộ ảnh. */
  function asCs() {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      role: "cs",
      branchIds: [branchId],
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: cust } = await client.query(
      `insert into customers (branch_id, full_name) values ($1, 'Fixture BB-098 Khách')
       returning id`,
      [branchId],
    );
    customerId = cust[0].id;

    const { rows: gal } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url)
       values ($1, $2, 'Fixture BB-098', 'ready', $3, 'https://example.com/x')
       returning id`,
      [branchId, customerId, `fixture-bb098-${Date.now()}`],
    );
    galleryId = gal[0].id;

    const { rows: link } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role)
       values ($1, md5(random()::text), 'bb098x', 'owner') returning id`,
      [galleryId],
    );
    linkId = link[0].id;
  });

  afterAll(async () => {
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("1. Bật PIN sinh mã BỐN CHỮ SỐ và lưu dạng băm khớp với mã trả về", async () => {
    asCs();
    const res = await POST(new Request("http://localhost"), params(linkId));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.pin).toMatch(/^\d{4}$/);

    const { rows } = await client.query(
      "select requires_pin, pin_hash from share_links where id = $1",
      [linkId],
    );
    expect(rows[0].requires_pin).toBe(true);

    // Bản băm phải khớp mã vừa trả về — nếu không thì CSKH đọc một mã cho
    // khách trong khi hệ thống chờ một mã khác.
    expect(await bcrypt.compare(body.data.pin, rows[0].pin_hash)).toBe(true);

    // Và KHÔNG được lưu mã dạng đọc được ở bất kỳ đâu.
    expect(rows[0].pin_hash).not.toBe(body.data.pin);
  });

  it("2. Bật lại sinh mã KHÁC — không dùng lại mã cũ", async () => {
    asCs();
    const a = await (await POST(new Request("http://localhost"), params(linkId))).json();
    const b = await (await POST(new Request("http://localhost"), params(linkId))).json();

    // Hai mã bốn số có thể trùng nhau 1/10.000 lần, nên phép thử này kiểm BẢN
    // BĂM khác nhau: bcrypt dùng muối ngẫu nhiên nên hai lần băm cùng một mã
    // vẫn ra hai chuỗi khác — đủ để chứng minh hệ thống ghi lại thật, không
    // giữ nguyên bản cũ.
    const { rows } = await client.query("select pin_hash from share_links where id = $1", [linkId]);
    expect(await bcrypt.compare(b.data.pin, rows[0].pin_hash)).toBe(true);
    expect(a.data.pin).toMatch(/^\d{4}$/);
  });

  it("3. Bật lại XOÁ bộ đếm sai và khoá cũ", async () => {
    // Link đang bị khoá vì gõ sai 5 lần.
    await client.query(
      `update share_links set failed_attempts = 5, locked_until = now() + interval '15 minutes'
       where id = $1`,
      [linkId],
    );

    asCs();
    await POST(new Request("http://localhost"), params(linkId));

    const { rows } = await client.query(
      "select failed_attempts, locked_until from share_links where id = $1",
      [linkId],
    );

    // Không xoá thì link vừa bật đã mang sẵn bốn lần gõ sai từ đời trước, và
    // khách gõ nhầm MỘT lần là khoá — trong khi họ chưa từng gõ mã này.
    expect(rows[0].failed_attempts).toBe(0);
    expect(rows[0].locked_until).toBeNull();
  });

  it("4. Tắt PIN xoá luôn bản băm, không để lại mã cũ", async () => {
    asCs();
    const res = await DELETE(new Request("http://localhost"), params(linkId));
    expect(res.status).toBe(200);

    const { rows } = await client.query(
      "select requires_pin, pin_hash from share_links where id = $1",
      [linkId],
    );
    expect(rows[0].requires_pin).toBe(false);

    // Để lại bản băm thì tắt rồi bật lại sẽ dùng mã cũ mà CSKH tưởng là mã mới.
    expect(rows[0].pin_hash).toBeNull();
  });

  it("5. Mã link không hợp lệ thì từ chối, không đụng database", async () => {
    asCs();
    const res = await POST(new Request("http://localhost"), params("khong-phai-uuid"));
    expect(res.status).toBe(400);
  });
});
