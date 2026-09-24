/**
 * BB-215 — PATCH /api/admin/galleries/[id]/bia: ảnh bìa, tiêu đề bìa, lời.
 *
 * Mỗi lần chạy mang một nhãn riêng và dọn theo nhãn của chính mình — BB-136.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { phienGiaLap } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { PATCH } from "@/app/api/admin/galleries/[id]/bia/route";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-215 ${runId}`;

describe("BB-215: PATCH bìa bộ ảnh", () => {
  let client: Client;
  let branchId: string;
  let branchKhacId: string;
  let staffId: string;
  let customerId: string;
  let boA: string;
  let boB: string;
  let anhCuaA: string;
  let anhCuaB: string;

  const goi = (id: string, body: unknown) =>
    PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }),
      { params: Promise.resolve({ id }) },
    );

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 2");
    branchId = br[0].id;
    branchKhacId = br[1]?.id ?? br[0].id;
    const { rows: st } = await client.query("select id from staff_profiles limit 1");
    staffId = st[0].id;

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: gA } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'ready',$4,'https://example.com/a',1) returning id`,
      [branchId, customerId, `${NHAN} A`, `fixture-bb215-a-${runId}`],
    );
    boA = gA[0].id;

    const { rows: gB } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'ready',$4,'https://example.com/b',1) returning id`,
      [branchId, customerId, `${NHAN} B`, `fixture-bb215-b-${runId}`],
    );
    boB = gB[0].id;

    const { rows: pA } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, status, sort_index)
       values ($1, $2, 'a.jpg', 'image/jpeg', 'active', 1) returning id`,
      [boA, `fixture-bb215-photo-a-${runId}`],
    );
    anhCuaA = pA[0].id;

    const { rows: pB } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, status, sort_index)
       values ($1, $2, 'b.jpg', 'image/jpeg', 'active', 1) returning id`,
      [boB, `fixture-bb215-photo-b-${runId}`],
    );
    anhCuaB = pB[0].id;
  });

  afterAll(async () => {
    await client.query("delete from activity_logs where action = 'gallery.cover.change' and entity_id = any($1)", [[boA, boB]]);
    await client.query("delete from photos where gallery_id = any($1)", [[boA, boB]]);
    await client.query("delete from galleries where title like $1", [`${NHAN}%`]);
    await client.query("delete from customers where full_name like $1", [`${NHAN}%`]);
    await client.end();
  });

  const boCua = async (id: string) => {
    const { rows } = await client.query(
      "select cover_photo_id, cover_headline, welcome_message from galleries where id = $1",
      [id],
    );
    return rows[0];
  };

  it("1. Không đăng nhập -> 401", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockRejectedValueOnce(
      new staffAuth.AuthError("UNAUTHENTICATED"),
    );
    const res = await goi(boA, { coverHeadline: "Thử" });
    expect(res.status).toBe(401);
  });

  it("2. Nhân viên chi nhánh khác -> bị chặn", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce(
      phienGiaLap("cs", [branchKhacId], staffId),
    );
    const res = await goi(boA, { coverHeadline: "Không thuộc chi nhánh này" });
    expect(res.status).toBe(403);
    expect((await boCua(boA)).cover_headline).toBeNull();
  });

  it("3. Ảnh của bộ khác -> bị từ chối, không ghi gì", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("cs", [branchId], staffId));
    const res = await goi(boA, { coverPhotoId: anhCuaB });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await boCua(boA)).cover_photo_id).toBeNull();
  });

  it("4. Hợp lệ -> ghi đúng cả ba trường, kèm dòng nhật ký", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("cs", [branchId], staffId));

    const res = await goi(boA, {
      coverPhotoId: anhCuaA,
      coverHeadline: "Mùa đầu tiên của Bống",
      welcomeMessage: "Những khoảnh khắc nhỏ, lưu lại cho một đời.",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.coverPhotoId).toBe(anhCuaA);
    expect(body.data.coverHeadline).toBe("Mùa đầu tiên của Bống");

    const sau = await boCua(boA);
    expect(sau.cover_photo_id).toBe(anhCuaA);
    expect(sau.cover_headline).toBe("Mùa đầu tiên của Bống");
    expect(sau.welcome_message).toBe("Những khoảnh khắc nhỏ, lưu lại cho một đời.");

    const { rows: log } = await client.query(
      `select metadata from activity_logs
        where action = 'gallery.cover.change' and entity_id = $1
        order by created_at desc limit 1`,
      [boA],
    );
    expect(log.length).toBe(1);
    expect(log[0].metadata.sang.cover_photo_id).toBe(anhCuaA);
  });

  it("5. Vai không được phép (accountant, retoucher, photoshop_ctv, viewer) -> bị chặn", async () => {
    for (const vai of ["accountant", "retoucher", "photoshop_ctv", "viewer"]) {
      vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce(phienGiaLap(vai as never, [branchId], staffId));
      const res = await goi(boA, { coverHeadline: `Không được phép — ${vai}` });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });
});
