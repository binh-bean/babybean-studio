/**
 * BB-338 mục 3 — "Yêu cầu sửa lại" báo sai "Bộ ảnh vẫn đang mở".
 *
 * Gốc lỗi: màn khách khoá theo `khoaChonTheoLark` (trạng thái app + mã Lark
 * còn hiệu lực + luật 60 ngày), còn `/api/g/xin-sua-lai` chỉ xét `status`.
 * Bộ app còn `in_review` mà Lark đã "Đã chọn hình" → màn khách hiện nút
 * "Yêu cầu sửa lại", route trả 400 "vẫn đang mở".
 *
 * Phần A: luật thuần `khoaChonCuaKhach` (không DB).
 * Phần B: gọi thẳng route trên bb-dev với bộ "Fixture BB-338 …", dọn theo id.
 * Lark không bị gửi: `enqueueLarkNotification` có chốt `khongGuiRaLarkThat()`
 * khi chạy Vitest; dòng `notifications` (nếu có) cũng được dọn ở afterAll.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { POST as xinSuaLai } from "@/app/api/g/xin-sua-lai/route";
import { khoaChonCuaKhach } from "@/lib/gallery/khoa-chon-khach";

const LARK_DA_GUI_FILE_GOC = "optDAI9nFV"; // giai đoạn 1
const LARK_DA_CHON_HINH = "optl5DyKLx"; // giai đoạn 2
const ngayTruoc = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

describe("A. khoaChonCuaKhach — một luật cho màn khách và xin sửa lại", () => {
  it("in_review, không có Lark → còn mở", () => {
    expect(khoaChonCuaKhach({ status: "in_review" }).khoa).toBe(false);
  });
  it("in_review + Lark 'Đã chọn hình' → KHOÁ (ca anh vấp 01/10)", () => {
    expect(
      khoaChonCuaKhach({ status: "in_review", lark_trang_thai: LARK_DA_CHON_HINH, lark_trang_thai_tu: ngayTruoc(1) }).khoa,
    ).toBe(true);
  });
  it("submitted + Lark 'Đã chọn hình' → KHOÁ", () => {
    expect(khoaChonCuaKhach({ status: "submitted", lark_trang_thai: LARK_DA_CHON_HINH }).khoa).toBe(true);
  });
  it("CSKH mở lại SAU lần Lark đổi trạng thái → mã Lark cũ hết hiệu lực, còn mở (BB-327)", () => {
    expect(
      khoaChonCuaKhach({
        status: "in_review",
        lark_trang_thai: LARK_DA_CHON_HINH,
        lark_trang_thai_tu: ngayTruoc(2),
        reopened_at: ngayTruoc(1),
      }).khoa,
    ).toBe(false);
  });
  it("Lark 'Đã gửi file gốc' quá 60 ngày → khoá + cờ quá hạn", () => {
    const kq = khoaChonCuaKhach({ status: "ready", lark_trang_thai: LARK_DA_GUI_FILE_GOC, lark_trang_thai_tu: ngayTruoc(61) });
    expect(kq).toMatchObject({ khoa: true, quaHan60Ngay: true });
  });
  it("in_retouch → khoá theo trạng thái app như cũ", () => {
    expect(khoaChonCuaKhach({ status: "in_retouch" }).khoa).toBe(true);
  });
});

describe("B. /api/g/xin-sua-lai dùng đúng luật của màn khách", () => {
  let client: Client;
  let galleryId = "";
  let customerId = "";
  let shareLinkId = "";
  let selectionId = "";

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

  const xin = () =>
    xinSuaLai(
      new Request("http://localhost/api/g/xin-sua-lai", {
        method: "POST",
        body: JSON.stringify({ lyDo: "Fixture BB-338 đổi một tấm" }),
      }),
    );

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query(
      "select id from branches where name not like 'Fixture%' order by name limit 1",
    );
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-338 Khách') returning id`,
      [br[0].id],
    );
    customerId = kh[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,'Fixture BB-338 Bộ','in_review',$3,'https://example.com/bb338',1,5) returning id`,
      [br[0].id, customerId, `fixture-bb338-${Date.now()}`],
    );
    galleryId = g[0].id;
    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb338a', 'owner', 'active') returning id`,
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
    if (galleryId) {
      await client.query("delete from activity_logs where entity_id = $1 or gallery_id = $1", [galleryId]);
      await client.query("delete from notifications where payload->>'galleryId' = $1", [galleryId]);
      await client.query("delete from selections where gallery_id = $1", [galleryId]);
      await client.query("delete from share_links where gallery_id = $1", [galleryId]);
      await client.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerId) await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("bộ app còn in_review nhưng Lark đã 'Đã chọn hình' → GỬI ĐƯỢC yêu cầu (trước bản vá: 400 'vẫn đang mở')", async () => {
    await client.query(
      `update galleries set status='in_review', lark_trang_thai=$2, lark_trang_thai_tu=now() - interval '1 day',
              reopened_at=null where id=$1`,
      [galleryId, LARK_DA_CHON_HINH],
    );
    phien();
    const res = await xin();
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    expect(json.data.daGui).toBe(true);
    const { rows } = await client.query(
      "select count(*)::int n from activity_logs where gallery_id = $1 and action = 'gallery.reopen_requested'",
      [galleryId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("bộ THẬT SỰ còn mở (CSKH đã mở lại sau lần Lark đổi) → 400 'vẫn đang mở'", async () => {
    await client.query(
      `update galleries set status='in_review', lark_trang_thai=$2, lark_trang_thai_tu=now() - interval '2 day',
              reopened_at=now() - interval '1 day' where id=$1`,
      [galleryId, LARK_DA_CHON_HINH],
    );
    phien();
    const res = await xin();
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("vẫn đang mở");
  });
});
