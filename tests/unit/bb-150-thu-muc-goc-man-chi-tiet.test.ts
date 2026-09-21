/**
 * BB-150 — màn chi tiết phải cho thấy ảnh đến từ thư mục nào.
 *
 * Phép thử này canh phần API: bốn trường mà khối "Thư mục ảnh gốc" đọc phải có
 * thật trong phản hồi. Thiếu một trường là khối đó hiện rỗng mà không ai biết vì
 * sao — lỗi im lặng, đúng loại dự án này đã vấp nhiều lần.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { GET } from "@/app/api/admin/galleries/[id]/items/route";
import * as staffAuth from "@/lib/auth/staff";

import { quyenCuaVai } from "../fixtures/phien-nhan-su";
vi.mock("server-only", () => ({}));

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-150 ${runId}`;

describe("BB-150: thư mục ảnh gốc trên màn chi tiết", () => {
  let client: Client;
  let galleryId: string;
  let customerId: string;
  let branchId: string;
  const thuMuc = `fixture-bb150-${runId}`;
  const diaChi = `https://drive.google.com/drive/folders/${thuMuc}`;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: st } = await client.query("select id from staff_profiles limit 1");

    const { rows: kh } = await client.query(
      "insert into customers (branch_id, full_name) values ($1,$2) returning id",
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, last_synced_at, sync_error)
       values ($1,$2,$3,'sync_error',$4,$5,7, now(), 'Thư mục không mở được: 404')
       returning id`,
      [branchId, customerId, `${NHAN} Bộ`, thuMuc, diaChi],
    );
    galleryId = g[0].id;

    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: st[0].id,
      role: "owner",
      branchIds: [branchId], permissions: quyenCuaVai("owner"), } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  });

  afterAll(async () => {
    await client.query("delete from galleries where title like $1", [`${NHAN}%`]);
    await client.query("delete from customers where full_name like $1", [`${NHAN}%`]);
    await client.end();
  });

  it("Trả về đủ thư mục gốc, lần đồng bộ cuối và lý do lỗi", async () => {
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: galleryId }),
    });
    expect(res.status).toBe(200);

    const { data } = await res.json();
    expect(data.driveFolderUrl).toBe(diaChi);
    expect(data.driveFolderId).toBe(thuMuc);
    expect(data.lastSyncedAt).toBeTruthy();
    expect(data.syncError).toContain("404");
    expect(data.photoCount).toBe(7);
  });

  it("Thư mục ảnh gốc KHÔNG lẫn với link ảnh đã chỉnh", async () => {
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: galleryId }),
    });
    const { data } = await res.json();
    // finalDriveUrl là ảnh ĐÃ CHỈNH gửi khách cuối quy trình — bộ này chưa có.
    // Hai trường lẫn nhau là có ngày ghi đè nguồn ảnh gốc bằng ảnh đã chỉnh.
    expect(data.finalDriveUrl).toBeNull();
    expect(data.driveFolderUrl).not.toBe(data.finalDriveUrl);
  });
});
