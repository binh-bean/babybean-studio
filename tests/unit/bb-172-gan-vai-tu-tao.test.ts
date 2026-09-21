/**
 * BB-172 chặng 2d — gán vai TỰ TẠO cho nhân sự.
 *
 * Đây là mảnh cuối làm cho màn Vai trò có nghĩa. Trước chặng này, chủ studio
 * tạo được vai và tích được quyền, nhưng không gán được cho ai: cột
 * `staff_profiles.role` là một kiểu enum chín giá trị, và mọi cửa quyền ở tầng
 * API đều so với chín cái tên đó.
 *
 * Ca cuối là ca đáng giá nhất: nó đo **quyền thật sự có hiệu lực**, bằng cách
 * hỏi chính hàm mà lớp RLS hỏi, chứ không chỉ đọc lại cột vừa ghi.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import * as staffAuth from "@/lib/auth/staff";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import { POST as taoVai } from "@/app/api/admin/roles/route";
import { PATCH as suaNhanSu } from "@/app/api/admin/staff/[id]/route";

const TEN_VAI = "Phép thử 2d — thợ chỉnh rút gọn";

let client: Client;
let vaiId = "";
let nhanSuId = "";
let roleIdCu: string | null = null;

function nhuChuStudio() {
  vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
    staffId: nhanSuId,
    role: "owner",
    roleName: "owner",
    permissions: quyenCuaVai("owner"),
    branchIds: [],
  } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
}

describe("BB-172 chặng 2d: gán vai tự tạo", () => {
  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    // Mượn một nhân sự đang có, nhớ vai cũ để trả lại nguyên trạng.
    const { rows } = await client.query(
      "select id, role_id from staff_profiles where role <> 'owner' limit 1",
    );
    if (rows.length === 0) throw new Error("Cần ít nhất một nhân sự không phải owner.");
    nhanSuId = rows[0].id;
    roleIdCu = rows[0].role_id;
  });

  afterAll(async () => {
    if (nhanSuId && roleIdCu) {
      await client.query("update staff_profiles set role_id = $1 where id = $2", [
        roleIdCu,
        nhanSuId,
      ]);
    }
    await client.query("delete from roles where name = $1 and is_system = false", [TEN_VAI]);
    await client.end();
  });

  it("tạo một vai tự tạo, gán cho nhân sự, và quyền THẬT SỰ đổi theo", async () => {
    nhuChuStudio();
    const res = await taoVai(
      new Request("http://localhost/api/admin/roles", {
        method: "POST",
        body: JSON.stringify({
          name: TEN_VAI,
          // Cố tình KHÔNG có `photos:read`: đó là thứ ca này đo.
          permissions: ["galleries:read", "retouch:read"],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    vaiId = data.id;

    nhuChuStudio();
    const gan = await suaNhanSu(
      new Request(`http://localhost/api/admin/staff/${nhanSuId}`, {
        method: "PATCH",
        body: JSON.stringify({ roleId: vaiId }),
      }),
      { params: Promise.resolve({ id: nhanSuId }) },
    );
    expect(gan.status).toBe(200);

    const { rows: sau } = await client.query(
      "select role_id from staff_profiles where id = $1",
      [nhanSuId],
    );
    expect(String(sau[0].role_id)).toBe(String(vaiId));

    // Đo bằng chính hàm mà lớp RLS hỏi, trong phiên của chính người đó.
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query(
      `set local request.jwt.claims = '{"sub":"${nhanSuId}","role":"authenticated"}'`,
    );
    const { rows: q } = await client.query(
      "select app.has_permission('galleries:read') co_doc, app.has_permission('photos:read') co_anh",
    );
    await client.query("rollback");

    expect(q[0].co_doc).toBe(true);
    // Vai tự tạo không tích ô "Xem ảnh" -> người này KHÔNG xem được ảnh, dù cột
    // `role` cũ của họ vẫn nguyên vẹn.
    expect(q[0].co_anh).toBe(false);
  });

  it("gán một vai không tồn tại thì bị từ chối", async () => {
    nhuChuStudio();
    const res = await suaNhanSu(
      new Request(`http://localhost/api/admin/staff/${nhanSuId}`, {
        method: "PATCH",
        body: JSON.stringify({ roleId: "00000000-0000-0000-0000-00000000dead" }),
      }),
      { params: Promise.resolve({ id: nhanSuId }) },
    );
    expect(res.status).toBe(400);
  });
});
