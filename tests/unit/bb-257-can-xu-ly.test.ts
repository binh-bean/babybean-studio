/**
 * BB-257 — GET /api/admin/can-xu-ly.
 *
 * Canh ba điều: route gom đúng hai nhóm (Drive chưa chia sẻ / chưa có ảnh),
 * nhân viên chi nhánh khác không thấy bộ ảnh của mình, và không lộ tên/SĐT
 * khách. Dữ liệu do chính tệp này chèn và xoá — không mượn dòng thật trên
 * bb-dev (AGENTS.md §6).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { phienGiaLap } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET } from "@/app/api/admin/can-xu-ly/route";

const NHAN = `Fixture BB-257 ${Date.now()}`;
const LY_DO_CHUA_CHIA_SE = "Thư mục chưa được chia sẻ công khai";

function asStaff(role: string, branchIds: string[]) {
  vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(
    phienGiaLap(role as never, branchIds),
  );
}

function req(qs = ""): Request {
  return new Request(`http://localhost/api/admin/can-xu-ly${qs}`);
}

describe("BB-257: API cần xử lý trước khi gửi khách", () => {
  let client: Client;
  let branchA: string;
  let branchB: string;
  const madeGalleries: string[] = [];
  const madeCustomers: string[] = [];

  let galDriveA: string; // sync_error "chưa chia sẻ", chi nhánh A
  let galRongA: string; // draft, photo_count 0, chi nhánh A
  let galDriveB: string; // cùng lỗi Drive nhưng chi nhánh B

  async function makeGallery(opts: {
    branchId: string;
    status: string;
    syncError?: string | null;
    photoCount?: number;
  }) {
    const { rows: cust } = await client.query(
      `insert into customers (branch_id, full_name) values ($1, $2) returning id`,
      [opts.branchId, `${NHAN} Khách`],
    );
    madeCustomers.push(cust[0].id);

    const { rows: gal } = await client.query(
      `insert into galleries
         (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
          sync_error, photo_count, last_synced_at)
       values ($1,$2,$3,$4,$5,'https://drive.google.invalid/folders/fixture-bb257',$6,$7, now())
       returning id`,
      [
        opts.branchId,
        cust[0].id,
        `${NHAN} Bộ`,
        opts.status,
        `SEED_FOLDER_ID_BB257-${Math.random()}`,
        opts.syncError ?? null,
        opts.photoCount ?? 0,
      ],
    );
    madeGalleries.push(gal[0].id);
    return gal[0].id as string;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows } = await client.query("select id from branches order by name limit 2");
    branchA = rows[0].id;
    branchB = rows[1].id;

    galDriveA = await makeGallery({
      branchId: branchA,
      status: "sync_error",
      syncError: LY_DO_CHUA_CHIA_SE,
      photoCount: 0,
    });
    galRongA = await makeGallery({ branchId: branchA, status: "draft", photoCount: 0 });
    galDriveB = await makeGallery({
      branchId: branchB,
      status: "sync_error",
      syncError: LY_DO_CHUA_CHIA_SE,
      photoCount: 0,
    });
  });

  afterAll(async () => {
    for (const id of madeGalleries) await client.query("delete from galleries where id = $1", [id]);
    for (const id of madeCustomers) await client.query("delete from customers where id = $1", [id]);
    await client.end();
  });

  it("1. Trả đúng hai nhóm cho chi nhánh A: Drive chưa chia sẻ + chưa có ảnh", async () => {
    asStaff("cs", [branchA]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();

    const idsDrive = body.data.driveChuaChiaSe.map((i: { id: string }) => i.id);
    const idsRong = body.data.chuaCoAnh.map((i: { id: string }) => i.id);

    expect(idsDrive).toContain(galDriveA);
    expect(idsDrive).not.toContain(galDriveB); // chi nhánh khác, xem điều 2

    // Bộ sync_error CŨNG có photo_count 0, nhưng KHÔNG phải nhóm "chưa có
    // ảnh" theo brief (đó là bộ draft). Chỉ galRongA nằm ở đây.
    expect(idsRong).toContain(galRongA);
    expect(idsRong).not.toContain(galDriveA);
  });

  it("2. Nhân viên chi nhánh khác không thấy bộ ảnh của chi nhánh A", async () => {
    asStaff("cs", [branchB]);
    const res = await GET(req());
    const body = await res.json();

    const idsDrive = body.data.driveChuaChiaSe.map((i: { id: string }) => i.id);
    const idsRong = body.data.chuaCoAnh.map((i: { id: string }) => i.id);

    expect(idsDrive).toContain(galDriveB);
    expect(idsDrive).not.toContain(galDriveA);
    expect(idsRong).not.toContain(galRongA);
  });

  it("3. Không có trường tên/SĐT khách trong phản hồi", async () => {
    asStaff("owner", [branchA, branchB]);
    const res = await GET(req());
    const text = await res.text();

    // Tên khách fixture của chính tệp này không được lọt vào JSON trả về —
    // nếu route lỡ join bảng customers thì tên sẽ xuất hiện ở đây.
    expect(text).not.toContain("Khách");
    expect(text).not.toContain("full_name");
    expect(text).not.toContain("phone");
  });

  it("4. Query hỏng (branchId không phải UUID) trả 400, không phải 500", async () => {
    asStaff("cs", [branchA]);
    const res = await GET(req("?branchId=khong-phai-uuid"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("5. Chưa đăng nhập trả 401", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockRejectedValue(
      new staffAuth.AuthError("UNAUTHENTICATED"),
    );
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("6. Nhân viên chưa gán chi nhánh nào thấy bảng rỗng, không phải lỗi", async () => {
    asStaff("cs", []);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.driveChuaChiaSe).toEqual([]);
    expect(body.data.chuaCoAnh).toEqual([]);
  });

  it("7. CTV thời vụ bị chặn", async () => {
    asStaff("photoshop_ctv", [branchA]);
    const res = await GET(req());
    expect(res.status).toBe(403);
  });
});
