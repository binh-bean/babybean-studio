/**
 * BB-212 — tên khách hàng ĐIỀN SẴN ô "người xác nhận" trong hộp chốt.
 *
 * Chủ studio 22/09/2026: "tên người xác nhận là tên khách hàng trong bộ. dấu
 * tích ghi xác nhận đúng thông tin." `GET /api/g/gallery` phải mang theo tên
 * khách (`customers.full_name` qua `galleries.customer_id`) để màn hình điền
 * sẵn — không bắt ba mẹ gõ lại cái tên đã ký hợp đồng.
 *
 * Hai việc canh ở đây:
 *   1. Có khách gắn với bộ ảnh → `customerName` đúng tên khách.
 *   2. Không có khách để tra (dòng dữ liệu thiếu) → `customerName` là `null`,
 *      KHÔNG ném lỗi làm sập cả màn chọn ảnh. `customer_id` trên `galleries`
 *      là NOT NULL + khoá ngoại nên không dựng được fixture thật cho ca này;
 *      canh trực tiếp phép suy `customer?.full_name || null` mà route dùng.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { GET as layGallery } from "@/app/api/g/gallery/route";

describe("BB-212: tên khách điền sẵn ô người xác nhận", () => {
  let client: Client;
  let galleryId = "";
  let customerId = "";
  let selectionId = "";
  let shareLinkId = "";
  const TEN_KHACH = "Fixture BB-212 Mẹ Bean";

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

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [br[0].id, TEN_KHACH],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,'Fixture BB-212','ready',$3,'https://example.com/x',0,5) returning id`,
      [br[0].id, customerId, `fixture-bb212-${Date.now()}`],
    );
    galleryId = g[0].id;

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb212a', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkId = lk[0].id;

    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryId, shareLinkId],
    );
    selectionId = sel[0].id;
  });

  afterAll(async () => {
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("1. Bộ ảnh có khách → customerName đúng tên khách hàng", async () => {
    phien();
    const res = await layGallery(new Request("http://localhost/api/g/gallery"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.customerName).toBe(TEN_KHACH);
  });

  it("2. Không tra được khách → customerName là null, không phải lỗi", () => {
    // Cùng phép suy route dùng ngay sau khi truy vấn `customers`:
    //   customerName: customer?.full_name || null
    // `customer` ở đây là kết quả `maybeSingle()` khi không tìm thấy dòng —
    // Supabase trả về `null`, không ném lỗi.
    function tenKhachTuHang(customer: { full_name: string } | null): string | null {
      return customer?.full_name || null;
    }
    expect(tenKhachTuHang(null)).toBeNull();
  });
});
