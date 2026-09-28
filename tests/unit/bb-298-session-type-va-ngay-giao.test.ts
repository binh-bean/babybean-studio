/**
 * BB-298 — hai trường thêm vào `GET /api/g/gallery` cho màn bìa/đã giao (bản
 * vẽ BB-297, admin duyệt 28/09/2026):
 *
 *   1. `sessionType` — "loại buổi chụp" (Thôi nôi, Newborn…), lấy từ cột có
 *      sẵn `shoots.concept` qua `galleries.shoot_id`. Không đổi schema.
 *   2. `review.deliveredAt` — ngày giao thật từ `deliveries.delivered_at`,
 *      cho dấu "Đã hoàn thiện · giao ngày dd/mm/yyyy" ở màn Đã giao.
 *
 * Cả hai đều PHẢI ẩn (trả `null`), không được bịa, khi dữ liệu không có —
 * canh cả nhánh có và nhánh thiếu.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { GET as layGallery } from "@/app/api/g/gallery/route";

describe("BB-298: sessionType (loại buổi chụp) và ngày giao thật", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let shootId = "";
  let galleryConSessionId = "";
  let galleryKhongShootId = "";
  let selectionConSessionId = "";
  let selectionKhongShootSelectionId = "";
  let shareLinkConSessionId = "";
  let shareLinkKhongShootId = "";
  let deliveryId = "";
  const LOAI_BUOI_CHUP = "Fixture BB-298 Thôi nôi";
  const NGAY_GIAO = "2026-10-06T03:00:00.000Z";

  function phien(galleryId: string, selectionId: string, shareLinkId: string) {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      customerId: null,
      role: "owner",
      shareLinkId,
      selectionId,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, "Fixture BB-298 Mẹ Bean"],
    );
    customerId = kh[0].id;

    const { rows: sh } = await client.query(
      `insert into shoots (branch_id, customer_id, shoot_date, concept) values ($1,$2,'2026-09-12',$3) returning id`,
      [branchId, customerId, LOAI_BUOI_CHUP],
    );
    shootId = sh[0].id;

    // Bộ ảnh 1 — CÓ buổi chụp gắn loại (nhánh "có dữ liệu").
    const { rows: g1 } = await client.query(
      `insert into galleries (branch_id, customer_id, shoot_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,$3,'Fixture BB-298 A','delivered',$4,'https://example.com/x',3,5) returning id`,
      [branchId, customerId, shootId, `fixture-bb298a-${Date.now()}`],
    );
    galleryConSessionId = g1[0].id;

    const { rows: lk1 } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb298a', 'owner', 'active') returning id`,
      [galleryConSessionId],
    );
    shareLinkConSessionId = lk1[0].id;
    const { rows: sel1 } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryConSessionId, shareLinkConSessionId],
    );
    selectionConSessionId = sel1[0].id;

    const { rows: dv } = await client.query(
      `insert into deliveries (gallery_id, branch_id, status, delivered_at) values ($1,$2,'delivered',$3) returning id`,
      [galleryConSessionId, branchId, NGAY_GIAO],
    );
    deliveryId = dv[0].id;

    // Bộ ảnh 2 — KHÔNG gắn buổi chụp nào (shoot_id null) và chưa giao (không
    // có dòng `deliveries`) — nhánh "thiếu dữ liệu" phải trả null, không lỗi.
    const { rows: g2 } = await client.query(
      `insert into galleries (branch_id, customer_id, shoot_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,null,'Fixture BB-298 B','ready',$3,'https://example.com/y',0,5) returning id`,
      [branchId, customerId, `fixture-bb298b-${Date.now()}`],
    );
    galleryKhongShootId = g2[0].id;

    const { rows: lk2 } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb298b', 'owner', 'active') returning id`,
      [galleryKhongShootId],
    );
    shareLinkKhongShootId = lk2[0].id;
    const { rows: sel2 } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryKhongShootId, shareLinkKhongShootId],
    );
    selectionKhongShootSelectionId = sel2[0].id;
  });

  afterAll(async () => {
    await client.query("delete from activity_logs where entity_id in ($1,$2)", [
      galleryConSessionId,
      galleryKhongShootId,
    ]);
    await client.query("delete from deliveries where id = $1", [deliveryId]);
    await client.query("delete from galleries where id in ($1,$2)", [galleryConSessionId, galleryKhongShootId]);
    await client.query("delete from shoots where id = $1", [shootId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("1. Bộ ảnh có buổi chụp ghi loại → sessionType đúng loại buổi chụp, và review.deliveredAt đúng ngày giao thật", async () => {
    phien(galleryConSessionId, selectionConSessionId, shareLinkConSessionId);
    const res = await layGallery(new Request("http://localhost/api/g/gallery"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.sessionType).toBe(LOAI_BUOI_CHUP);
    // Postgres trả timestamptz theo dạng `+00:00`, không phải hậu tố `Z` —
    // so bằng thời điểm (epoch), không so chuỗi thô.
    expect(new Date(json.data.review?.deliveredAt).getTime()).toBe(new Date(NGAY_GIAO).getTime());
  });

  it("2. Bộ ảnh không gắn buổi chụp và chưa giao → sessionType null, không ném lỗi (bộ ảnh chưa tới bước Đã giao nên review là null)", async () => {
    phien(galleryKhongShootId, selectionKhongShootSelectionId, shareLinkKhongShootId);
    const res = await layGallery(new Request("http://localhost/api/g/gallery"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.sessionType).toBeNull();
    expect(json.data.review).toBeNull();
  });
});
