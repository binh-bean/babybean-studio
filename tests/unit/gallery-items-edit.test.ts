/**
 * BB-103 — CSKH sửa dòng hàng của bộ ảnh.
 *
 * Hai phép thử quan trọng nhất ở đây không phải là "sửa được không", mà là
 * "KHÔNG sửa được cái gì": dòng hàng của bộ ảnh khác, và bộ ảnh khách đã chốt.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { POST, PATCH, DELETE } from "@/app/api/admin/galleries/[id]/items/route";

describe("BB-103: CSKH sửa dòng hàng", () => {
  let client: Client;
  let branchId: string;
  let editFileProductId: string;
  const made: { galleryId: string; customerId: string }[] = [];

  async function makeGallery(status = "ready") {
    const { rows: cust } = await client.query(
      `insert into customers (branch_id, full_name)
       values ($1,'Fixture BB-103 Khách') returning id`,
      [branchId],
    );
    const { rows: gal } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url)
       values ($1,$2,'Fixture BB-103',$3,$4,'https://example.com/x') returning id`,
      [branchId, cust[0].id, status, `fixture-bb103-${Date.now()}-${Math.random()}`],
    );
    made.push({ galleryId: gal[0].id, customerId: cust[0].id });
    return gal[0].id as string;
  }

  function asCs() {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000103",
      role: "cs",
      branchIds: [branchId],
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const req = (body: unknown) =>
    new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: p } = await client.query(
      "select id from products where kind = 'edited_photo' limit 1",
    );
    editFileProductId = p[0].id;
  });

  afterAll(async () => {
    for (const m of made) {
      await client.query("delete from galleries where id = $1", [m.galleryId]);
      await client.query("delete from customers where id = $1", [m.customerId]);
    }
    await client.end();
  });

  it("1. Thêm dòng Edit file làm ĐỔI HẠN MỨC, và API nói rõ trước/sau", async () => {
    const galleryId = await makeGallery();
    asCs();

    const res = await POST(req({ productId: editFileProductId, quantity: 15 }), params(galleryId));
    const body = await res.json();

    expect(res.status).toBe(200);
    // Trước khi thêm chưa có dòng nào nên hạn mức là CHƯA BIẾT, không phải 0.
    expect(body.data.quotaBefore).toBeNull();
    expect(body.data.quotaAfter).toBe(15);
  });

  it("2. Đổi số lượng đổi hạn mức theo — đây là sửa tiền của khách", async () => {
    const galleryId = await makeGallery();
    asCs();

    const added = await (
      await POST(req({ productId: editFileProductId, quantity: 10 }), params(galleryId))
    ).json();

    const res = await PATCH(
      req({ itemId: added.data.id, quantity: 25 }),
      params(galleryId),
    );
    const body = await res.json();

    expect(body.data.quotaBefore).toBe(10);
    expect(body.data.quotaAfter).toBe(25);
  });

  it("3. KHÔNG sửa được dòng hàng của bộ ảnh KHÁC", async () => {
    const galleryA = await makeGallery();
    const galleryB = await makeGallery();
    asCs();

    const inA = await (
      await POST(req({ productId: editFileProductId, quantity: 5 }), params(galleryA))
    ).json();

    // Gọi trên bộ ảnh B nhưng đưa mã dòng hàng của A. Kiểm quyền chi nhánh ở
    // trên KHÔNG chặn được việc này — cả hai cùng chi nhánh. Thứ chặn là mệnh
    // đề .eq("gallery_id", galleryId) trong câu update.
    await PATCH(req({ itemId: inA.data.id, quantity: 99 }), params(galleryB));

    const { rows } = await client.query("select quantity from gallery_items where id = $1", [
      inA.data.id,
    ]);
    expect(rows[0].quantity).toBe(5);
  });

  it("4. Bộ ảnh khách ĐÃ CHỐT thì không sửa được nữa", async () => {
    const galleryId = await makeGallery("submitted");
    asCs();

    const res = await POST(req({ productId: editFileProductId, quantity: 3 }), params(galleryId));
    expect(res.status).toBe(409);

    const { rows } = await client.query(
      "select count(*)::int n from gallery_items where gallery_id = $1",
      [galleryId],
    );
    expect(rows[0].n).toBe(0);
  });

  it("5. Số lượng 0 hoặc âm bị từ chối", async () => {
    const galleryId = await makeGallery();
    asCs();

    for (const q of [0, -3, 1.5]) {
      const res = await POST(req({ productId: editFileProductId, quantity: q }), params(galleryId));
      expect(res.status).toBe(400);
    }
  });

  it("6. Bỏ dòng Edit file đưa hạn mức về CHƯA BIẾT, không phải 0", async () => {
    const galleryId = await makeGallery();
    asCs();

    const added = await (
      await POST(req({ productId: editFileProductId, quantity: 8 }), params(galleryId))
    ).json();

    const res = await DELETE(req({ itemId: added.data.id }), params(galleryId));
    const body = await res.json();

    expect(body.data.quotaBefore).toBe(8);
    // Chưa biết khác hẳn bằng 0: bằng 0 là khách không được ảnh nào miễn phí,
    // chưa biết là studio chưa nhập dữ liệu. Hai câu trả lời khác nhau cho khách.
    expect(body.data.quotaAfter).toBeNull();
  });
});
