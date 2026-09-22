/**
 * BB-061 — màn Khách hàng: tra cứu, hồ sơ bé, lịch sử chụp, chống trùng số.
 *
 * Route đọc bằng khoá quản trị nên RLS bị bỏ qua hoàn toàn. Mọi phép cách ly
 * chi nhánh ở đây là thứ DUY NHẤT chặn nhân viên chi nhánh này đọc khách của
 * chi nhánh kia — nên phép thử nào cũng có một vế NGƯỢC: không chỉ hỏi "thấy
 * đúng khách của mình" mà hỏi cả "khách của chi nhánh kia có vắng mặt không".
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET as LIST } from "@/app/api/admin/customers/route";
import { GET as CHI_TIET, PATCH } from "@/app/api/admin/customers/[id]/route";
import { POST as THEM_BE } from "@/app/api/admin/customers/[id]/babies/route";
import { DELETE as XOA_BE } from "@/app/api/admin/customers/[id]/babies/[babyId]/route";

/** Số thật trong bảng không dùng dải này, nên fixture không đụng khách thật. */
const SO_CHUNG = "0900000061";
const SO_RIENG_A = "0900000062";

describe("BB-061: khách hàng", () => {
  let client: Client;
  let branchA: string;
  let branchB: string;
  let khachA: string;
  let khachB: string;
  let khachA2: string;
  let galleryA: string;
  let galleryB: string;
  let beA: string;

  function asStaff(role: string, branchIds: string[]) {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000061",
      role,
      roleName: role,
      branchIds,
      permissions: quyenCuaVai(role),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  const goiList = (q = "") =>
    LIST(new Request(`http://localhost/api/admin/customers?q=${encodeURIComponent(q)}`));

  const goiChiTiet = (id: string) =>
    CHI_TIET(new Request(`http://localhost/api/admin/customers/${id}`), {
      params: Promise.resolve({ id }),
    });

  const goiPatch = (id: string, than: unknown) =>
    PATCH(
      new Request(`http://localhost/api/admin/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(than),
      }),
      { params: Promise.resolve({ id }) },
    );

  async function taoGallery(branchId: string, customerId: string, babyId: string | null) {
    const { rows } = await client.query(
      `insert into galleries
         (branch_id, customer_id, baby_id, title, status, drive_folder_id, drive_folder_url,
          extra_photo_price)
       values ($1,$2,$3,'Fixture BB-061','ready',$4,'https://example.com/x',50000)
       returning id`,
      [branchId, customerId, babyId, `fixture-bb061-${Date.now()}-${Math.random()}`],
    );
    return rows[0].id as string;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows } = await client.query("select id from branches order by name limit 2");
    branchA = rows[0].id;
    branchB = rows[1].id;

    /**
     * Dọn trước khi dựng.
     *
     * Một lần chạy bị cắt giữa chừng là `afterAll` không chạy, và lần sau câu
     * chèn đầu tiên chết vì `uq_customers_phone_branch`. Khi đó CẢ tệp bị báo
     * đỏ vì lý do không liên quan gì tới thứ đang kiểm — mất luôn giá trị của
     * phép thử. Dọn theo đúng hai số của fixture nên không đụng khách thật.
     */
    await client.query(
      `delete from galleries where customer_id in
         (select id from customers where phone_normalized = any($1))`,
      [[SO_CHUNG, SO_RIENG_A]],
    );
    await client.query("delete from customers where phone_normalized = any($1)", [
      [SO_CHUNG, SO_RIENG_A],
    ]);

    // Cùng MỘT số điện thoại ở hai chi nhánh: hợp lệ với
    // uq_customers_phone_branch, và đúng tình huống một nhà chụp ở hai nơi.
    const a = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,'Fixture BB-061 Nhà A',$2) returning id`,
      [branchA, SO_CHUNG],
    );
    khachA = a.rows[0].id;
    const b = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,'Fixture BB-061 Nhà B',$2) returning id`,
      [branchB, SO_CHUNG],
    );
    khachB = b.rows[0].id;
    const a2 = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,'Fixture BB-061 Nhà A hai',$2) returning id`,
      [branchA, SO_RIENG_A],
    );
    khachA2 = a2.rows[0].id;

    const be = await client.query(
      `insert into babies (customer_id, full_name) values ($1,'Bé fixture 061') returning id`,
      [khachA],
    );
    beA = be.rows[0].id;

    // Khách của chi nhánh A nhưng ĐI CHỤP ở chi nhánh B — galleries mang
    // branch_id riêng, nên đây là đường rò nếu lịch sử chụp không lọc.
    galleryA = await taoGallery(branchA, khachA, beA);
    galleryB = await taoGallery(branchB, khachA, null);
  });

  afterAll(async () => {
    await client.query("delete from galleries where id = any($1)", [[galleryA, galleryB]]);
    await client.query("delete from babies where customer_id = any($1)", [[khachA, khachB]]);
    await client.query("delete from customers where id = any($1)", [[khachA, khachB, khachA2]]);
    await client.end();
  });

  it("1. CSKH chi nhánh A không thấy khách của chi nhánh B", async () => {
    asStaff("cs", [branchA]);
    const body = await (await goiList(SO_CHUNG)).json();
    const ids = body.data.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(khachA);
    expect(ids).not.toContain(khachB);
  });

  it("2. Tìm được dù người ta gõ số có dấu cách, dấu ngoặc hay +84", async () => {
    asStaff("cs", [branchA]);
    for (const go of ["0900 000 061", "(+84) 900000061", "900000061"]) {
      const body = await (await goiList(go)).json();
      const ids = body.data.items.map((i: { id: string }) => i.id);
      expect(ids, `gõ "${go}"`).toContain(khachA);
    }
  });

  it("3. Tìm theo tên vẫn chạy khi câu gõ không phải số", async () => {
    asStaff("cs", [branchA]);
    const body = await (await goiList("Fixture BB-061 Nhà A hai")).json();
    const ids = body.data.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(khachA2);
  });

  it("4. Đánh dấu trùng số ở chi nhánh khác — và chỉ đánh dấu khi thật sự trùng", async () => {
    asStaff("cs", [branchA]);
    const body = await (await goiList(SO_CHUNG)).json();
    const dong = body.data.items.find((i: { id: string }) => i.id === khachA);
    expect(dong.trungSdtChiNhanhKhac).toBe(true);

    const body2 = await (await goiList(SO_RIENG_A)).json();
    const dong2 = body2.data.items.find((i: { id: string }) => i.id === khachA2);
    expect(dong2.trungSdtChiNhanhKhac).toBe(false);
  });

  it("5. Mở hồ sơ khách của chi nhánh khác bị từ chối", async () => {
    asStaff("cs", [branchA]);
    const res = await goiChiTiet(khachB);
    expect(res.status).toBe(403);
  });

  it("6. Lịch sử chụp chỉ gồm bộ ảnh ở chi nhánh người xem được phép thấy", async () => {
    asStaff("cs", [branchA]);
    const body = await (await goiChiTiet(khachA)).json();
    const ids = body.data.boAnh.map((g: { id: string }) => g.id);
    expect(ids).toContain(galleryA);
    // Bộ này thuộc về đúng khách đang mở, nhưng nằm ở chi nhánh B.
    expect(ids).not.toContain(galleryB);

    asStaff("owner", [branchA, branchB]);
    const body2 = await (await goiChiTiet(khachA)).json();
    const ids2 = body2.data.boAnh.map((g: { id: string }) => g.id);
    expect(ids2).toContain(galleryB);
  });

  it("7. Hồ sơ trùng số ở chi nhánh không xem được thì che tên và số", async () => {
    asStaff("cs", [branchA]);
    const body = await (await goiChiTiet(khachA)).json();
    expect(body.data.trungSdt.length).toBeGreaterThan(0);
    const kia = body.data.trungSdt[0];
    expect(kia.branchName).toBeTruthy();
    expect(kia.fullName).toBeNull();
    expect(kia.phone).toBeNull();
    expect(kia.id).toBeNull();
  });

  it("8. Sửa số trùng với khách khác CÙNG chi nhánh bị chặn, và hồ sơ giữ nguyên", async () => {
    asStaff("cs", [branchA]);
    const res = await goiPatch(khachA2, { phone: SO_CHUNG });
    expect(res.status).toBe(409);

    const { rows } = await client.query("select phone from customers where id = $1", [khachA2]);
    expect(rows[0].phone).toBe(SO_RIENG_A);
  });

  it("9. Vai chỉ có customers:read không sửa được hồ sơ", async () => {
    asStaff("accountant", [branchA]);
    const res = await goiPatch(khachA, { note: "kế toán sửa trộm" });
    expect(res.status).toBe(403);

    const { rows } = await client.query("select note from customers where id = $1", [khachA]);
    expect(rows[0].note).toBeNull();
  });

  it("10. Sửa hợp lệ thì lưu được và ghi vào nhật ký", async () => {
    asStaff("cs", [branchA]);
    const res = await goiPatch(khachA, { note: "Khách hẹn gọi lại chiều" });
    expect(res.status).toBe(200);

    const { rows } = await client.query("select note from customers where id = $1", [khachA]);
    expect(rows[0].note).toBe("Khách hẹn gọi lại chiều");

    const { rows: log } = await client.query(
      "select count(*)::int n from activity_logs where action='customer.update' and entity_id=$1",
      [khachA],
    );
    expect(log[0].n).toBeGreaterThan(0);
  });

  it("11. Thêm bé vào hồ sơ của chi nhánh khác bị từ chối", async () => {
    asStaff("cs", [branchA]);
    const res = await THEM_BE(
      new Request(`http://localhost/api/admin/customers/${khachB}/babies`, {
        method: "POST",
        body: JSON.stringify({ fullName: "Bé chui" }),
      }),
      { params: Promise.resolve({ id: khachB }) },
    );
    expect(res.status).toBe(403);

    const { rows } = await client.query(
      "select count(*)::int n from babies where customer_id = $1",
      [khachB],
    );
    expect(rows[0].n).toBe(0);
  });

  /**
   * Phép thử này kiểm CÂU TRẢ LỜI, không phải dữ liệu.
   *
   * Kiểm ngược ngày 22/09/2026: bỏ câu đếm bộ ảnh trong route thì kết quả
   * chuyển 409 -> 500 (khoá ngoại galleries.baby_id vẫn chặn), còn hàng bé vẫn
   * còn nguyên. Tức dữ liệu do cơ sở dữ liệu giữ; route chỉ dịch lỗi đó thành
   * câu tiếng Việt đọc được.
   */
  it("12. Không xoá được bé đang gắn với bộ ảnh", async () => {
    asStaff("owner", [branchA, branchB]);
    const res = await XOA_BE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: khachA, babyId: beA }),
    });
    expect(res.status).toBe(409);

    const { rows } = await client.query("select count(*)::int n from babies where id = $1", [beA]);
    expect(rows[0].n).toBe(1);
  });
});
