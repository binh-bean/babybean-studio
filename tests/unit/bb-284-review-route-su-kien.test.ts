/**
 * BB-284 — `POST /api/g/review` phải gọi ĐÚNG sự kiện Lark theo nhánh quyết
 * định của khách:
 *
 *   decision: "approve" → event "review.approved"   (CHỐT IN)
 *   decision: "revise"  → event "review.changes_requested" (YÊU CẦU SỬA)
 *
 * Chạy trên cơ sở dữ liệu THẬT (bb-dev) như `review-loop.test.ts` — không giả
 * lập `createAdminClient`. `enqueueLarkNotification` tự chặn gửi thật trong
 * lúc `npm run test` (`dangChayPhepThu()`, xem src/lib/lark/notify.ts) nên
 * dòng ghi vào `notifications` có `status = 'skipped'`, KHÔNG một byte nào ra
 * khỏi máy. Dữ liệu mẫu chỉ là "Fixture BB-284 …", dọn ngay trong `afterAll`.
 *
 * Thước đo (AGENTS.md §5a): xoá hai lời gọi `enqueueLarkNotification` mới ở
 * `src/app/api/g/review/route.ts` thì hai ca dưới đây ĐỎ vì không tìm thấy
 * dòng `notifications` nào — đã thử tay, dán kết quả vào bàn giao.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Client } from "pg";

import { quyenCuaVai } from "../fixtures/phien-nhan-su";
vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import { POST as retouchDone } from "@/app/api/admin/galleries/[id]/retouch-done/route";
import { POST as review } from "@/app/api/g/review/route";

describe("BB-284: /api/g/review gọi đúng sự kiện Lark theo nhánh", () => {
  let client: Client;
  let branchId: string;
  let galleryId: string;
  let customerId: string;

  const params = () => ({ params: Promise.resolve({ id: galleryId }) });
  const body = (v: unknown) =>
    new Request("http://localhost", { method: "POST", body: JSON.stringify(v) });

  function asCs() {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000284",
      role: "cs",
      branchIds: [branchId],
      permissions: quyenCuaVai("cs"),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  function asCustomer() {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      role: "owner",
      shareLinkId: "00000000-0000-4000-8000-000000000285",
      selectionId: "",
      customerId: "",
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  const setStatus = (s: string) =>
    client.query("update galleries set status = $1 where id = $2", [s, galleryId]);

  const tinLarkCuaBo = async (event: string) => {
    const { rows } = await client.query(
      `select template, payload from notifications
       where channel = 'lark' and template = $1
         and payload->>'galleryId' = $2
       order by created_at desc limit 1`,
      [event, galleryId],
    );
    return rows[0] as { template: string; payload: Record<string, unknown> } | undefined;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name, phone)
       values ($1,'Fixture BB-284 Khách','0901000284') returning id`,
      [branchId],
    );
    customerId = c[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url)
       values ($1,$2,'Fixture BB-284','in_retouch',$3,'https://example.com/x') returning id`,
      [branchId, customerId, `fixture-bb284-${Date.now()}`],
    );
    galleryId = g[0].id;
    // BB-384 — gửi khách duyệt đi qua ảnh chỉnh TRONG APP: bộ cần ảnh trong thư mục con
    // "ảnh chỉnh sửa" (route cũ retouch-done làm đúng việc "Gửi khách duyệt").
    await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, subfolder, created_at)
       values ($1, $2, 'IMG_0284-Edit.jpg', 'image/jpeg', 1, 'active', 'anh chinh sua', now() - interval '1 hour')`,
      [galleryId, `fixture-bb284-chinh-${Date.now()}`],
    );
  });

  afterAll(async () => {
    await client.query("delete from notifications where payload->>'galleryId' = $1", [galleryId]);
    await client.query("delete from revision_requests where gallery_id = $1", [galleryId]);
    await client.query("delete from deliveries where gallery_id = $1", [galleryId]);
    await client.query("delete from photos where gallery_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  beforeEach(async () => {
    await client.query("delete from notifications where payload->>'galleryId' = $1", [galleryId]);
    await client.query("delete from revision_requests where gallery_id = $1", [galleryId]);
    await client.query("delete from deliveries where gallery_id = $1", [galleryId]);
    await setStatus("in_retouch");
  });

  it("khách DUYỆT → ghi 'review.approved', có tên khách và SĐT đã che", async () => {
    asCs();
    await retouchDone(body({ finalDriveUrl: "https://drive.google.com/drive/folders/a" }), params());

    asCustomer();
    const res = await review(body({ decision: "approve" }));
    expect(res.status).toBe(200);

    const tin = await tinLarkCuaBo("review.approved");
    expect(tin).toBeDefined();
    expect(tin!.payload.customerName).toBe("Fixture BB-284 Khách");
    expect(tin!.payload.customerPhone).toBe("090***0284");

    // Không có dòng 'review.changes_requested' nào cho lượt này.
    expect(await tinLarkCuaBo("review.changes_requested")).toBeUndefined();
  });

  it("khách XIN SỬA → ghi 'review.changes_requested', kèm vòng và ghi chú nguyên văn", async () => {
    asCs();
    await retouchDone(body({ finalDriveUrl: "https://drive.google.com/drive/folders/v1" }), params());

    asCustomer();
    const res = await review(body({ decision: "revise", note: "Ảnh số 3 sáng quá" }));
    expect(res.status).toBe(200);

    const tin = await tinLarkCuaBo("review.changes_requested");
    expect(tin).toBeDefined();
    expect(tin!.payload.round).toBe(1);
    expect(tin!.payload.ghiChu).toBe("Ảnh số 3 sáng quá");

    expect(await tinLarkCuaBo("review.approved")).toBeUndefined();
  });
});
