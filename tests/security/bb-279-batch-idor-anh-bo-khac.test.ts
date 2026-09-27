/**
 * BB-279 — soát bảo mật nhánh BATCH mới của `POST /api/g/addons`.
 *
 * OWNER: Sonnet (BB-279), theo lệnh SEC-ARCH/AGENTS.md §2.6 — cùng khuôn với
 * `tests/security/bb-276-idor-ghi-nham-bo-anh-khac.test.ts`.
 *
 * Nhánh batch (cửa hàng chọn nhiều tấm cùng lúc) là chỗ MỚI đưa `photoIds`
 * thẳng từ máy khách vào route — đúng hình dạng lỗ IDOR BB-276 đã tìm thấy ở
 * chỗ khác trong cùng file này (kiểm theo lô cũng dễ sót như kiểm theo từng
 * cái). Phép thử ở đây gọi THẲNG route handler, giả lập `requireGallerySession`
 * để cắm phiên của bộ ảnh A, rồi thử lén một `photoId` của bộ ảnh B vào lô.
 *
 * Thước đo (AGENTS.md §5a): đã tự hoàn nguyên nhánh batch (bỏ đoạn kiểm
 * `idThuocBoNay`/`idDaChon`) và chạy lại — test 1 và 2 đỏ đúng như dự kiến,
 * rồi vá lại. Dữ liệu "Fixture BB-279 …", dọn theo id ở `afterAll` + dọn rác
 * ≥6 giờ từ lần chạy bị ngắt giữa chừng.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { POST as postAddon } from "@/app/api/g/addons/route";

describe("BB-279: IDOR nhánh batch của POST /api/g/addons (chọn nhiều tấm)", () => {
  let client: Client;
  let branchId: string;

  let khachA = "", khachB = "";
  let boA = "", boB = "";
  let linkA = "";
  let selectionA = "", selectionB = "";
  let anhA1 = "", anhA2 = "", anhB = "";
  let productInId = "";
  let productAlbumId = "";

  function phien(s: { galleryId: string; selectionId: string; shareLinkId: string }) {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: s.galleryId,
      customerId: null,
      selectionId: s.selectionId,
      shareLinkId: s.shareLinkId,
      role: "owner",
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  const maLoi = async (res: Response) => {
    const j = await res.json().catch(() => null);
    return { status: res.status, code: j?.error?.code ?? null };
  };

  function req(body: unknown) {
    return new NextRequest("http://localhost/api/g/addons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    async function dungBo(ten: string, soAnh: number) {
      const { rows: c } = await client.query(
        `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
        [branchId, `Fixture BB-279 Khách ${ten}`],
      );
      const { rows: g } = await client.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, included_quota)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',$5,10) returning id`,
        [branchId, c[0].id, `Fixture BB-279 ${ten}`, `fixture-bb279-${ten}-${Date.now()}`, soAnh],
      );
      const { rows: l } = await client.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
         values ($1, md5(random()::text || $2), 'bb279xx', 'owner', 'active') returning id`,
        [g[0].id, ten],
      );
      const { rows: s } = await client.query(
        `insert into selections (gallery_id, share_link_id, display_name, is_primary)
         values ($1, $2, $3, true) returning id`,
        [g[0].id, l[0].id, `Fixture BB-279 ${ten}`],
      );
      const anh: string[] = [];
      for (let i = 0; i < soAnh; i++) {
        const { rows: p } = await client.query(
          `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
           values ($1,$2,'anh.jpg','image/jpeg',$3,'active') returning id`,
          [g[0].id, `fixture-bb279-file-${ten}-${i}-${Date.now()}`, i],
        );
        anh.push(p[0].id as string);
        await client.query(
          `insert into selection_items (selection_id, photo_id, gallery_id, mark)
           values ($1,$2,$3,'selected')`,
          [s[0].id, p[0].id, g[0].id],
        );
      }
      return {
        khach: c[0].id as string,
        bo: g[0].id as string,
        link: l[0].id as string,
        selection: s[0].id as string,
        anh,
      };
    }

    const a = await dungBo("A", 2);
    khachA = a.khach; boA = a.bo; linkA = a.link; selectionA = a.selection;
    anhA1 = a.anh[0] as string; anhA2 = a.anh[1] as string;

    const b = await dungBo("B", 1);
    khachB = b.khach; boB = b.bo; selectionB = b.selection; anhB = b.anh[0] as string;
    void selectionB;

    const { rows: prodIn } = await client.query(
      `insert into products (name, kind, list_price, price_confidence, price_samples, is_active)
       values ('Fixture BB-279 In ảnh 30x40', 'print', 100000, 0.9, 10, true) returning id`,
    );
    productInId = prodIn[0].id;

    const { rows: prodAlbum } = await client.query(
      `insert into products (name, kind, material, list_price, price_confidence, price_samples, is_active)
       values ('Fixture BB-279 Album', 'print', 'Album (Ultra HD)', 500000, 0.9, 10, true) returning id`,
    );
    productAlbumId = prodAlbum[0].id;
  });

  afterAll(async () => {
    await client.query("delete from galleries where id = any($1)", [[boA, boB]]);
    await client.query("delete from customers where id = any($1)", [[khachA, khachB]]);
    await client.query("delete from products where id = any($1)", [[productInId, productAlbumId]]);
    await client.query(
      `delete from customers where full_name like 'Fixture BB-279 %' and created_at < now() - interval '6 hours'`,
    );
    await client.end();
  });

  it("lén một photoId của bộ ảnh KHÁC vào lô -> từ chối CẢ LÔ, không ghi dòng nào", async () => {
    phien({ galleryId: boA, selectionId: selectionA, shareLinkId: linkA });

    const res = await postAddon(
      req({ productId: productInId, quantity: 1, photoIds: [anhA1, anhB] }),
    );
    const { status, code } = await maLoi(res);
    expect(status).toBe(400);
    expect(code).toBe("INVALID_INPUT");

    const { rows } = await client.query(
      "select 1 from selection_addons where selection_id=$1 and product_id=$2",
      [selectionA, productInId],
    );
    expect(rows.length).toBe(0); // không ghi lẻ tẻ dòng nào của A dù A hợp lệ
  });

  it("photoId thuộc đúng bộ ảnh nhưng CHƯA được chọn (mark != selected) -> từ chối", async () => {
    phien({ galleryId: boA, selectionId: selectionA, shareLinkId: linkA });

    const { rows: p } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'anh.jpg','image/jpeg',9,'active') returning id`,
      [boA, `fixture-bb279-file-A-chua-chon-${Date.now()}`],
    );
    const anhChuaChon = p[0].id as string;

    const res = await postAddon(
      req({ productId: productInId, quantity: 1, photoIds: [anhA1, anhChuaChon] }),
    );
    const { status, code } = await maLoi(res);
    expect(status).toBe(400);
    expect(code).toBe("INVALID_INPUT");

    await client.query("delete from photos where id = $1", [anhChuaChon]);
  });

  it("đối chứng dương: lô hợp lệ (mọi ảnh thuộc bộ, đã chọn) -> ghi đúng một dòng/tấm", async () => {
    phien({ galleryId: boA, selectionId: selectionA, shareLinkId: linkA });

    const res = await postAddon(
      req({ productId: productInId, quantity: 2, photoIds: [anhA1, anhA2] }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.addons).toHaveLength(2);
    expect(json.data.addons.every((a: { quantity: number }) => a.quantity === 2)).toBe(true);

    const { rows } = await client.query(
      "select photo_id, quantity from selection_addons where selection_id=$1 and product_id=$2",
      [selectionA, productInId],
    );
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.quantity === 2)).toBe(true);
  });

  it("sản phẩm KHÔNG gắn ảnh (album) gửi kèm photoIds -> từ chối, không dùng nhánh batch", async () => {
    phien({ galleryId: boA, selectionId: selectionA, shareLinkId: linkA });

    const res = await postAddon(
      req({ productId: productAlbumId, quantity: 1, photoIds: [anhA1] }),
    );
    const { status, code } = await maLoi(res);
    expect(status).toBe(400);
    expect(code).toBe("INVALID_INPUT");
  });

  it("quá 50 tấm một lượt -> Zod từ chối trước khi chạm database", async () => {
    phien({ galleryId: boA, selectionId: selectionA, shareLinkId: linkA });

    const nhieuAnh = Array.from({ length: 51 }, () => anhA1);
    const res = await postAddon(req({ productId: productInId, quantity: 1, photoIds: nhieuAnh }));
    const { status, code } = await maLoi(res);
    expect(status).toBe(400);
    expect(code).toBe("INVALID_INPUT");
  });
});
