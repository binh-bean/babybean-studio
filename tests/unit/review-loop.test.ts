/**
 * BB-121 — vòng duyệt ảnh đã chỉnh.
 *
 *   in_retouch → CSKH gửi file → awaiting_approval
 *                                  ├─ khách duyệt   → approved
 *                                  └─ khách đòi sửa → in_retouch, vòng sau
 *
 * Phép thử quan trọng nhất là vòng LẶP LẠI ĐƯỢC và mỗi vòng giữ lại lời khách
 * viết. Một ô ghi chú thì vòng sau ghi đè vòng trước, và đến vòng thứ tư không
 * ai nhớ khách đã đòi gì.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import { POST as retouchDone } from "@/app/api/admin/galleries/[id]/retouch-done/route";
import { POST as review } from "@/app/api/g/review/route";

describe("BB-121: vòng duyệt ảnh đã chỉnh", () => {
  let client: Client;
  let branchId: string;
  let galleryId: string;
  let customerId: string;

  const params = () => ({ params: Promise.resolve({ id: galleryId }) });
  const body = (v: unknown) =>
    new Request("http://localhost", { method: "POST", body: JSON.stringify(v) });

  function asCs() {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000121",
      role: "cs",
      branchIds: [branchId],
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  function asCustomer(role = "owner") {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      role,
      shareLinkId: "00000000-0000-4000-8000-000000000122",
      selectionId: "",
      customerId: "",
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  const setStatus = (s: string) =>
    client.query("update galleries set status = $1 where id = $2", [s, galleryId]);

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name)
       values ($1,'Fixture BB-121 Khách') returning id`,
      [branchId],
    );
    customerId = c[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url)
       values ($1,$2,'Fixture BB-121','in_retouch',$3,'https://example.com/x') returning id`,
      [branchId, customerId, `fixture-bb121-${Date.now()}`],
    );
    galleryId = g[0].id;
  });

  afterAll(async () => {
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  beforeEach(async () => {
    await client.query("delete from revision_requests where gallery_id = $1", [galleryId]);
    await client.query("delete from deliveries where gallery_id = $1", [galleryId]);
    await setStatus("in_retouch");
  });

  it("1. CSKH gửi file đã chỉnh -> chờ khách duyệt", async () => {
    asCs();
    const res = await retouchDone(
      body({ finalDriveUrl: "https://drive.google.com/drive/folders/abc123" }),
      params(),
    );
    expect(res.status).toBe(200);

    const { rows } = await client.query("select status from galleries where id = $1", [galleryId]);
    expect(rows[0].status).toBe("awaiting_approval");
  });

  it("2. Gửi mà KHÔNG có link thì từ chối — khách mở ra sẽ thấy trang trống", async () => {
    asCs();
    const res = await retouchDone(body({ finalDriveUrl: "  " }), params());
    expect(res.status).toBe(400);

    const { rows } = await client.query("select status from galleries where id = $1", [galleryId]);
    expect(rows[0].status).toBe("in_retouch");
  });

  it("3. Khách duyệt -> approved", async () => {
    asCs();
    await retouchDone(body({ finalDriveUrl: "https://drive.google.com/drive/folders/a" }), params());

    asCustomer();
    const res = await review(body({ decision: "approve" }));
    expect(res.status).toBe(200);

    const { rows } = await client.query("select status from galleries where id = $1", [galleryId]);
    expect(rows[0].status).toBe("approved");
  });

  it("4. Khách đòi sửa -> quay lại chỉnh ảnh, ghi vòng 1 kèm lời khách", async () => {
    asCs();
    await retouchDone(body({ finalDriveUrl: "https://drive.google.com/drive/folders/v1" }), params());

    asCustomer();
    const res = await review(body({ decision: "revise", note: "Ảnh số 3 sáng quá" }));
    const json = await res.json();
    expect(json.data.round).toBe(1);

    const { rows: g } = await client.query("select status from galleries where id = $1", [galleryId]);
    expect(g[0].status).toBe("in_retouch");

    const { rows: r } = await client.query(
      "select round, note, reviewed_url from revision_requests where gallery_id = $1",
      [galleryId],
    );
    expect(r).toHaveLength(1);
    expect(r[0].note).toBe("Ảnh số 3 sáng quá");
    // Giữ link bản khách đang xem lúc chê — vòng sau file khác rồi.
    expect(r[0].reviewed_url).toContain("v1");
  });

  it("5. Vòng lặp LẶP LẠI ĐƯỢC, và vòng trước KHÔNG bị ghi đè", async () => {
    asCs();
    await retouchDone(body({ finalDriveUrl: "https://drive.google.com/drive/folders/v1" }), params());
    asCustomer();
    await review(body({ decision: "revise", note: "Vòng một: ảnh 3 sáng quá" }));

    asCs();
    await retouchDone(body({ finalDriveUrl: "https://drive.google.com/drive/folders/v2" }), params());
    asCustomer();
    const second = await (await review(body({ decision: "revise", note: "Vòng hai: đổi khung" }))).json();

    expect(second.data.round).toBe(2);

    const { rows } = await client.query(
      "select round, note, resolved_at from revision_requests where gallery_id = $1 order by round",
      [galleryId],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].note).toContain("Vòng một");
    expect(rows[1].note).toContain("Vòng hai");
    // Chuyển bản mới đóng vòng cũ; vòng đang mở chỉ còn vòng hai.
    expect(rows[0].resolved_at).not.toBeNull();
    expect(rows[1].resolved_at).toBeNull();
  });

  it("6. Đòi sửa mà không ghi gì -> từ chối, không đổi trạng thái", async () => {
    asCs();
    await retouchDone(body({ finalDriveUrl: "https://drive.google.com/drive/folders/a" }), params());

    asCustomer();
    const res = await review(body({ decision: "revise", note: "   " }));
    expect(res.status).toBe(400);

    const { rows } = await client.query("select status from galleries where id = $1", [galleryId]);
    expect(rows[0].status).toBe("awaiting_approval");
  });

  it("7. Người được mời (không phải khách chính) không quyết được", async () => {
    asCs();
    await retouchDone(body({ finalDriveUrl: "https://drive.google.com/drive/folders/a" }), params());

    asCustomer("co_editor");
    const res = await review(body({ decision: "approve" }));
    expect(res.status).toBe(403);
  });

  it("8. Duyệt hai lần -> câu trả lời nói rõ đang ở đâu, không phải lỗi chung chung", async () => {
    asCs();
    await retouchDone(body({ finalDriveUrl: "https://drive.google.com/drive/folders/a" }), params());
    asCustomer();
    await review(body({ decision: "approve" }));

    const res = await review(body({ decision: "approve" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error.message).toContain("đã duyệt");
  });

  it("9. Gửi file khi bộ ảnh chưa chỉnh xong -> từ chối", async () => {
    await setStatus("in_review");
    asCs();
    const res = await retouchDone(
      body({ finalDriveUrl: "https://drive.google.com/drive/folders/a" }),
      params(),
    );
    expect(res.status).toBe(400);
  });
});
