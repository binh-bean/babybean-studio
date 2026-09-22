/**
 * BB-105 — ba mẹ mua thêm sản phẩm ngoài gói.
 *
 * ---------------------------------------------------------------------------
 * Tính năng có đủ mọi mảnh, và chưa bao giờ chạy
 * ---------------------------------------------------------------------------
 * Đo trên bb-dev ngày 22/09/2026: `selection_addons` có **0 dòng**. Không phải
 * vì khách không mua, mà vì **không ai bấm mua được**:
 *
 *   · Màn khách dựng `AddonSelector` mà KHÔNG truyền `onChange` — bấm cộng trừ
 *     không đi đâu cả.
 *   · Danh sách sản phẩm lại lấy từ chính những dòng ĐÃ MUA, nên chưa mua gì
 *     thì không có gì để mua. Vòng tròn khép kín.
 *   · Và `POST /api/g/addons` chèn thẳng một dòng mỗi lượt gọi: nối dây xong
 *     thì bấm ba lần là ba dòng, hoá đơn tính tiền ba lần.
 *
 * Phép thử này canh đường đã sửa: ĐẶT số lượng (0 là bỏ mua), một sản phẩm một
 * dòng, và ba luật tiền của BB-105 vẫn nguyên.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { POST as muaThem } from "@/app/api/g/addons/route";
import { GET as xemBoAnh } from "@/app/api/g/gallery/route";

describe("BB-105: mua thêm sản phẩm ngoài gói", () => {
  let client: Client;
  let galleryId = "";
  let customerId = "";
  let selectionId = "";
  let shareLinkId = "";
  let spBanDuoc = "";
  let giaNiemYet = 0;
  let spKhongBan = "";

  function phien(role = "owner", khoa = false) {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      customerId: null,
      role,
      shareLinkId,
      selectionId: khoa ? selectionId : selectionId,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  const goi = (productId: string, quantity: number) =>
    muaThem(
      new Request("http://localhost/api/g/addons", {
        method: "POST",
        body: JSON.stringify({ productId, quantity }),
      }),
    );

  const demDong = async () => {
    const { rows } = await client.query(
      "select product_id, quantity, unit_price from selection_addons where selection_id = $1 order by product_id",
      [selectionId],
    );
    return rows;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-105') returning id`,
      [br[0].id],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,'Fixture BB-105','ready',$3,'https://example.com/x',2,5) returning id`,
      [br[0].id, customerId, `fixture-bb105-${Date.now()}`],
    );
    galleryId = g[0].id;

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb105a', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkId = lk[0].id;
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryId, shareLinkId],
    );
    selectionId = sel[0].id;

    const { rows: sp } = await client.query(
      `select id, list_price from products
        where is_active and list_price is not null and price_confidence >= 0.8 and price_samples >= 5
        order by list_price limit 1`,
    );
    spBanDuoc = sp[0].id;
    giaNiemYet = Number(sp[0].list_price);

    const { rows: sp2 } = await client.query(
      `select id from products where is_active and (price_confidence < 0.8 or price_samples < 5 or list_price is null) limit 1`,
    );
    spKhongBan = sp2[0]?.id ?? "";
  });

  afterAll(async () => {
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("1. Đặt số lượng 2 thì có ĐÚNG một dòng, và giá chốt theo bảng giá", async () => {
    phien();
    const res = await goi(spBanDuoc, 2);
    expect(res.status).toBe(200);

    const dong = await demDong();
    expect(dong.length).toBe(1);
    expect(dong[0].quantity).toBe(2);
    expect(Number(dong[0].unit_price)).toBe(giaNiemYet);

    const json = await res.json();
    expect(json.data.totalAddonsAmount).toBe(giaNiemYet * 2);
  });

  it("2. Đặt lại số lượng 5 thì SỬA dòng cũ, không sinh dòng thứ hai", async () => {
    // Đây là lỗi sẽ xảy ra ngay nếu giữ lối chèn thẳng: ba mẹ bấm dấu cộng vài
    // lần là vài dòng cùng một sản phẩm, và hoá đơn cộng hết.
    phien();
    expect((await goi(spBanDuoc, 5)).status).toBe(200);

    const dong = await demDong();
    expect(dong.length).toBe(1);
    expect(dong[0].quantity).toBe(5);
  });

  it("3. Đặt về 0 là BỎ MUA — dòng biến mất, tiền về 0", async () => {
    phien();
    const res = await goi(spBanDuoc, 0);
    expect(res.status).toBe(200);
    expect((await res.json()).data.totalAddonsAmount).toBe(0);
    expect(await demDong()).toEqual([]);
  });

  it("4. Sản phẩm chưa đủ tin cậy về giá thì KHÔNG bán", async () => {
    if (!spKhongBan) return; // bảng giá sạch thì bỏ qua ca này
    phien();
    const res = await goi(spKhongBan, 1);
    expect(res.status).toBe(400);
    expect(await demDong()).toEqual([]);
  });

  it("5. Link chỉ-xem không mua được", async () => {
    phien("viewer");
    expect((await goi(spBanDuoc, 1)).status).toBe(403);
    expect(await demDong()).toEqual([]);
  });

  it("6. Bộ ảnh đã chốt thì không mua thêm được nữa", async () => {
    await client.query("update galleries set status='submitted' where id=$1", [galleryId]);
    phien();
    const res = await goi(spBanDuoc, 1);
    expect(res.status).toBe(409);
    expect(await demDong()).toEqual([]);
    await client.query("update galleries set status='ready' where id=$1", [galleryId]);
  });

  it("7. Màn khách nhận được DANH MỤC để bấm mua, không chỉ những thứ đã mua", async () => {
    // Đây là mắt xích đã đứt: danh sách bày ra lấy từ `items` (đã mua) nên khi
    // chưa mua gì thì không có gì để mua.
    phien();
    const body = await (await xemBoAnh(new Request("http://localhost/api/g/gallery"))).json();

    expect(Array.isArray(body.data.addons.catalogue)).toBe(true);
    expect(body.data.addons.catalogue.length).toBeGreaterThan(0);
    expect(body.data.addons.items).toEqual([]);

    // Mọi thứ bày ra đều phải có giá thật — không bày hàng "CSKH sẽ báo giá".
    for (const sp of body.data.addons.catalogue) {
      expect(typeof sp.unitPrice).toBe("number");
      expect(sp.unitPrice).toBeGreaterThan(0);
    }
    // Không bán buổi chụp qua nút mua thêm.
    expect(body.data.addons.catalogue.some((sp: { kind: string }) => sp.kind === "shoot_package"))
      .toBe(false);
  });

  it("8. Mỗi lượt đặt để lại một dòng nhật ký", async () => {
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    phien();
    await goi(spBanDuoc, 1);
    await goi(spBanDuoc, 0);

    const { rows } = await client.query(
      "select action from activity_logs where entity_id = $1 order by created_at",
      [galleryId],
    );
    expect(rows.map((r) => r.action)).toEqual(["addon.set", "addon.remove"]);
  });
});
