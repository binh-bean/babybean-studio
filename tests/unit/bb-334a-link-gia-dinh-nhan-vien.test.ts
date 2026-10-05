/**
 * BB-334A — route nhân viên tạo / đổi / thu hồi link gia đình + ghi Lark nhiều dòng.
 *
 * Lark: `ghiLinkAppVeLark` là BẢN GIẢ (ghi lại lời gọi) — phép thử không bao giờ
 * chạm Lark thật; chốt `khongGuiRaLarkThat()` vẫn bật (kiểm ở ca cuối).
 * Cơ sở dữ liệu: bb-dev, dữ liệu "Fixture BB-334A-…", dọn theo id.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHash } from "node:crypto";

vi.mock("server-only", () => ({}));

const goiLark: { recordId: string; diaChi: string }[] = [];
vi.mock("@/lib/lark/ghi-link-app", async (goc) => ({
  ...(await goc<typeof import("@/lib/lark/ghi-link-app")>()),
  ghiLinkAppVeLark: async (o: { recordId: string; diaChi: string }) => {
    goiLark.push({ recordId: o.recordId, diaChi: o.diaChi });
    return { ghiDuoc: true, chayThu: false, recordId: o.recordId };
  },
}));

import * as staffMod from "@/lib/auth/staff";
import { GET, POST, DELETE } from "@/app/api/admin/customers/[id]/link-gia-dinh/route";
import { khongGuiRaLarkThat } from "@/lib/kiem-thu";
import { taoBb334a, donBb334a, type DuLieuBb334a } from "../fixtures/bb-334a";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

describe("BB-334A: route nhân viên link gia đình", () => {
  let d: DuLieuBb334a;
  let selGiaDinhA2 = "";

  function laNhanVien(role: string) {
    vi.spyOn(staffMod, "requireStaff").mockResolvedValue({
      staffId: null as unknown as string,
      role,
      permissions: ["galleries:share"],
      branchIds: [d.branchId],
    } as unknown as Awaited<ReturnType<typeof staffMod.requireStaff>>);
  }
  const goi = (body?: unknown) =>
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const ctx = () => ({ params: Promise.resolve({ id: d.khachA }) });

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://fixture-bb334a.test");
    d = await taoBb334a();
    await d.pg.query(`update galleries set lark_hauky_record_id = 'recFX334A' || $2 || substr(id::text,1,4) where id = any($1::uuid[])`, [
      [d.A1.id, d.A2.id],
      d.runId,
    ]);
    const { rows } = await d.pg.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [d.A2.id, d.giaDinhA.id],
    );
    selGiaDinhA2 = rows[0].id;
  }, 60_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (d) await donBb334a(d);
  }, 60_000);

  it("đã có link sống mà không xin đổi → 409", async () => {
    laNhanVien("cs");
    const r = await POST(goi({}), ctx());
    expect(r.status).toBe(409);
  });

  it("đổi link: vai không phải CSKH/Admin → 403; thiếu xác nhận → 400; link cũ còn sống", async () => {
    laNhanVien("photographer");
    expect((await POST(goi({ doiLink: true, xacNhan: true }), ctx())).status).toBe(403);
    laNhanVien("cs");
    expect((await POST(goi({ doiLink: true }), ctx())).status).toBe(400);
    const { rows } = await d.pg.query(`select status from share_links where id = $1`, [d.giaDinhA.id]);
    expect(rows[0].status).toBe("active");
  });

  it("CSKH đổi link (có xác nhận): link cũ chết ngay, lượt chọn đi theo, Lark nhận CÙNG một /k/<mã> cho mọi dòng", async () => {
    laNhanVien("cs");
    goiLark.length = 0;
    const r = await POST(goi({ doiLink: true, xacNhan: true }), ctx());
    expect(r.status).toBe(200);
    const { data } = (await r.json()) as { data: { shareLinkId: string; duongDan: string; daThuHoi: string; lark: { tong: number; ghiDuoc: number } } };

    expect(data.daThuHoi).toBe(d.giaDinhA.id);
    const { rows: cu } = await d.pg.query(`select status from share_links where id = $1`, [d.giaDinhA.id]);
    expect(cu[0].status).toBe("revoked");

    const ma = data.duongDan.replace(/^\/k\//, "");
    const { rows: moi } = await d.pg.query(`select token_hash, customer_id, gallery_id, role, expires_at from share_links where id = $1`, [data.shareLinkId]);
    expect(moi[0]).toMatchObject({ token_hash: sha256(ma), customer_id: d.khachA, gallery_id: null, role: "owner", expires_at: null });

    const { rows: sel } = await d.pg.query(`select share_link_id from selections where id = $1`, [selGiaDinhA2]);
    expect(sel[0].share_link_id).toBe(data.shareLinkId);

    expect(data.lark).toMatchObject({ tong: 2, ghiDuoc: 2 });
    expect(goiLark).toHaveLength(2);
    expect(new Set(goiLark.map((g) => g.diaChi))).toEqual(new Set([`https://fixture-bb334a.test/k/${ma}`]));
    expect(goiLark.every((g) => g.recordId.startsWith("recFX334A"))).toBe(true);

    // GET hiện lại đúng địa chỉ (giải bản mã hoá BB-201), kèm link cũ theo bộ còn sống.
    const g = await GET(new Request("http://localhost/x"), ctx());
    const gj = (await g.json()) as { data: { linkGiaDinh: { duongDan: string }; linkCuConSong: { shareLinkId: string }[]; duocDoi: boolean } };
    expect(gj.data.linkGiaDinh.duongDan).toBe(data.duongDan);
    expect(gj.data.linkCuConSong.map((l) => l.shareLinkId)).toContain(d.linkCuA1.id);
    expect(gj.data.duocDoi).toBe(true);
  });

  it("thu hồi: vai khác → 403; thiếu xác nhận → 400; CSKH có xác nhận → link chết", async () => {
    laNhanVien("photographer");
    expect((await DELETE(goi({ xacNhan: true }), ctx())).status).toBe(403);
    laNhanVien("admin");
    expect((await DELETE(goi({}), ctx())).status).toBe(400);
    const r = await DELETE(goi({ xacNhan: true }), ctx());
    expect(r.status).toBe(200);
    const { rows } = await d.pg.query(
      `select count(*)::int n from share_links where customer_id = $1 and role = 'owner' and status = 'active'`,
      [d.khachA],
    );
    expect(rows[0].n).toBe(0);
  });

  it("nhân viên chi nhánh khác → 403", async () => {
    vi.spyOn(staffMod, "requireStaff").mockResolvedValue({
      staffId: null as unknown as string,
      role: "cs",
      permissions: ["galleries:share"],
      branchIds: ["00000000-0000-4000-8000-000000000000"],
    } as unknown as Awaited<ReturnType<typeof staffMod.requireStaff>>);
    expect((await POST(goi({}), ctx())).status).toBe(403);
    expect((await GET(new Request("http://localhost/x"), ctx())).status).toBe(403);
  });

  it("chốt phép thử vẫn bật: không gì ra Lark thật", () => {
    expect(khongGuiRaLarkThat()).toBe(true);
  });
});
