/**
 * BB-122 — mở lại bộ ảnh, và các cổng khoá chốt đơn.
 *
 * Hai lỗ hổng tìm ra khi gom danh sách trạng thái về một chỗ:
 *
 * 1. `/api/g/submit` và `/api/g/addons` có bản chép tay riêng, thiếu hai trạng
 *    thái mới. Khách đang CHỜ DUYỆT ảnh đã chỉnh vẫn gọi được hai route đó —
 *    bộ ảnh bị đẩy ngược về 'submitted', xoá mất giai đoạn chỉnh ảnh trong khi
 *    người photoshop đã làm xong.
 *
 * 2. Migration 0035 khoá bộ ảnh hết hạn khỏi việc đổi lựa chọn. Đúng, nhưng
 *    trước đó chính lỗ hổng ấy là đường thoát duy nhất. Không có route mở lại
 *    thì bộ ảnh quá hạn thành ngõ cụt.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Client } from "pg";

import { quyenCuaVai } from "../fixtures/phien-nhan-su";
vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import { POST as reopen } from "@/app/api/admin/galleries/[id]/reopen/route";
import { POST as submit } from "@/app/api/g/submit/route";

describe("BB-122: mở lại bộ ảnh và cổng khoá chốt", () => {
  let client: Client;
  let branchId: string;
  let galleryId: string;
  let customerId: string;
  let selectionId: string;
  let shareLinkId: string;

  const params = () => ({ params: Promise.resolve({ id: galleryId }) });
  const body = (v: unknown) =>
    new Request("http://localhost", { method: "POST", body: JSON.stringify(v) });

  function asCs() {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000122",
      role: "cs",
      branchIds: [branchId], permissions: quyenCuaVai("cs"), } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  function asCustomer() {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      role: "owner",
      shareLinkId,
      selectionId,
      customerId,
      exp: 0, permissions: quyenCuaVai("owner"), } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  const setStatus = (s: string) =>
    client.query("update galleries set status = $1 where id = $2", [s, galleryId]);

  const getStatus = async () => {
    const { rows } = await client.query("select status from galleries where id = $1", [galleryId]);
    return rows[0].status as string;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name)
       values ($1,'Fixture BB-122 Khách') returning id`,
      [branchId],
    );
    customerId = c[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, included_quota, extra_photo_price)
       values ($1,$2,'Fixture BB-122','expired',$3,'https://example.com/x',10,50000)
       returning id`,
      [branchId, customerId, `fixture-bb122-${Date.now()}`],
    );
    galleryId = g[0].id;
    // Tự tạo link chia sẻ của riêng mình. Mượn dòng có sẵn thì phép thử đổi
    // kết quả theo dữ liệu người khác để lại — đã vấp năm lần.
    const { rows: sl } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role)
       values ($1,$2,$3,'owner') returning id`,
      [galleryId, `fixture-bb122-hash-${Date.now()}`, "bb122x"],
    );
    shareLinkId = sl[0].id;

    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary)
       values ($1,$2,true) returning id`,
      [galleryId, shareLinkId],
    );
    selectionId = sel[0].id;
  });

  afterAll(async () => {
    await client.query("delete from selections where gallery_id = $1", [galleryId]);
    await client.query("delete from share_links where gallery_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  beforeEach(async () => {
    await setStatus("expired");
    await client.query(
      "update galleries set reopened_at = null, reopen_reason = null where id = $1",
      [galleryId],
    );
  });

  it("1. Bộ ảnh hết hạn: CSKH mở lại được, có ghi lý do", async () => {
    asCs();
    const res = await reopen(body({ reason: "Khách bận, xin thêm thời gian" }), params());
    expect(res.status).toBe(200);
    expect(await getStatus()).toBe("in_review");

    const { rows } = await client.query(
      "select reopened_at, reopen_reason from galleries where id = $1",
      [galleryId],
    );
    expect(rows[0].reopened_at).not.toBeNull();
    expect(rows[0].reopen_reason).toContain("xin thêm thời gian");
  });

  it("2. Mở lại mà không ghi lý do -> từ chối", async () => {
    // Sáu tháng sau, câu hỏi "sao bộ này mở lại" chỉ trả lời được nếu lúc đó
    // có người viết vào.
    asCs();
    const res = await reopen(body({ reason: "   " }), params());
    expect(res.status).toBe(400);
    expect(await getStatus()).toBe("expired");
  });

  it("3. Đã qua bước chỉnh ảnh -> KHÔNG mở lại chọn ảnh", async () => {
    // Người chỉnh ảnh đã làm theo danh sách cũ. Mở ra thì công đã bỏ vào
    // những ảnh khách vừa bỏ chọn.
    asCs();
    for (const s of ["in_retouch", "awaiting_approval", "approved", "delivered"]) {
      await setStatus(s);
      const res = await reopen(body({ reason: "thử mở" }), params());
      expect(res.status, `trạng thái ${s}`).toBe(400);
      expect(await getStatus()).toBe(s);
    }
  });

  it("4. Khách chốt rồi đổi ý, CSKH chưa xác nhận -> mở lại được", async () => {
    asCs();
    await setStatus("submitted");
    const res = await reopen(body({ reason: "Khách muốn đổi hai ảnh" }), params());
    expect(res.status).toBe(200);
    expect(await getStatus()).toBe("in_review");
  });

  it("5. Đang chờ khách duyệt ảnh đã chỉnh -> KHÔNG chốt lại được", async () => {
    // Lỗ hổng thật trước BB-122: route chốt có danh sách khoá chép tay,
    // thiếu 'awaiting_approval'. Khách bấm chốt lại là bộ ảnh quay về
    // 'submitted', xoá mất giai đoạn chỉnh ảnh.
    await setStatus("awaiting_approval");
    asCustomer();
    const res = await submit(
      body({ confirmedByName: "Khách thử", agreed: true }),
    );
    // Phải đúng vì BỊ KHOÁ, không phải vì thân yêu cầu sai — "khác 200" là
    // phép thử xanh cả khi cổng đã mở toang.
    const json = await res.json();
    expect(json.error.code).toBe("GALLERY_LOCKED");
    expect(await getStatus()).toBe("awaiting_approval");
  });

  it("6. Khách đã duyệt -> KHÔNG chốt lại được", async () => {
    await setStatus("approved");
    asCustomer();
    const res = await submit(
      body({ confirmedByName: "Khách thử", agreed: true }),
    );
    // Phải đúng vì BỊ KHOÁ, không phải vì thân yêu cầu sai — "khác 200" là
    // phép thử xanh cả khi cổng đã mở toang.
    const json = await res.json();
    expect(json.error.code).toBe("GALLERY_LOCKED");
    expect(await getStatus()).toBe("approved");
  });
});
