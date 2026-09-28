/**
 * BB-103 — CSKH sửa dòng hàng của bộ ảnh.
 *
 * Hai phép thử quan trọng nhất ở đây không phải là "sửa được không", mà là
 * "KHÔNG sửa được cái gì": dòng hàng của bộ ảnh khác, và bộ ảnh khách đã chốt.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

import { quyenCuaVai } from "../fixtures/phien-nhan-su";
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
      branchIds: [branchId], permissions: quyenCuaVai("cs"), } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
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

  /**
   * BB-313 mục 2 — sửa dòng hàng đến từ Lark PHẢI sống sót qua lần đồng bộ
   * sau (`scripts/sync-lark-contracts.mjs` xoá-rồi-ghi-lại theo
   * `lark_contract_code`). Bốn phép thử dưới đây canh đúng cơ chế "tách
   * khỏi Lark" ở route PATCH/DELETE — KHÔNG gọi script Lark thật (cần token
   * Lark thật, ngoài phạm vi phép thử đơn vị), chỉ canh route đã NULL đúng
   * cột `lark_contract_code` để lần đồng bộ sau (`delete ... where
   * lark_contract_code = $2`) không còn khớp được dòng vừa sửa.
   */
  it("7. Sửa số lượng một dòng CHA còn lark_contract_code → dòng TÁCH khỏi Lark (contract_code về null), giữ lark_record_id", async () => {
    const galleryId = await makeGallery();
    asCs();
    const larkRecordId = `fixture-bb313-parent-${Date.now()}`;
    const { rows: dong } = await client.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price, lark_contract_code, lark_record_id)
       values ($1,$2,15,50000,'HD_FIXTURE_BB313#1',$3) returning id`,
      [galleryId, editFileProductId, larkRecordId],
    );
    const itemId = dong[0].id as string;

    const res = await PATCH(req({ itemId, quantity: 16 }), params(galleryId));
    expect(res.status).toBe(200);

    const { rows } = await client.query(
      "select quantity, lark_contract_code, lark_record_id from gallery_items where id = $1",
      [itemId],
    );
    expect(rows[0].quantity).toBe(16);
    // Tách khỏi hợp đồng: lần đồng bộ Lark sau (`delete ... where
    // lark_contract_code = 'HD_FIXTURE_BB313#1'`) sẽ KHÔNG còn khớp dòng
    // này nữa — số 16 nhân viên vừa sửa sống sót.
    expect(rows[0].lark_contract_code).toBeNull();
    // Giữ nguyên lark_record_id — đây là dấu vết để sync script (đã sửa
    // cùng lúc) BỎ QUA không chèn lại dòng trùng, tránh đếm lặp hạn mức.
    expect(rows[0].lark_record_id).toBe(larkRecordId);
  });

  it("8. Sửa số lượng một dòng CON còn lark_contract_code → TÁCH CẢ dòng cha lẫn dòng con (chặn cascade delete)", async () => {
    const galleryId = await makeGallery();
    asCs();
    const contractCode = "HD_FIXTURE_BB313#2";
    const { rows: cha } = await client.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price, lark_contract_code, lark_record_id)
       values ($1,$2,1,2000000,$3,$4) returning id`,
      [galleryId, editFileProductId, contractCode, `fixture-bb313-cha-${Date.now()}`],
    );
    const chaId = cha[0].id as string;
    const { rows: con } = await client.query(
      `insert into gallery_items (gallery_id, product_id, parent_item_id, quantity, lark_contract_code, lark_record_id)
       values ($1,$2,$3,15,$4,$5) returning id`,
      [galleryId, editFileProductId, chaId, contractCode, `fixture-bb313-con-${Date.now()}`],
    );
    const conId = con[0].id as string;

    const res = await PATCH(req({ itemId: conId, quantity: 16 }), params(galleryId));
    expect(res.status).toBe(200);

    const { rows } = await client.query(
      "select id, quantity, lark_contract_code from gallery_items where id in ($1,$2) order by id",
      [chaId, conId],
    );
    const conSauSua = rows.find((r) => r.id === conId)!;
    const chaSauSua = rows.find((r) => r.id === chaId)!;
    expect(conSauSua.quantity).toBe(16);
    expect(conSauSua.lark_contract_code).toBeNull();
    // `parent_item_id references gallery_items(id) on delete cascade`
    // (db/schema.sql) — dòng cha KHÔNG tách theo thì lần đồng bộ Lark sau
    // xoá đúng dòng cha (vẫn khớp lark_contract_code cũ), CASCADE xoá theo
    // dòng con vừa sửa dù bản thân nó đã tách. Route phải tách LUÔN dòng
    // cha để chặn việc này.
    expect(chaSauSua.lark_contract_code).toBeNull();
  });

  it("9. Nhật ký thao tác ghi ĐÚNG số lượng CỦA DÒNG trước/sau khi sửa (không chỉ hạn mức toàn bộ)", async () => {
    const galleryId = await makeGallery();
    asCs();
    const added = await (
      await POST(req({ productId: editFileProductId, quantity: 10 }), params(galleryId))
    ).json();

    await PATCH(req({ itemId: added.data.id, quantity: 13 }), params(galleryId));

    const { rows } = await client.query(
      `select metadata from activity_logs
        where gallery_id = $1 and action = 'gallery.item_changed'
        order by created_at desc limit 1`,
      [galleryId],
    );
    expect(rows[0].metadata.quantityBefore).toBe(10);
    expect(rows[0].metadata.quantity).toBe(13);
  });

  it("10. Xoá một dòng còn lark_contract_code → API báo tuLark=true (có thể quay lại sau đồng bộ)", async () => {
    const galleryId = await makeGallery();
    asCs();
    const { rows: dongLark } = await client.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price, lark_contract_code, lark_record_id)
       values ($1,$2,5,250000,'HD_FIXTURE_BB313#3',$3) returning id`,
      [galleryId, editFileProductId, `fixture-bb313-del-${Date.now()}`],
    );
    const resLark = await DELETE(req({ itemId: dongLark[0].id }), params(galleryId));
    const bodyLark = await resLark.json();
    expect(bodyLark.data.tuLark).toBe(true);

    // Đối chứng: dòng THÊM TAY (không lark_contract_code) xoá thì KHÔNG có
    // cảnh báo này — không bịa cảnh báo cho dòng chưa từng liên quan Lark.
    const added = await (
      await POST(req({ productId: editFileProductId, quantity: 4 }), params(galleryId))
    ).json();
    const resTay = await DELETE(req({ itemId: added.data.id }), params(galleryId));
    const bodyTay = await resTay.json();
    expect(bodyTay.data.tuLark).toBe(false);
  });
});
