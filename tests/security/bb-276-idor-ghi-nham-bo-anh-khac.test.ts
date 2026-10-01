/**
 * BB-276 — soát bảo mật API khách mới thêm, trước khi mở app cho mọi khách.
 *
 * OWNER: Sonnet (BB-276), theo lệnh SEC-ARCH/AGENTS.md §2.6.
 *
 * ---------------------------------------------------------------------------
 * Hai lỗ IDOR tìm thấy khi soát, cả hai đã vá trong cùng lượt này
 * ---------------------------------------------------------------------------
 * 1. `DELETE /api/g/placements` — nhánh nhận thẳng `selectionItemId` từ thân
 *    yêu cầu KHÔNG kiểm nó có thuộc đúng `session.selectionId`/`galleryId`
 *    hay không (nhánh suy ra từ `photoId` thì CÓ kiểm — hai nhánh lệch nhau).
 *    Một phiên hợp lệ của bộ ảnh A gửi `selectionItemId` của bộ ảnh B là xoá
 *    được đúng dòng đặt ảnh vào sản phẩm in của khách B.
 * 2. `DELETE /api/g/thong-bao` — xoá đăng ký Web Push chỉ theo `endpoint`,
 *    không khoá theo `gallery_id` của phiên đang gọi. Một phiên của bộ ảnh A
 *    biết (hoặc đoán trúng) endpoint của bộ ảnh B là tắt được thông báo của
 *    B.
 *
 * Phép thử ở đây gọi THẲNG route handler (không giả lập lớp đang đo), giả
 * lập `requireGallerySession` để cắm phiên — cùng khuôn với
 * `tests/security/khach-xem-duoc-anh.test.ts` (BB-133). Dữ liệu là
 * "Fixture BB-276 …", dọn theo id ở `afterAll`.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { DELETE as xoaDatAnh } from "@/app/api/g/placements/route";
import { DELETE as huyThongBao } from "@/app/api/g/thong-bao/route";
import { SubmitSelectionSchema } from "@/app/api/g/submit/schema";

describe("BB-276: IDOR ghi/xoá nhầm dữ liệu của bộ ảnh khác", () => {
  let client: Client;
  let branchId: string;

  // Bộ ảnh A (kẻ tấn công — phiên hợp lệ) và bộ ảnh B (nạn nhân).
  let khachA = "", khachB = "";
  let boA = "", boB = "";
  let linkA = "";
  let selectionA = "", selectionB = "";
  let anhA = "", anhB = "";
  let productId = "";
  let galleryItemA = "", galleryItemB = "";
  let selectionItemA = "", selectionItemB = "";

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

  function xoaReq(body: unknown) {
    return new NextRequest("http://localhost/api/g/placements", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function huyThongBaoReq(endpoint: string) {
    return new Request("http://localhost/api/g/thong-bao", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    async function dungBo(ten: string) {
      const { rows: c } = await client.query(
        `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
        [branchId, `Fixture BB-276 Khách ${ten}`],
      );
      const { rows: g } = await client.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, included_quota)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',1,10) returning id`,
        [branchId, c[0].id, `Fixture BB-276 ${ten}`, `fixture-bb276-${ten}-${Date.now()}`],
      );
      const { rows: l } = await client.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
         values ($1, md5(random()::text || $2), 'bb276x', 'owner', 'active') returning id`,
        [g[0].id, ten],
      );
      const { rows: s } = await client.query(
        `insert into selections (gallery_id, share_link_id, display_name, is_primary)
         values ($1, $2, $3, true) returning id`,
        [g[0].id, l[0].id, `Fixture BB-276 ${ten}`],
      );
      const { rows: p } = await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,'anh.jpg','image/jpeg',1,'active') returning id`,
        [g[0].id, `fixture-bb276-file-${ten}-${Date.now()}`],
      );
      return { khach: c[0].id as string, bo: g[0].id as string, link: l[0].id as string, selection: s[0].id as string, anh: p[0].id as string };
    }

    const a = await dungBo("A");
    khachA = a.khach; boA = a.bo; linkA = a.link; selectionA = a.selection; anhA = a.anh;
    const b = await dungBo("B");
    khachB = b.khach; boB = b.bo; selectionB = b.selection; anhB = b.anh;

    const { rows: prod } = await client.query(
      // BB-339: hàng in phải có trong bảng giá 01/10 (chất liệu + kích thước) mới bán.
      `insert into products (name, kind, material, size, list_price) values ('Fixture BB-276 In ảnh', 'print', 'Gỗ', '40x60', 100000) returning id`,
    );
    productId = prod[0].id;

    const { rows: giA } = await client.query(
      `insert into gallery_items (gallery_id, product_id, quantity) values ($1,$2,1) returning id`,
      [boA, productId],
    );
    galleryItemA = giA[0].id;
    const { rows: giB } = await client.query(
      `insert into gallery_items (gallery_id, product_id, quantity) values ($1,$2,1) returning id`,
      [boB, productId],
    );
    galleryItemB = giB[0].id;

    const { rows: siA } = await client.query(
      `insert into selection_items (selection_id, photo_id, gallery_id, mark)
       values ($1,$2,$3,'selected') returning id`,
      [selectionA, anhA, boA],
    );
    selectionItemA = siA[0].id;
    const { rows: siB } = await client.query(
      `insert into selection_items (selection_id, photo_id, gallery_id, mark)
       values ($1,$2,$3,'selected') returning id`,
      [selectionB, anhB, boB],
    );
    selectionItemB = siB[0].id;

    // Đặt sẵn ảnh B vào sản phẩm in của B — đây là dòng dữ liệu "nạn nhân".
    await client.query(
      `insert into selection_placements (selection_item_id, gallery_item_id) values ($1,$2)`,
      [selectionItemB, galleryItemB],
    );
    // Và của A, để làm đối chứng dương (phiên A xoá đúng của mình vẫn phải được).
    await client.query(
      `insert into selection_placements (selection_item_id, gallery_item_id) values ($1,$2)`,
      [selectionItemA, galleryItemA],
    );
  });

  afterAll(async () => {
    await client.query("delete from galleries where id = any($1)", [[boA, boB]]);
    await client.query("delete from customers where id = any($1)", [[khachA, khachB]]);
    await client.query("delete from products where id = $1", [productId]);
    // Dọn rác cũ (>= 6 giờ) từ những lần chạy trước bị ngắt giữa chừng.
    await client.query(
      `delete from customers where full_name like 'Fixture BB-276 %' and created_at < now() - interval '6 hours'`,
    );
    await client.end();
  });

  describe("1. DELETE /api/g/placements — selectionItemId của bộ ảnh khác", () => {
    it("phiên bộ ảnh A gửi selectionItemId của bộ ảnh B -> NOT_FOUND, KHÔNG xoá được", async () => {
      phien({ galleryId: boA, selectionId: selectionA, shareLinkId: linkA });

      const res = await xoaDatAnh(xoaReq({ selectionItemId: selectionItemB, galleryItemId: galleryItemB }));
      const { status, code } = await maLoi(res);
      expect(status).toBe(404);
      expect(code).toBe("NOT_FOUND");

      const { rows } = await client.query(
        "select 1 from selection_placements where selection_item_id=$1 and gallery_item_id=$2",
        [selectionItemB, galleryItemB],
      );
      expect(rows.length).toBe(1); // dòng của B vẫn còn nguyên
    });

    it("đối chứng dương: phiên bộ ảnh A xoá ĐÚNG dòng của chính mình thì được", async () => {
      phien({ galleryId: boA, selectionId: selectionA, shareLinkId: linkA });

      const res = await xoaDatAnh(xoaReq({ selectionItemId: selectionItemA, galleryItemId: galleryItemA }));
      expect(res.status).toBe(200);

      const { rows } = await client.query(
        "select 1 from selection_placements where selection_item_id=$1 and gallery_item_id=$2",
        [selectionItemA, galleryItemA],
      );
      expect(rows.length).toBe(0);
    });
  });

  describe("2. DELETE /api/g/thong-bao — endpoint của bộ ảnh khác", () => {
    const endpointB = "https://fcm.googleapis.com/fcm/send/fixture-bb276-victim";
    const endpointA = "https://fcm.googleapis.com/fcm/send/fixture-bb276-attacker-own";

    beforeAll(async () => {
      await client.query(
        `insert into push_dang_ky (gallery_id, endpoint, p256dh, auth) values ($1,$2,'p','a')`,
        [boB, endpointB],
      );
      await client.query(
        `insert into push_dang_ky (gallery_id, endpoint, p256dh, auth) values ($1,$2,'p','a')`,
        [boA, endpointA],
      );
    });

    afterAll(async () => {
      await client.query("delete from push_dang_ky where endpoint = any($1)", [[endpointA, endpointB]]);
    });

    it("phiên bộ ảnh A gửi endpoint đăng ký cho bộ ảnh B -> không xoá được đăng ký của B", async () => {
      phien({ galleryId: boA, selectionId: selectionA, shareLinkId: linkA });

      await huyThongBao(huyThongBaoReq(endpointB));

      const { rows } = await client.query("select 1 from push_dang_ky where endpoint=$1", [endpointB]);
      expect(rows.length).toBe(1); // đăng ký của B vẫn còn
    });

    it("đối chứng dương: phiên bộ ảnh A huỷ ĐÚNG đăng ký của chính mình thì được", async () => {
      phien({ galleryId: boA, selectionId: selectionA, shareLinkId: linkA });

      const res = await huyThongBao(huyThongBaoReq(endpointA));
      expect(res.status).toBe(200);

      const { rows } = await client.query("select 1 from push_dang_ky where endpoint=$1", [endpointA]);
      expect(rows.length).toBe(0);
    });
  });

  describe("3. submit: confirmedByName phải có trần độ dài", () => {
    it("chuỗi 500 ký tự bị từ chối (trần 200)", () => {
      const parsed = SubmitSelectionSchema.safeParse({
        confirmedByName: "a".repeat(500),
        agreed: true,
      });
      expect(parsed.success).toBe(false);
    });

    it("đối chứng dương: tên bình thường vẫn qua", () => {
      const parsed = SubmitSelectionSchema.safeParse({
        confirmedByName: "Nguyễn Thị Mai",
        agreed: true,
      });
      expect(parsed.success).toBe(true);
    });
  });
});
