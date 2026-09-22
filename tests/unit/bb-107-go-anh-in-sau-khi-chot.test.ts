/**
 * Chốt xong mà CSKH chưa xác nhận: ĐẶT được ảnh in thì cũng phải GỠ được.
 *
 * Quyết định 22/09/2026 của chủ studio (migration 0060): "chốt danh sách xong
 * vẫn chọn được thêm ảnh nếu khách có nhu cầu", tức trạng thái `submitted`
 * KHÔNG còn là khoá — chỉ khi CSKH chuyển sang chỉnh ảnh mới khoá.
 *
 * ---------------------------------------------------------------------------
 * Vì sao phải có phép thử riêng cho đường GỠ
 * ---------------------------------------------------------------------------
 * `POST /api/g/placements` dùng `isGalleryLocked`, còn `DELETE` thì tự chép tay
 * một danh sách trạng thái riêng — bản chép tay THỨ SÁU trong mã này — và bản
 * đó còn giữ 'submitted'.
 *
 * Hậu quả không phải là một lỗi đỏ ở đâu cả: ba mẹ chốt xong vẫn đặt thêm ảnh
 * vào khung được (POST cho qua), nhưng đặt NHẦM một tấm thì kẹt luôn, chỉ còn
 * đường gọi điện cho studio. Một nửa cánh cửa mở là tệ hơn cả hai nửa đóng.
 *
 * Nên phép thử đi theo cặp, ở cả hai mốc:
 *   · `submitted`  — chưa khoá: đặt được VÀ gỡ được.
 *   · `in_retouch` — đã khoá:   cả hai đều bị chặn.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { POST as datAnh, DELETE as goAnh } from "@/app/api/g/placements/route";
import { NextRequest } from "next/server";

describe("Gỡ ảnh in sau khi ba mẹ đã chốt", () => {
  let client: Client;
  let galleryId = "";
  let customerId = "";
  let selectionId = "";
  let shareLinkId = "";
  let itemAnhIn = "";
  let itemAlbum = "";
  const anh: string[] = [];

  function phien() {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      customerId: null,
      role: "owner",
      shareLinkId,
      selectionId,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  const goi = (than: Record<string, unknown>, xoa = false) => {
    phien();
    const req = new NextRequest("http://localhost/api/g/placements", {
      method: xoa ? "DELETE" : "POST",
      body: JSON.stringify(than),
    });
    return xoa ? goAnh(req) : datAnh(req);
  };

  const demAnhTrongDongHang = async (galleryItemId: string) => {
    const { rows } = await client.query(
      "select count(*)::int n from selection_placements where gallery_item_id = $1",
      [galleryItemId],
    );
    return rows[0].n as number;
  };

  const datTrangThai = (tt: string) =>
    client.query("update galleries set status = $2 where id = $1", [galleryId, tt]);

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-107') returning id`,
      [br[0].id],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,'Fixture BB-107','ready',$3,'https://example.com/x',3,5) returning id`,
      [br[0].id, customerId, `fixture-bb107-${Date.now()}`],
    );
    galleryId = g[0].id;

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb107a', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkId = lk[0].id;
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryId, shareLinkId],
    );
    selectionId = sel[0].id;

    for (const ten of ["A.jpg", "B.jpg", "C.jpg"]) {
      const { rows } = await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',1,'active') returning id`,
        [galleryId, `bb107-${ten}-${Date.now()}`, ten],
      );
      anh.push(rows[0].id);
      await client.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark)
         values ($1,$2,$3,'selected')`,
        [selectionId, rows[0].id, galleryId],
      );
    }

    // Một dòng hàng ẢNH IN và một dòng hàng ALBUM, cả hai đều kind='print'
    // trong bảng giá — đúng như hợp đồng thật từ Lark.
    const { rows: spIn } = await client.query(
      `select id from products
        where is_active and kind = 'print' and coalesce(material,'') not ilike '%album%'
        limit 1`,
    );
    const { rows: spAl } = await client.query(
      `select id from products where is_active and kind = 'print' and material ilike '%album%' limit 1`,
    );

    const { rows: it1 } = await client.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
       values ($1,$2,2,500000) returning id`,
      [galleryId, spIn[0].id],
    );
    itemAnhIn = it1[0].id;

    const { rows: it2 } = await client.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
       values ($1,$2,1,1500000) returning id`,
      [galleryId, spAl[0].id],
    );
    itemAlbum = it2[0].id;
  });

  afterAll(async () => {
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("1. MỘT cuốn album trong gói nhận được NHIỀU tấm", async () => {
    // Hợp đồng ghi số lượng 1, nhưng 1 ở đây là một CUỐN. Máy chủ không được
    // chặn tấm thứ hai — giao diện cũng không, và phép thử bb-107-album lo
    // phần giao diện.
    expect((await goi({ galleryItemId: itemAlbum, photoId: anh[0] })).status).toBe(200);
    expect((await goi({ galleryItemId: itemAlbum, photoId: anh[1] })).status).toBe(200);
    expect((await goi({ galleryItemId: itemAlbum, photoId: anh[2] })).status).toBe(200);
    expect(await demAnhTrongDongHang(itemAlbum)).toBe(3);
  });

  it("2. Chốt rồi mà CSKH chưa xác nhận: vẫn ĐẶT được ảnh in", async () => {
    await datTrangThai("submitted");
    const res = await goi({ galleryItemId: itemAnhIn, photoId: anh[0] });
    expect(res.status).toBe(200);
    expect(await demAnhTrongDongHang(itemAnhIn)).toBe(1);
  });

  it("3. …và GỠ được luôn — đây là vế trước nay bị thiếu", async () => {
    // Đặt nhầm rồi không gỡ được thì nửa cánh cửa mở còn tệ hơn đóng hẳn.
    const res = await goi({ galleryItemId: itemAnhIn, photoId: anh[0] }, true);
    expect(res.status).toBe(200);
    expect(await demAnhTrongDongHang(itemAnhIn)).toBe(0);
  });

  it("4. CSKH đã chuyển cho thợ chỉnh ảnh: khoá CẢ HAI đầu", async () => {
    await datTrangThai("in_retouch");

    const datThem = await goi({ galleryItemId: itemAnhIn, photoId: anh[1] });
    expect(datThem.status).toBe(409);
    expect((await datThem.json()).error.code).toBe("GALLERY_LOCKED");

    const goRa = await goi({ galleryItemId: itemAlbum, photoId: anh[0] }, true);
    expect(goRa.status).toBe(409);
    expect((await goRa.json()).error.code).toBe("GALLERY_LOCKED");

    // Và dữ liệu đúng là không đổi — mã lỗi đúng mà vẫn ghi thì vô nghĩa.
    expect(await demAnhTrongDongHang(itemAlbum)).toBe(3);
    expect(await demAnhTrongDongHang(itemAnhIn)).toBe(0);
  });
});
