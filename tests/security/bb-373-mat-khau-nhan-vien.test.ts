/**
 * BB-373 — Admin tự gõ mật khẩu mới cho nhân viên: `POST /api/admin/staff/:id/mat-khau`.
 *
 * Phép thử gọi THẲNG route handler, giả lập `requireStaff` để cắm từng vai, còn
 * tài khoản bị đặt mật khẩu là tài khoản auth THẬT của nền Fixture (tự tạo, dọn
 * ở afterAll). Không đụng tài khoản thật nào.
 *
 * Canh những điều sau:
 *  1. vai `cs`, `branch_manager` (kể cả khi có quyền `staff:manage`) → 403, mật khẩu KHÔNG đổi;
 *  2. vai `admin` → 200 và nhân viên ĐĂNG NHẬP ĐƯỢC bằng mật khẩu mới, mật khẩu cũ hết dùng;
 *  3. mật khẩu < 8 ký tự / toàn chữ số → 400, mật khẩu cũ vẫn dùng được;
 *  4. `admin` không đặt được cho tài khoản `owner` (chỉ `owner` làm được);
 *  5. nhật ký chỉ ghi "ai đặt cho ai" (`passwordReset: true`), KHÔNG chứa mật khẩu; log máy chủ cũng không;
 *  6. PATCH chung của nhân sự KHÔNG còn nhận `password` (một đường duy nhất để đặt mật khẩu).
 *
 * Kiểm ngược (AGENTS.md §5a): bỏ dòng `laVaiAdmin` trong route → test 1 đỏ; bỏ kiểm
 * độ dài → test 3 đỏ; ghi mật khẩu vào metadata → test 5 đỏ (xem bàn giao).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

vi.mock("server-only", () => ({}));

import * as staffMod from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST as datMatKhau } from "@/app/api/admin/staff/[id]/mat-khau/route";
import { PATCH as suaNhanSu } from "@/app/api/admin/staff/[id]/route";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";

type Phien = Awaited<ReturnType<typeof staffMod.requireStaff>>;

describe("BB-373: Admin tự đặt mật khẩu nhân viên", () => {
  let client: Client;
  let nen: NenFixture;
  const admin = createAdminClient();
  const run = randomBytes(4).toString("hex");
  const MAT_KHAU_CU = `Cu-${run}-aaaa1111`;
  const ids: Record<"dich" | "cs" | "bm" | "adm" | "owner" | "dichOwner", string> = {
    dich: "", cs: "", bm: "", adm: "", owner: "", dichOwner: "",
  };
  const email = (k: string) => `fixture.bb373.${k}.${run}@demo.babybean.vn`;
  const matKhauHienTai: Record<string, string> = {};

  async function taoNhanSu(k: keyof typeof ids, role: string) {
    const { data, error } = await admin.auth.admin.createUser({
      email: email(k),
      password: MAT_KHAU_CU,
      email_confirm: true,
    });
    if (error) throw error;
    ids[k] = data.user.id;
    matKhauHienTai[k] = MAT_KHAU_CU;
    const { error: e2 } = await admin.from("staff_profiles").insert({
      id: data.user.id,
      full_name: `Fixture BB-373 ${k} ${run}`,
      email: email(k),
      role,
    });
    if (e2) throw e2;
  }

  const phien = (k: "cs" | "bm" | "adm" | "owner", role: string, permissions: string[]) =>
    vi.spyOn(staffMod, "requireStaff").mockResolvedValue({
      staffId: ids[k],
      role,
      roleName: role,
      permissions,
      branchIds: [nen.branchId],
    } as unknown as Phien);

  function goi(k: keyof typeof ids, body: unknown) {
    return datMatKhau(
      new Request(`http://localhost/api/admin/staff/${ids[k]}/mat-khau`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: ids[k] }) },
    );
  }

  /** Đăng nhập thật bằng khoá anon — chứng minh mật khẩu nào đang có hiệu lực. */
  async function dangNhapDuoc(k: keyof typeof ids, matKhau: string): Promise<boolean> {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.auth.signInWithPassword({ email: email(k), password: matKhau });
    return !error && !!data.session;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    nen = await dungNenFixture(client, "BB373");
    await taoNhanSu("dich", "cs");
    await taoNhanSu("cs", "cs");
    await taoNhanSu("bm", "branch_manager");
    await taoNhanSu("adm", "admin");
    await taoNhanSu("owner", "owner");
    await taoNhanSu("dichOwner", "owner");
  }, 60_000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      await donNenFixture(client, { branchIds: [nen?.branchId], staffIds: Object.values(ids) });
    } finally {
      await client.end();
    }
  }, 60_000);

  it("vai cs (không quyền) và branch_manager (CÓ quyền staff:manage) đều bị 403, mật khẩu không đổi", async () => {
    phien("cs", "cs", []);
    const r1 = await goi("dich", { password: "MatKhauMoi-12345" });
    expect(r1.status).toBe(403);

    // Kẻ khó: vai không phải Admin nhưng được cấp staff:manage (vai tự tạo / sửa quyền).
    phien("bm", "branch_manager", ["staff:manage"]);
    const r2 = await goi("dich", { password: "MatKhauMoi-12345" });
    expect(r2.status).toBe(403);

    expect(await dangNhapDuoc("dich", MAT_KHAU_CU)).toBe(true);
    expect(await dangNhapDuoc("dich", "MatKhauMoi-12345")).toBe(false);
  });

  it("mật khẩu ngắn hơn 8 ký tự hoặc toàn chữ số → 400, mật khẩu cũ vẫn dùng được", async () => {
    phien("adm", "admin", ["staff:manage"]);
    for (const xau of ["Ab1-xyz", "1234567890"]) {
      const r = await goi("dich", { password: xau });
      expect(r.status).toBe(400);
    }
    const thieu = await goi("dich", {});
    expect(thieu.status).toBe(400);
    expect(await dangNhapDuoc("dich", MAT_KHAU_CU)).toBe(true);
  });

  it("admin không đặt được mật khẩu cho tài khoản owner → 403", async () => {
    phien("adm", "admin", ["staff:manage"]);
    const r = await goi("dichOwner", { password: "MatKhauMoi-12345" });
    expect(r.status).toBe(403);
    expect(await dangNhapDuoc("dichOwner", MAT_KHAU_CU)).toBe(true);
  });

  it("admin đặt mật khẩu 8 ký tự → 200, đăng nhập được bằng mật khẩu mới, mật khẩu cũ hết dùng; nhật ký không chứa mật khẩu", async () => {
    const matKhauMoi = `Ma${run}`; // đúng 10 ký tự, có chữ
    const matKhau8 = `Z${run.slice(0, 5)}k9`; // đúng 8 ký tự
    expect(matKhau8.length).toBe(8);
    const logMay = vi.spyOn(console, "error");
    const logInfo = vi.spyOn(console, "info");

    phien("adm", "admin", ["staff:manage"]);
    const r = await goi("dich", { password: matKhau8 });
    expect(r.status).toBe(200);
    expect(await dangNhapDuoc("dich", matKhau8)).toBe(true);
    expect(await dangNhapDuoc("dich", MAT_KHAU_CU)).toBe(false);

    // owner cũng làm được cho owner khác.
    phien("owner", "owner", ["staff:manage", "system:superuser"]);
    const r2 = await goi("dichOwner", { password: matKhauMoi });
    expect(r2.status).toBe(200);
    expect(await dangNhapDuoc("dichOwner", matKhauMoi)).toBe(true);

    // Nhật ký: có dòng "ai đặt cho ai", KHÔNG có mật khẩu ở bất cứ đâu.
    const { rows } = await client.query(
      `select actor_id, entity_id, metadata, to_jsonb(activity_logs)::text as ca_dong
         from activity_logs
        where action = 'staff.update' and entity_type = 'staff_profile' and entity_id = any($1::uuid[])`,
      [[ids.dich, ids.dichOwner]],
    );
    expect(rows.length).toBe(2);
    const dongDich = rows.find((x) => x.entity_id === ids.dich)!;
    expect(dongDich.actor_id).toBe(ids.adm);
    expect(dongDich.metadata.passwordReset).toBe(true);
    for (const x of rows) {
      expect(x.ca_dong).not.toContain(matKhau8);
      expect(x.ca_dong).not.toContain(matKhauMoi);
    }
    const tatCaLog = JSON.stringify([...logMay.mock.calls, ...logInfo.mock.calls]);
    expect(tatCaLog).not.toContain(matKhau8);
    expect(tatCaLog).not.toContain(matKhauMoi);
  });

  it("PATCH chung của nhân sự không còn nhận mật khẩu (chỉ một đường đặt mật khẩu)", async () => {
    phien("adm", "admin", ["staff:manage"]);
    const hienTai = "ChiDuocQuaMatKhauRoute-1";
    const r = await suaNhanSu(
      new Request(`http://localhost/api/admin/staff/${ids.cs}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: hienTai }),
      }),
      { params: Promise.resolve({ id: ids.cs }) },
    );
    expect(r.status).toBe(400); // không còn gì để đổi
    expect(await dangNhapDuoc("cs", MAT_KHAU_CU)).toBe(true);
    expect(await dangNhapDuoc("cs", hienTai)).toBe(false);
  });
});
