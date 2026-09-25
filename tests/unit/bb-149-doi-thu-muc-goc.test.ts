/**
 * BB-149 — đổi thư mục ảnh gốc của một bộ ảnh.
 *
 * OWNER: DEV-BE.
 *
 * Mỗi lần chạy mang một nhãn riêng và dọn theo nhãn của chính mình — BB-136.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import { Client } from "pg";
import { PATCH } from "@/app/api/admin/galleries/[id]/drive/route";
import * as staffAuth from "@/lib/auth/staff";

vi.mock("server-only", () => ({}));

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-149 ${runId}`;

const THU_MUC_A = "1AaBbCcDdEeFfGgHhIiJjKkLlMmNn11";
const THU_MUC_B = "1ZzYyXxWwVvUuTtSsRrQqPpOoNnMm22";

describe("BB-149: đổi thư mục ảnh gốc", () => {
  let client: Client;
  let branchId: string;
  let staffId: string;
  let customerId: string;
  let boA: string;
  let boB: string;

  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const goi = (id: string, driveUrl: unknown) =>
    PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ driveUrl }) }),
      params(id),
    );

  function nhapVai(role: string) {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role,
      branchIds: [branchId],
      permissions: quyenCuaVai(role),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  async function taoBo(ten: string, thuMuc: string, trangThai = "ready") {
    const { rows } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,$4,$5,$6,0) returning id`,
      [branchId, customerId, `${NHAN} ${ten}`, trangThai, thuMuc,
       `https://drive.google.com/drive/folders/${thuMuc}`],
    );
    return rows[0].id as string;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: st } = await client.query("select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1");
    staffId = st[0].id;

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    boA = await taoBo("A", `${THU_MUC_A}-${runId}`.slice(0, 33));
    boB = await taoBo("B", `${THU_MUC_B}-${runId}`.slice(0, 33));
    nhapVai("cs");
  });

  afterAll(async () => {
    await client.query("delete from activity_logs where action = 'gallery.drive_folder.change' and entity_id = any($1)", [[boA, boB]]);
    await client.query("delete from galleries where title like $1", [`${NHAN}%`]);
    await client.query("delete from customers where full_name like $1", [`${NHAN}%`]);
    await client.end();
  });

  const thuMucCua = async (id: string) => {
    const { rows } = await client.query(
      "select drive_folder_id, drive_folder_url from galleries where id = $1", [id]);
    return rows[0];
  };

  it("1. Link thư mục thường -> đổi được, và có dòng nhật ký ai đổi từ đâu sang đâu", async () => {
    const truoc = await thuMucCua(boA);
    const moi = "1QqWwEeRrTtYyUuIiOoPpAaSsDdFf99";

    const res = await goi(boA, `https://drive.google.com/drive/folders/${moi}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.driveFolderId).toBe(moi);

    const sau = await thuMucCua(boA);
    expect(sau.drive_folder_id).toBe(moi);

    const { rows: log } = await client.query(
      `select metadata from activity_logs
        where action = 'gallery.drive_folder.change' and entity_id = $1
        order by created_at desc limit 1`, [boA]);
    expect(log.length).toBe(1);
    expect(log[0].metadata.tu).toBe(truoc.drive_folder_id);
    expect(log[0].metadata.sang).toBe(moi);
  });

  it("2. Link ?usp=sharing và link bị Facebook bọc -> cùng ra một mã thư mục", async () => {
    const ma = "1MmNnBbVvCcXxZzLlKkJjHhGgFfDd88";

    const r1 = await goi(boA, `https://drive.google.com/drive/folders/${ma}?usp=sharing`);
    expect(r1.status).toBe(200);
    expect((await thuMucCua(boA)).drive_folder_id).toBe(ma);

    // Trả về mã khác rồi dán lại bằng link Facebook bọc, để chắc là nó ĐỔI thật
    await goi(boA, `https://drive.google.com/drive/folders/${THU_MUC_A}`);
    const boc = encodeURIComponent(`https://drive.google.com/drive/folders/${ma}?usp=sharing`);
    const r2 = await goi(boA, `https://l.facebook.com/l.php?u=${boc}&h=AT0abc`);
    expect(r2.status).toBe(200);
    expect((await thuMucCua(boA)).drive_folder_id).toBe(ma);
  });

  it("3. Link rác -> INVALID_INPUT và cơ sở dữ liệu KHÔNG đổi gì", async () => {
    const truoc = await thuMucCua(boA);
    for (const rac of ["không phải link", "https://example.com/abc", "https://drive.google.com/file/d/1AaBbCcDdEeFfGgHh/view"]) {
      const res = await goi(boA, rac);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_INPUT");
    }
    expect((await thuMucCua(boA)).drive_folder_id).toBe(truoc.drive_folder_id);
  });

  it("4. Mã thư mục đang thuộc bộ khác -> từ chối, câu báo có tên bộ kia", async () => {
    const cuaB = (await thuMucCua(boB)).drive_folder_id;
    const truoc = await thuMucCua(boA);

    const res = await goi(boA, `https://drive.google.com/drive/folders/${cuaB}`);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toContain(`${NHAN} B`);
    expect((await thuMucCua(boA)).drive_folder_id).toBe(truoc.drive_folder_id);
  });

  it("5. Bộ khách đã chốt -> chặn, không cho đổi nguồn ảnh dưới chân khách", async () => {
    const boChot = await taoBo("Đã chốt", `1CcHhOoTt${runId}AaBbCcDdEeFfGg`.slice(0, 33), "submitted");
    const res = await goi(boChot, "https://drive.google.com/drive/folders/1PpOoIiUuYyTtRrEeWwQq11223344");
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toContain("đã chốt");
  });

  it("6. Vai không được phép -> bị chặn", async () => {
    const truoc = await thuMucCua(boA);
    for (const vai of ["accountant", "retoucher", "photoshop_ctv", "viewer"]) {
      nhapVai(vai);
      const res = await goi(boA, "https://drive.google.com/drive/folders/1AaAaAaAaAaAaAaAaAaAaAaAaA0001");
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    nhapVai("cs");
    expect((await thuMucCua(boA)).drive_folder_id).toBe(truoc.drive_folder_id);
  });
});
