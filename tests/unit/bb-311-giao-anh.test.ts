/**
 * BB-311 (P1) — POST /api/admin/galleries/[id]/delivered: CSKH đánh dấu đã
 * giao ảnh IN cho khách.
 *
 * ---------------------------------------------------------------------------
 * Lỗ hổng trước bản vá
 * ---------------------------------------------------------------------------
 * Báo cáo vận hành độc lập phát hiện: không route nào trong mã nguồn từng đặt
 * `galleries.status = 'delivered'` sau khi khách duyệt (`approved`) — chỉ có
 * phép thử tự UPDATE thẳng cột status mới đạt được trạng thái đó. Phép thử
 * dưới đây gọi ĐÚNG route HTTP (không tự SQL UPDATE status, không đọc mã
 * nguồn làm dữ liệu thử — xem AGENTS.md §5a).
 *
 * KIỂM NGƯỢC (dán kết quả vào bàn giao): xoá tạm điều kiện
 * `if (gallery.status !== "approved")` trong route, chạy lại ca 2 — phải ĐỎ.
 * Khôi phục code, chạy lại — phải XANH.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Client } from "pg";

import { quyenCuaVai } from "../fixtures/phien-nhan-su";
vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { POST as danhDauDaGiao } from "@/app/api/admin/galleries/[id]/delivered/route";

describe("BB-311(P1): đánh dấu đã giao ảnh", () => {
  let client: Client;
  let branchId: string;
  let customerId: string;
  let galleryId: string;
  const runId = Math.random().toString(36).slice(2, 10);

  const params = () => ({ params: Promise.resolve({ id: galleryId }) });
  const body = (v: unknown = {}) =>
    new Request("http://localhost", { method: "POST", body: JSON.stringify(v) });

  function asCs() {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000311",
      role: "cs",
      roleName: "cs",
      branchIds: [branchId],
      permissions: quyenCuaVai("cs"),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  function asPhotographer() {
    // `photographer` KHÔNG có `deliveries:write` trong bảng quyền (chỉ
    // deliveries:read) — xem tests/fixtures/phien-nhan-su.ts.
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000312",
      role: "photographer",
      roleName: "photographer",
      branchIds: [branchId],
      permissions: quyenCuaVai("photographer"),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
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
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `Fixture BB-311 Khách ${runId}`],
    );
    customerId = c[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'approved',$4,'https://example.com/x',5) returning id`,
      [branchId, customerId, `Fixture BB-311 ${runId}`, `fixture-bb311-${runId}`],
    );
    galleryId = g[0].id;
  });

  afterAll(async () => {
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    await client.query("delete from thong_bao_khach where gallery_id = $1", [galleryId]);
    await client.query("delete from deliveries where gallery_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  beforeEach(async () => {
    await setStatus("approved");
    await client.query("delete from deliveries where gallery_id = $1", [galleryId]);
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
  });

  it("1. Trạng thái nguồn 'approved' -> chuyển sang 'delivered', tạo dòng deliveries", async () => {
    asCs();
    const res = await danhDauDaGiao(body(), params());
    expect(res.status).toBe(200);
    expect(await getStatus()).toBe("delivered");

    const { rows } = await client.query(
      "select status, delivered_at, branch_id from deliveries where gallery_id = $1",
      [galleryId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("delivered");
    expect(rows[0].delivered_at).not.toBeNull();
    expect(rows[0].branch_id).toBe(branchId);
  });

  it("2. Trạng thái nguồn KHÔNG phải 'approved' (in_retouch) -> TỪ CHỐI, không đổi status, không tạo deliveries", async () => {
    asCs();
    await setStatus("in_retouch");
    const res = await danhDauDaGiao(body(), params());
    expect(res.status).toBe(400);
    expect(await getStatus()).toBe("in_retouch");

    const { rows } = await client.query(
      "select count(*)::int n from deliveries where gallery_id = $1",
      [galleryId],
    );
    expect(rows[0].n).toBe(0);
  });

  it("3. Có ghi activity_logs với action 'gallery.delivered'", async () => {
    asCs();
    const res = await danhDauDaGiao(body(), params());
    expect(res.status).toBe(200);

    const { rows } = await client.query(
      "select metadata from activity_logs where entity_id = $1 and action = 'gallery.delivered'",
      [galleryId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].metadata.tuTrangThai).toBe("approved");
  });

  it("4. Nhân viên không có quyền 'deliveries:write' -> FORBIDDEN, không đổi status", async () => {
    asPhotographer();
    const res = await danhDauDaGiao(body(), params());
    expect(res.status).toBe(403);
    expect(await getStatus()).toBe("approved");
  });
});
