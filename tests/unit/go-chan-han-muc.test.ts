/**
 * BB-125 — CSKH gỡ được bộ ảnh đang bị chặn vì chưa rõ hạn mức.
 *
 * Chín bộ ảnh thật đang ở trạng thái "chưa biết hạn mức" sau khi 0039 xoá số
 * 20 bịa. Cổng QUOTA_UNKNOWN chặn khách chọn ảnh — đúng như thiết kế. Nhưng
 * màn hình bảo CSKH "thêm dòng Edit file bên dưới" mà KHÔNG có nút nào để
 * làm: đường POST có sẵn, giao diện thiếu.
 *
 * Phép thử này đi đúng đường CSKH sẽ đi: bộ chưa rõ hạn mức → thêm một dòng
 * ảnh chỉnh sửa → hạn mức có số → khách chọn được.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET as getItems, POST as addItem } from "@/app/api/admin/galleries/[id]/items/route";

describe("BB-125: gỡ bộ ảnh bị chặn vì chưa rõ hạn mức", () => {
  let client: Client;
  let branchId: string;
  let galleryId: string;
  let customerId: string;
  let anhChinhSuaId: string;

  const params = () => ({ params: Promise.resolve({ id: galleryId }) });
  const req = (v?: unknown) =>
    new Request("http://localhost", v === undefined ? {} : { method: "POST", body: JSON.stringify(v) });

  function asCs() {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000125",
      role: "cs",
      branchIds: [branchId],
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  const quota = async () => {
    const { rows } = await client.query("select app.gallery_quota($1) q", [galleryId]);
    return rows[0].q as number | null;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: pr } = await client.query(
      "select id from products where kind = 'edited_photo' and is_active limit 1",
    );
    if (pr.length === 0) throw new Error("Cần một sản phẩm kind=edited_photo");
    anhChinhSuaId = pr[0].id;

    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name)
       values ($1,'Fixture BB-125 Khách') returning id`,
      [branchId],
    );
    customerId = c[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, included_quota)
       values ($1,$2,'Fixture BB-125','draft',$3,'https://example.com/x', null)
       returning id`,
      [branchId, customerId, `fixture-bb125-${Date.now()}`],
    );
    galleryId = g[0].id;
  });

  afterAll(async () => {
    await client.query("delete from gallery_items where gallery_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  beforeEach(async () => {
    await client.query("delete from gallery_items where gallery_id = $1", [galleryId]);
    await client.query("update galleries set included_quota = null where id = $1", [galleryId]);
  });

  it("1. Chưa có dòng nào -> hạn mức chưa biết, khách bị chặn", async () => {
    expect(await quota()).toBeNull();
  });

  it("2. Màn hình nhận được danh mục sản phẩm để chọn", async () => {
    // Không có danh mục thì ô chọn rỗng, và nút thêm vô dụng.
    asCs();
    const res = await getItems(req(), params());
    const json = await res.json();
    expect(json.data.catalog.length).toBeGreaterThan(0);
    expect(json.data.catalog.some((p: { kind: string }) => p.kind === "edited_photo")).toBe(true);
  });

  it("3. CSKH thêm dòng ảnh chỉnh sửa -> hạn mức có số", async () => {
    asCs();
    const res = await addItem(req({ productId: anhChinhSuaId, quantity: 15 }), params());
    expect(res.status).toBe(200);

    const json = await res.json();
    // Câu trả lời nói rõ trước và sau, để màn hình hỏi lại bằng CON SỐ.
    expect(json.data.quotaBefore).toBeNull();
    expect(json.data.quotaAfter).toBe(15);
    expect(await quota()).toBe(15);
  });

  it("4. Thêm tiếp thì cộng dồn, không ghi đè", async () => {
    asCs();
    await addItem(req({ productId: anhChinhSuaId, quantity: 15 }), params());
    await addItem(req({ productId: anhChinhSuaId, quantity: 5 }), params());
    expect(await quota()).toBe(20);
  });

  it("5. Số lượng không hợp lệ -> từ chối, hạn mức vẫn chưa biết", async () => {
    asCs();
    for (const q of [0, -3, 1.5]) {
      const res = await addItem(req({ productId: anhChinhSuaId, quantity: q }), params());
      expect(res.status, `số lượng ${q}`).toBe(400);
    }
    expect(await quota()).toBeNull();
  });

  it("6. Thiếu sản phẩm -> từ chối", async () => {
    asCs();
    const res = await addItem(req({ quantity: 10 }), params());
    expect(res.status).toBe(400);
  });
});
