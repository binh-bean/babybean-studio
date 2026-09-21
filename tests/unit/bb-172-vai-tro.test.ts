/**
 * BB-172 chặng 2b — đường API vai trò.
 *
 * Ca quan trọng nhất là ca cuối: vai hệ thống phải bị chặn ở CẢ HAI lớp. Lớp
 * API cho thông báo đọc được; lớp trigger dưới cơ sở dữ liệu mới là lớp không
 * đi vòng qua được. Một lớp thì chưa đủ — `service_role` bỏ qua RLS, nên nếu
 * chỉ chặn ở API thì bất kỳ đường ghi nào khác cũng xoá được vai `owner`.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import * as staffAuth from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("server-only", () => ({}));

import { GET, POST } from "@/app/api/admin/roles/route";
import { PATCH, DELETE } from "@/app/api/admin/roles/[id]/route";

const admin = createAdminClient();
const TEN_THU = "Phép thử BB-172";

function nhuVai(role: string) {
  vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
    staffId: "00000000-0000-0000-0000-0000000000aa",
    role,
    branchIds: [],
    permissions: quyenCuaVai(role),
  } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
}

const post = (than: unknown) =>
  POST(new Request("http://localhost/api/admin/roles", { method: "POST", body: JSON.stringify(than) }));

const patch = (id: string, than: unknown) =>
  PATCH(
    new Request(`http://localhost/api/admin/roles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(than),
    }),
    { params: Promise.resolve({ id }) },
  );

const del = (id: string) =>
  DELETE(new Request(`http://localhost/api/admin/roles/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

describe("BB-172 chặng 2b: vai trò", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await admin.from("roles").delete().eq("name", TEN_THU).eq("is_system", false);
  });

  it("CSKH không xem và không tạo được vai trò", async () => {
    nhuVai("cs");
    expect((await GET()).status).toBe(403);
    nhuVai("cs");
    expect((await post({ name: "abc", permissions: [] })).status).toBe(403);
  });

  it("tạo vai kèm một mã quyền không tồn tại thì bị từ chối", async () => {
    nhuVai("owner");
    const res = await post({ name: TEN_THU, permissions: ["galleries:read", "bay:gio:an:com"] });
    expect(res.status).toBe(400);

    // Và không được để lại một vai nửa vời nào.
    const { data } = await admin.from("roles").select("id").eq("name", TEN_THU);
    expect(data ?? []).toHaveLength(0);
  });

  it("tạo, sửa, rồi xoá một vai tự tạo", async () => {
    nhuVai("owner");
    const taoRes = await post({ name: TEN_THU, permissions: ["galleries:read"] });
    expect(taoRes.status).toBe(200);
    const { data: tao } = await taoRes.json();
    expect(tao.isSystem).toBe(false);

    nhuVai("owner");
    const suaRes = await patch(tao.id, { permissions: ["galleries:read", "customers:read"] });
    expect(suaRes.status).toBe(200);

    const { data: sau } = await admin
      .from("roles")
      .select("permissions")
      .eq("id", tao.id)
      .single();
    expect(sau?.permissions).toContain("customers:read");

    nhuVai("owner");
    expect((await del(tao.id)).status).toBe(200);
    const { data: conLai } = await admin.from("roles").select("id").eq("id", tao.id);
    expect(conLai ?? []).toHaveLength(0);
  });

  it("vai hệ thống bị chặn ở LỚP API", async () => {
    const { data: owner } = await admin
      .from("roles")
      .select("id")
      .eq("name", "owner")
      .single();

    nhuVai("owner");
    expect((await patch(String(owner?.id), { permissions: [] })).status).toBe(403);
    nhuVai("owner");
    expect((await del(String(owner?.id))).status).toBe(403);
  });

  it("vai hệ thống bị chặn CẢ khi đi thẳng vào cơ sở dữ liệu bằng khoá quản trị", async () => {
    const { error } = await admin
      .from("roles")
      .update({ permissions: [] })
      .eq("name", "owner");

    // Trigger của 0053 phải ném. Không ném nghĩa là lớp dưới không tồn tại, và
    // lớp API ở trên chỉ là một lời hứa.
    expect(error).not.toBeNull();
    expect(String(error?.message)).toContain("không sửa");

    const { data } = await admin.from("roles").select("permissions").eq("name", "owner").single();
    expect((data?.permissions ?? []).length).toBeGreaterThan(30);
  });
});
