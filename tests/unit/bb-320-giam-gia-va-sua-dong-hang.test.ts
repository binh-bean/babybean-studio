/**
 * BB-320 — hai luật mới của chủ dự án, thử qua route thật trên bb-dev (chỉ dữ
 * liệu "Fixture BB-320", dọn ở afterAll):
 *
 *  A. CSKH sửa dòng hàng được ở MỌI trạng thái trừ "lưu trữ"; bộ đã chốt sửa hạn
 *     mức xong thì `snapshot_extra_amount` (số khách đã nhìn thấy) KHÔNG đổi.
 *  B. Giảm giá %: một dòng riêng loại `giam_gia`, có người ghi + lý do, để số còn
 *     thiếu về đúng 0 khi khách trả phần sau giảm. Không cần migration: dùng cột
 *     `payment_method` sẵn có.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Client } from "pg";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { POST as pay } from "@/app/api/admin/galleries/[id]/payments/route";
import { POST as themDong, PATCH as suaDong, DELETE as xoaDong } from "@/app/api/admin/galleries/[id]/items/route";

describe("BB-320: sửa dòng hàng khi đã chốt + giảm giá %", () => {
  let client: Client;
  let branchId: string;
  let staffId: string;
  let customerId: string;
  let editFileProductId: string;
  const galleryIds: string[] = [];

  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const req = (v: unknown) => new Request("http://localhost", { method: "POST", body: JSON.stringify(v) });

  function asCs() {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role: "cs",
      branchIds: [branchId],
      permissions: quyenCuaVai("cs"),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  /** Bộ ảnh ở trạng thái `status`, khách đã chốt vượt 6 ảnh × 50.000 = 300.000 (chụp lúc chốt). */
  async function taoBo(status: string, snapshot = 300_000) {
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              included_quota, extra_photo_price)
       values ($1,$2,'Fixture BB-320 dong hang',$3,$4,'https://example.com/x',10,50000) returning id`,
      [branchId, customerId, status, `fixture-bb320-dh-${Date.now()}-${Math.random()}`],
    );
    const id = g[0].id as string;
    galleryIds.push(id);
    const { rows: sl } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role)
       values ($1,$2,'bb320x','owner') returning id`,
      [id, `fixture-bb320-hash-${Date.now()}-${Math.random()}`],
    );
    await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary, snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount)
       values ($1,$2,true,16,6,$3)`,
      [id, sl[0].id, snapshot],
    );
    return id;
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
    const { rows: p } = await client.query("select id from products where kind = 'edited_photo' limit 1");
    editFileProductId = p[0].id;
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-320 Khách dong hang') returning id`,
      [branchId],
    );
    customerId = c[0].id;
  });

  afterAll(async () => {
    for (const id of galleryIds) {
      await client.query("delete from gallery_payments where gallery_id = $1", [id]);
      await client.query("delete from activity_logs where entity_id = $1", [id]).catch(() => {});
      await client.query("delete from selections where gallery_id = $1", [id]);
      await client.query("delete from share_links where gallery_id = $1", [id]);
      await client.query("delete from gallery_items where gallery_id = $1", [id]);
      await client.query("delete from galleries where id = $1", [id]);
    }
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  beforeEach(() => asCs());

  // ------------------------------------------------------------------ A
  describe("A. sửa dòng hàng ở mọi trạng thái trừ archived", () => {
    for (const status of ["submitted", "in_retouch", "delivered"]) {
      it(`${status}: thêm, sửa, xoá dòng hàng đều được`, async () => {
        const id = await taoBo(status);
        const them = await themDong(req({ productId: editFileProductId, quantity: 15 }), params(id));
        expect(them.status, "thêm dòng phải được").toBe(200);
        const dong = (await them.json()).data;
        expect(dong.quotaAfter).toBe(15);

        const sua = await suaDong(req({ itemId: dong.id, quantity: 17 }), params(id));
        expect(sua.status, "sửa 15 → 17 phải được").toBe(200);
        const suaJson = (await sua.json()).data;
        expect(suaJson.quotaBefore).toBe(15);
        expect(suaJson.quotaAfter).toBe(17);

        const xoa = await xoaDong(req({ itemId: dong.id }), params(id));
        expect(xoa.status, "xoá dòng phải được").toBe(200);
      });
    }

    it("mỗi lần sửa vẫn ghi nhật ký kèm hạn mức trước/sau", async () => {
      const id = await taoBo("submitted");
      const them = await (await themDong(req({ productId: editFileProductId, quantity: 15 }), params(id))).json();
      await suaDong(req({ itemId: them.data.id, quantity: 17 }), params(id));
      const { rows } = await client.query(
        `select action, metadata from activity_logs where entity_id = $1 and action = 'gallery.item_changed'`,
        [id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].metadata.quotaBefore).toBe(15);
      expect(rows[0].metadata.quotaAfter).toBe(17);
    });

    it("bộ đã chốt sửa hạn mức xong: snapshot_extra_amount (số khách đã thấy) KHÔNG đổi", async () => {
      const id = await taoBo("submitted", 100_000);
      const them = await (await themDong(req({ productId: editFileProductId, quantity: 15 }), params(id))).json();
      await suaDong(req({ itemId: them.data.id, quantity: 17 }), params(id));
      const { rows } = await client.query(
        "select snapshot_extra_amount::int as tien from selections where gallery_id = $1 and is_primary",
        [id],
      );
      expect(rows[0].tien).toBe(100_000);
    });

    it("archived vẫn bị chặn (409 GALLERY_LOCKED) — không thêm, không sửa, không xoá", async () => {
      const id = await taoBo("archived");
      const them = await themDong(req({ productId: editFileProductId, quantity: 3 }), params(id));
      expect(them.status).toBe(409);
      expect((await them.json()).error.code).toBe("GALLERY_LOCKED");
      const { rows } = await client.query("select count(*)::int n from gallery_items where gallery_id = $1", [id]);
      expect(rows[0].n).toBe(0);

      // Có sẵn một dòng (dựng thẳng qua SQL) thì sửa/xoá cũng bị chặn.
      const { rows: it } = await client.query(
        `insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,5,null) returning id`,
        [id, editFileProductId],
      );
      expect((await suaDong(req({ itemId: it[0].id, quantity: 9 }), params(id))).status).toBe(409);
      expect((await xoaDong(req({ itemId: it[0].id }), params(id))).status).toBe(409);
      const { rows: sau } = await client.query("select quantity from gallery_items where id = $1", [it[0].id]);
      expect(sau[0].quantity).toBe(5);
    });
  });

  // ------------------------------------------------------------------ B
  describe("B. giảm giá %", () => {
    const soDong = async (id: string) =>
      (await client.query("select payment_method, amount::int as amount, note, confirmed_by from gallery_payments where gallery_id = $1 order by created_at, amount", [id])).rows;

    it("còn thiếu 300.000, giảm 10%, khách trả 270.000 → còn thiếu về ĐÚNG 0; sổ có dòng giảm giá riêng kèm người ghi + lý do", async () => {
      const id = await taoBo("submitted");
      const res = await pay(req({ discountPercent: 10, amount: 270_000, method: "chuyen_khoan", note: "Khách quen" }), params(id));
      expect(res.status).toBe(200);
      const json = (await res.json()).data;
      expect(json.discountAmount).toBe(30_000);
      expect(json.outstanding).toBe(0);

      const dong = await soDong(id);
      expect(dong).toHaveLength(2);
      const giam = dong.find((d) => d.payment_method === "giam_gia")!;
      const thu = dong.find((d) => d.payment_method === "chuyen_khoan")!;
      expect(giam.amount).toBe(30_000);
      expect(giam.confirmed_by).toBe(staffId);
      expect(giam.note).toContain("Giảm 10%");
      expect(giam.note).toContain("Khách quen");
      expect(thu.amount).toBe(270_000);
    });

    it("máy chủ TỰ tính phần giảm trên số còn thiếu HIỆN TẠI (đã thu 100.000 trước thì giảm 10% của 200.000)", async () => {
      const id = await taoBo("submitted");
      await pay(req({ amount: 100_000, method: "tien_mat" }), params(id));
      const res = await pay(req({ discountPercent: 10, amount: 180_000, method: "tien_mat", note: "Bù buổi sau" }), params(id));
      const json = (await res.json()).data;
      expect(json.discountAmount).toBe(20_000);
      expect(json.outstanding).toBe(0);
    });

    it("chỉ giảm, chưa thu tiền: ghi đúng MỘT dòng giảm, còn thiếu = phần khách phải trả", async () => {
      const id = await taoBo("submitted");
      const res = await pay(req({ discountPercent: 10, note: "Khách quen" }), params(id));
      expect(res.status).toBe(200);
      const json = (await res.json()).data;
      expect(json.outstanding).toBe(270_000);
      expect(await soDong(id)).toHaveLength(1);
    });

    it("giảm giá không có lý do → 400 và KHÔNG ghi dòng nào", async () => {
      const id = await taoBo("submitted");
      const res = await pay(req({ discountPercent: 10, amount: 270_000, method: "tien_mat" }), params(id));
      expect(res.status).toBe(400);
      expect(await soDong(id)).toHaveLength(0);
    });

    it("% ngoài (0, 100] → 400", async () => {
      const id = await taoBo("submitted");
      for (const pt of [150, -5, "abc"]) {
        const res = await pay(req({ discountPercent: pt, amount: 100_000, method: "tien_mat", note: "x" }), params(id));
        expect(res.status, `discountPercent=${pt}`).toBe(400);
      }
      expect(await soDong(id)).toHaveLength(0);
    });

    it("hết nợ rồi thì không giảm được nữa", async () => {
      const id = await taoBo("submitted");
      await pay(req({ amount: 300_000, method: "tien_mat" }), params(id));
      const res = await pay(req({ discountPercent: 10, note: "muộn" }), params(id));
      expect(res.status).toBe(400);
      expect(await soDong(id)).toHaveLength(1);
    });

    it("không giảm giá thì luật cũ giữ nguyên: số tiền 0 vẫn bị từ chối", async () => {
      const id = await taoBo("submitted");
      const res = await pay(req({ amount: 0, method: "tien_mat" }), params(id));
      expect(res.status).toBe(400);
    });
  });
});
