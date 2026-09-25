/**
 * BB-123 — CSKH ghi nhận đã thu tiền phát sinh.
 *
 * Bảng `gallery_payments` có từ migration 0024 nhưng chưa route nào ghi vào,
 * nên câu hỏi "bộ này khách trả chưa" chỉ trả lời được bằng cách hỏi nhau.
 *
 * Điều quan trọng nhất ở đây không phải cộng đúng, mà là **không sửa đè được**.
 * Sổ tiền mà sửa được thì không còn là sổ. Thu nhầm thì ghi một dòng âm kèm
 * lý do.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { POST as pay } from "@/app/api/admin/galleries/[id]/payments/route";

describe("BB-123: ghi nhận thu tiền phát sinh", () => {
  let client: Client;
  let branchId: string;
  let galleryId: string;
  let customerId: string;
  let staffId: string;
  let shareLinkId: string;

  const params = () => ({ params: Promise.resolve({ id: galleryId }) });
  const body = (v: unknown) =>
    new Request("http://localhost", { method: "POST", body: JSON.stringify(v) });

  function asRole(role: string) {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role,
      branchIds: [branchId],
      permissions: quyenCuaVai(role),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    // Dùng một nhân viên CÓ THẬT: confirmed_by có khoá ngoại sang staff_profiles.
    const { rows: st } = await client.query("select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1");
    if (st.length === 0) throw new Error("Cần ít nhất một staff_profiles để chạy phép thử này");
    staffId = st[0].id;

    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name)
       values ($1,'Fixture BB-123 Khách') returning id`,
      [branchId],
    );
    customerId = c[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, included_quota, extra_photo_price)
       values ($1,$2,'Fixture BB-123','submitted',$3,'https://example.com/x',10,50000)
       returning id`,
      [branchId, customerId, `fixture-bb123-${Date.now()}`],
    );
    galleryId = g[0].id;
    const { rows: sl } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role)
       values ($1,$2,$3,'owner') returning id`,
      [galleryId, `fixture-bb123-hash-${Date.now()}`, "bb123x"],
    );
    shareLinkId = sl[0].id;
    // Khách chọn thừa 6 ảnh × 50.000 = 300.000 phát sinh, chụp lại lúc chốt.
    await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary,
                               snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount)
       values ($1,$2,true,16,6,300000)`,
      [galleryId, shareLinkId],
    );
  });

  afterAll(async () => {
    await client.query("delete from gallery_payments where gallery_id = $1", [galleryId]);
    await client.query("delete from selections where gallery_id = $1", [galleryId]);
    await client.query("delete from share_links where gallery_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  beforeEach(async () => {
    await client.query("delete from gallery_payments where gallery_id = $1", [galleryId]);
  });

  it("1. Thu đủ -> còn thiếu 0", async () => {
    asRole("cs");
    const res = await pay(body({ amount: 300000, method: "chuyen_khoan" }), params());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.paidAmount).toBe(300000);
    expect(json.data.outstanding).toBe(0);
  });

  it("2. Thu hai lần -> cộng dồn, còn thiếu giảm dần", async () => {
    asRole("cs");
    await pay(body({ amount: 100000, method: "tien_mat" }), params());
    const res = await pay(body({ amount: 150000, method: "chuyen_khoan" }), params());
    const json = await res.json();
    expect(json.data.paidAmount).toBe(250000);
    expect(json.data.outstanding).toBe(50000);
  });

  it("3. Ghi nhầm thì ghi dòng TRỪ, dòng cũ vẫn còn nguyên", async () => {
    asRole("cs");
    await pay(body({ amount: 300000, method: "tien_mat" }), params());
    await pay(
      body({ amount: -300000, method: "tien_mat", note: "Ghi nhầm bộ khác, đính chính" }),
      params(),
    );

    const { rows } = await client.query(
      "select amount from gallery_payments where gallery_id = $1 order by created_at",
      [galleryId],
    );
    // HAI dòng, không phải một dòng bị sửa về 0.
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].amount)).toBe(300000);
    expect(Number(rows[1].amount)).toBe(-300000);
  });

  it("4. Dòng trừ mà không ghi lý do -> từ chối", async () => {
    asRole("cs");
    const res = await pay(body({ amount: -100000, method: "tien_mat" }), params());
    expect(res.status).toBe(400);

    const { rows } = await client.query(
      "select count(*) n from gallery_payments where gallery_id = $1",
      [galleryId],
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it("5. Số tiền 0, số lẻ, hoặc hình thức lạ -> từ chối", async () => {
    asRole("cs");
    for (const b of [
      { amount: 0, method: "tien_mat" },
      { amount: 1000.5, method: "tien_mat" },
      { amount: 100000, method: "bitcoin" },
      // Ba hình thức PM tự thêm, chủ studio đã bỏ: ba chi nhánh chỉ thu tiền
      // mặt và chuyển khoản.
      { amount: 100000, method: "pos" },
      { amount: 100000, method: "vi_dien_tu" },
      { amount: 100000, method: "khac" },
      { amount: 100000, method: "" },
    ]) {
      const res = await pay(body(b), params());
      expect(res.status, JSON.stringify(b)).toBe(400);
    }
  });

  it("6. Người chỉnh ảnh KHÔNG ghi nhận tiền được", async () => {
    // Luật 4 của migration 0024: CTV thời vụ không thấy bảng tiền.
    asRole("photoshop_ctv");
    const res = await pay(body({ amount: 100000, method: "tien_mat" }), params());
    expect(res.status).toBe(403);
  });

  it("7. Số PHẢI TRẢ lấy từ con số khách đã nhìn thấy lúc chốt", async () => {
    // CSKH đổi hạn mức sau đó thì phát sinh tính lại sẽ khác, nhưng khách đã
    // trả theo số cũ — biên nhận phải khớp cái khách nhìn thấy.
    await client.query("update galleries set included_quota = 16 where id = $1", [galleryId]);
    asRole("cs");
    const res = await pay(body({ amount: 50000, method: "tien_mat" }), params());
    const json = await res.json();
    expect(json.data.dueAmount).toBe(300000);

    const { rows } = await client.query(
      "select snapshot_extra_amount from gallery_payments where gallery_id = $1",
      [galleryId],
    );
    expect(Number(rows[0].snapshot_extra_amount)).toBe(300000);
    await client.query("update galleries set included_quota = 10 where id = $1", [galleryId]);
  });
});
