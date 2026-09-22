/**
 * Album mua thêm nhận NHIỀU ảnh, và nút "Yêu cầu sửa lại" khi đã khoá.
 *
 * Hai việc chủ studio đặt ra ngày 22/09/2026:
 *
 *   1. "Ở sản phẩm hậu kỳ muốn mua thêm cần gắn với ảnh chọn" — nhưng album
 *      thì khác mọi thứ khác: nó gộp nhiều ảnh vào MỘT cuốn. Ảnh in và khung
 *      gắn thẳng vào `selection_addons.photo_id` (0061); album thì cần bảng
 *      nối riêng (0062).
 *   2. "Nếu nhân sự đã chốt thì cần yêu cầu nhân sự mở lại để sửa, nếu còn đủ
 *      điều kiện sửa."
 *
 * Đường xin sửa lại KHÔNG tự mở bộ ảnh: lúc đó công của thợ chỉnh ảnh đã đổ
 * vào danh sách cũ, và người biết đủ để quyết là CSKH.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { POST as datAnh, DELETE as boAnh } from "@/app/api/g/placements/route";
import { POST as muaThem } from "@/app/api/g/addons/route";
import { POST as xinSuaLai } from "@/app/api/g/xin-sua-lai/route";
import { dungThe } from "@/lib/lark/notify";
import { NextRequest } from "next/server";

describe("Album mua thêm và yêu cầu sửa lại", () => {
  let client: Client;
  let galleryId = "";
  let customerId = "";
  let selectionId = "";
  let shareLinkId = "";
  let spAlbum = "";
  const anh: string[] = [];

  function phien(role = "owner") {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      customerId: null,
      role,
      shareLinkId,
      selectionId,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  const goiDatAnh = (than: Record<string, unknown>, xoa = false) => {
    const req = new NextRequest("http://localhost/api/g/placements", {
      method: xoa ? "DELETE" : "POST",
      body: JSON.stringify(than),
    });
    return xoa ? boAnh(req) : datAnh(req);
  };

  const demAnhTrongAlbum = async (addonId: string) => {
    const { rows } = await client.query(
      "select count(*)::int n from selection_addon_photos where addon_id = $1",
      [addonId],
    );
    return rows[0].n as number;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-106') returning id`,
      [br[0].id],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,'Fixture BB-106','ready',$3,'https://example.com/x',2,5) returning id`,
      [br[0].id, customerId, `fixture-bb106-${Date.now()}`],
    );
    galleryId = g[0].id;

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb106a', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkId = lk[0].id;
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryId, shareLinkId],
    );
    selectionId = sel[0].id;

    for (const ten of ["A.jpg", "B.jpg"]) {
      const { rows } = await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',1,'active') returning id`,
        [galleryId, `bb106-${ten}-${Date.now()}`, ten],
      );
      anh.push(rows[0].id);
      await client.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark)
         values ($1,$2,$3,'selected')`,
        [selectionId, rows[0].id, galleryId],
      );
    }

    const { rows: sp } = await client.query(
      `select id from products
        where is_active and material ilike '%album%' and list_price is not null
          and price_confidence >= 0.8 and price_samples >= 5
        limit 1`,
    );
    spAlbum = sp[0]?.id ?? "";
  });

  afterAll(async () => {
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    await client.query("delete from notifications where payload->>'galleryId' = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("1. Album mua KHÔNG gắn ảnh lúc mua — ảnh đưa vào sau", async () => {
    if (!spAlbum) throw new Error("Bảng giá không có album nào bán được");
    phien();
    const res = await muaThem(
      new Request("http://localhost/api/g/addons", {
        method: "POST",
        body: JSON.stringify({ productId: spAlbum, quantity: 1 }),
      }),
    );
    expect(res.status).toBe(200);

    const { rows } = await client.query(
      "select id, photo_id from selection_addons where selection_id = $1",
      [selectionId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].photo_id).toBeNull();
  });

  it("2. Đưa HAI tấm vào cùng một album, rồi lấy ra một tấm", async () => {
    // Đây là điều album khác mọi thứ khác: một sản phẩm nhận nhiều ảnh.
    const { rows } = await client.query(
      "select id from selection_addons where selection_id = $1",
      [selectionId],
    );
    const addonId = rows[0].id;

    phien();
    expect((await goiDatAnh({ addonId, photoId: anh[0] })).status).toBe(200);
    phien();
    expect((await goiDatAnh({ addonId, photoId: anh[1] })).status).toBe(200);
    expect(await demAnhTrongAlbum(addonId)).toBe(2);

    // Đặt lại tấm cũ: không sinh dòng thứ hai.
    phien();
    expect((await goiDatAnh({ addonId, photoId: anh[0] })).status).toBe(200);
    expect(await demAnhTrongAlbum(addonId)).toBe(2);

    phien();
    expect((await goiDatAnh({ addonId, photoId: anh[1] }, true)).status).toBe(200);
    expect(await demAnhTrongAlbum(addonId)).toBe(1);
  });

  it("3. Không nhét được ảnh vào album của lượt chọn khác", async () => {
    // Đoán một mã dòng mua thêm bất kỳ thì phải trượt, nếu không là nhét ảnh
    // vào album nhà người ta.
    const { rows: lk2 } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb106b', 'owner', 'active') returning id`,
      [galleryId],
    );
    const { rows: sel2 } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,false) returning id`,
      [galleryId, lk2[0].id],
    );
    const { rows: ad2 } = await client.query(
      `insert into selection_addons (selection_id, product_id, quantity, unit_price)
       values ($1,$2,1,100000) returning id`,
      [sel2[0].id, spAlbum],
    );

    phien();
    const res = await goiDatAnh({ addonId: ad2[0].id, photoId: anh[0] });
    expect(res.status).toBe(404);
    expect(await demAnhTrongAlbum(ad2[0].id)).toBe(0);
  });

  it("4. Bộ ảnh CHƯA khoá thì không cần xin — đường này nói thẳng ra", async () => {
    phien();
    const res = await xinSuaLai(
      new Request("http://localhost/api/g/xin-sua-lai", {
        method: "POST",
        body: JSON.stringify({ lyDo: "Em muốn đổi tấm số 12" }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("vẫn đang mở");
  });

  it("5. Đã khoá thì gửi được yêu cầu, và nó để lại dấu cho CSKH", async () => {
    await client.query("update galleries set status='in_retouch' where id=$1", [galleryId]);
    phien();

    const res = await xinSuaLai(
      new Request("http://localhost/api/g/xin-sua-lai", {
        method: "POST",
        body: JSON.stringify({ lyDo: "Em muốn đổi tấm số 12 sang tấm 15" }),
      }),
    );
    expect(res.status).toBe(200);

    const { rows } = await client.query(
      "select metadata from activity_logs where action='gallery.reopen_requested' and entity_id=$1",
      [galleryId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].metadata.lyDo).toBe("Em muốn đổi tấm số 12 sang tấm 15");
    expect(rows[0].metadata.trangThaiLucXin).toBe("in_retouch");

    // Và KHÔNG tự mở: quyết định vẫn thuộc về CSKH.
    const { rows: g } = await client.query("select status::text s from galleries where id=$1", [
      galleryId,
    ]);
    expect(g[0].s).toBe("in_retouch");
  });

  it("6. Lý do rỗng thì từ chối", async () => {
    phien();
    const res = await xinSuaLai(
      new Request("http://localhost/api/g/xin-sua-lai", {
        method: "POST",
        body: JSON.stringify({ lyDo: "   " }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("7. Link chỉ-xem không xin thay khách chính được", async () => {
    phien("viewer");
    const res = await xinSuaLai(
      new Request("http://localhost/api/g/xin-sua-lai", {
        method: "POST",
        body: JSON.stringify({ lyDo: "Bà muốn đổi ảnh" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("8. Có mẫu thẻ Lark cho yêu cầu này — thiếu mẫu là tin rơi im lặng", () => {
    const the = dungThe(
      "gallery.reopen_requested",
      { galleryTitle: "Bé Bean", trangThai: "Đang chỉnh ảnh", lyDo: "Đổi tấm 12" },
      "https://app.example.com/admin/galleries/x",
    );
    expect(the).not.toBeNull();
    const chuoi = JSON.stringify(the);
    expect(chuoi).toContain("Khách xin sửa lại bộ ảnh đã chốt");
    // Lý do phải nằm trong thẻ: CSKH đọc rồi mới quyết được.
    expect(chuoi).toContain("Đổi tấm 12");
  });
});
