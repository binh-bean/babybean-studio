/**
 * BB-379 — CSKH điền tên bé cho bộ chưa có: hàm `datTenBeChoBoAnh` (cơ sở dữ liệu thật, nền
 * Fixture), bộ lọc "Chưa có tên bé" của `GET /api/admin/galleries`, và cái bìa khách đọc ra.
 *
 * Nền: chi nhánh + khách "Fixture BB-379 …" riêng (tests/fixtures/nen-fixture.ts), dọn theo id.
 *
 * Kiểm ngược (kết quả trong bàn giao):
 *   · bỏ `.is("baby_id", null)` ở hàng rào → ca "hai người cùng lúc" đỏ;
 *   · bỏ tìm bé cùng tên → ca "dùng lại bé cùng tên" đỏ (nhân đôi `babies`);
 *   · route bỏ nhánh `query.chuaTenBe` → ca bộ lọc đỏ (trả cả bộ đã có bé).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import { createAdminClient } from "@/lib/supabase/admin";
import { datTenBeChoBoAnh } from "@/lib/gallery/ten-be-bo-anh";
import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import { GET as danhSach } from "@/app/api/admin/galleries/route";
import { GET as layGallery } from "@/app/api/g/gallery/route";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";

describe("BB-379: tên bé cho bộ ảnh", () => {
  let pg: Client;
  let nen: NenFixture;
  let khacKhachId = "";
  const admin = createAdminClient();
  const bo = { a: "", b: "", c: "", khac: "" };
  let shootId = "";

  async function taoBo(nhan: string, customerId = nen.customerId, baby: string | null = null, shoot: string | null = null) {
    const { rows } = await pg.query(
      `insert into galleries (branch_id, customer_id, baby_id, shoot_id, title, status, drive_folder_id, drive_folder_url, photo_count)
       values ($1,$2,$3,$4,$5,'ready',$6,'https://example.com/x',0) returning id`,
      [nen.branchId, customerId, baby, shoot, `Fixture BB-379 ${nhan}`, `SEED_FOLDER_ID_379_${nen.runId}_${nhan}`],
    );
    return rows[0].id as string;
  }

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    nen = await dungNenFixture(pg, "BB-379");
    // Khách THỨ HAI trong cùng chi nhánh Fixture — bé của nhà này không được dùng lại cho nhà kia.
    khacKhachId = (
      await pg.query(`insert into customers (branch_id, full_name) values ($1,$2) returning id`, [nen.branchId, `Fixture BB-379 Khác ${nen.runId}`])
    ).rows[0].id;
    shootId = (
      await pg.query(`insert into shoots (branch_id, customer_id, shoot_date) values ($1,$2,current_date) returning id`, [nen.branchId, nen.customerId])
    ).rows[0].id;
    bo.a = await taoBo("a", nen.customerId, null, shootId);
    bo.b = await taoBo("b");
    bo.c = await taoBo("c");
    bo.khac = await taoBo("khac", khacKhachId);
    await pg.query(`insert into babies (customer_id, full_name) values ($1,'Fixture Bé Của Nhà Khác')`, [khacKhachId]);
  }, 60_000);

  afterAll(async () => {
    try {
      await pg.query(`update galleries set baby_id = null where branch_id = $1`, [nen.branchId]).catch(() => {});
      await pg.query(`update shoots set baby_id = null where branch_id = $1`, [nen.branchId]).catch(() => {});
      await pg.query(`delete from babies where customer_id = any($1::uuid[])`, [[nen.customerId, khacKhachId]]);
      await donNenFixture(pg, { customerIds: [nen.customerId, khacKhachId], branchIds: [nen.branchId] });
      const { rows } = await pg.query(`select count(*)::int n from branches where id = $1`, [nen.branchId]);
      expect(rows[0].n).toBe(0);
    } finally {
      await pg.end();
    }
  });

  it("1. bộ chưa có bé → tạo `babies` cho đúng khách, gắn bộ và buổi chụp, gọn khoảng trắng", async () => {
    const kq = await datTenBeChoBoAnh(admin, { galleryId: bo.a, fullName: "  Nguyễn   Bảo An " });
    expect(kq).toMatchObject({ ok: true, taoMoi: true });
    const { rows } = await pg.query(
      `select b.full_name, b.customer_id, g.baby_id, s.baby_id sb
         from galleries g join babies b on b.id = g.baby_id join shoots s on s.id = g.shoot_id where g.id = $1`,
      [bo.a],
    );
    expect(rows[0].full_name).toBe("Nguyễn Bảo An");
    expect(rows[0].customer_id).toBe(nen.customerId);
    expect(rows[0].sb).toBe(rows[0].baby_id);
  });

  it("2. bộ thứ hai của cùng khách điền cùng tên (khác hoa/thường, dấu cách) → DÙNG LẠI bé, không nhân đôi", async () => {
    const kq = await datTenBeChoBoAnh(admin, { galleryId: bo.b, fullName: "nguyễn bảo an" });
    expect(kq).toMatchObject({ ok: true, taoMoi: false });
    const { rows } = await pg.query(`select count(*)::int n from babies where customer_id = $1`, [nen.customerId]);
    expect(rows[0].n).toBe(1);
  });

  it("3. bé của khách KHÁC cùng tên không bị dùng lại", async () => {
    const kq = await datTenBeChoBoAnh(admin, { galleryId: bo.c, fullName: "Fixture Bé Của Nhà Khác" });
    expect(kq).toMatchObject({ ok: true, taoMoi: true });
    const { rows } = await pg.query(`select b.customer_id from galleries g join babies b on b.id = g.baby_id where g.id = $1`, [bo.c]);
    expect(rows[0].customer_id).toBe(nen.customerId);
  });

  it("4. bộ ĐÃ có bé → 409, không đè; tên rỗng → từ chối; hai người bấm cùng lúc chỉ một người thắng", async () => {
    expect(await datTenBeChoBoAnh(admin, { galleryId: bo.a, fullName: "Tên khác" })).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(await datTenBeChoBoAnh(admin, { galleryId: bo.khac, fullName: "   " })).toMatchObject({ ok: false, code: "INVALID_INPUT" });

    const [x, y] = await Promise.all([
      datTenBeChoBoAnh(admin, { galleryId: bo.khac, fullName: "Fixture Song Song Một" }),
      datTenBeChoBoAnh(admin, { galleryId: bo.khac, fullName: "Fixture Song Song Hai" }),
    ]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    // Bé của người thua không bị bỏ rơi trong bảng `babies`.
    const { rows } = await pg.query(
      `select count(*)::int n from babies where customer_id = $1 and full_name like 'Fixture Song Song%'`,
      [khacKhachId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("5. GET /api/admin/galleries?chuaTenBe=1 chỉ trả bộ chưa có bé; không cờ thì trả cả hai", async () => {
    // Bộ mới KHÔNG bé (d) bên cạnh các bộ đã có bé (a, b, c, khac).
    const d = await taoBo("d");
    const phien = () =>
      vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
        staffId: "00000000-0000-0000-0000-000000000379",
        role: "owner",
        permissions: quyenCuaVai("owner"),
        branchIds: [nen.branchId],
      });
    phien();
    const q = encodeURIComponent("Fixture BB-379");
    const loc = await (await danhSach(new Request(`http://localhost/api/admin/galleries?branchId=${nen.branchId}&q=${q}&chuaTenBe=1`))).json();
    const idLoc = (loc.data.items as { id: string }[]).map((i) => i.id);
    expect(idLoc).toEqual([d]);
    expect(loc.data.counts.all).toBe(1);

    const tat = await (await danhSach(new Request(`http://localhost/api/admin/galleries?branchId=${nen.branchId}&q=${q}`))).json();
    expect((tat.data.items as unknown[]).length).toBe(5);

    // Bộ mới có bé thì rời khỏi bộ lọc.
    await datTenBeChoBoAnh(admin, { galleryId: d, fullName: "Fixture Bé D" });
    phien();
    const sau = await (await danhSach(new Request(`http://localhost/api/admin/galleries?branchId=${nen.branchId}&q=${q}&chuaTenBe=1`))).json();
    expect(sau.data.items).toEqual([]);
    vi.restoreAllMocks();
  });

  it("6. bìa khách đọc tên bé vừa điền (GET /api/g/gallery)", async () => {
    const e = await taoBo("e");
    const { rows: lk } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb379a', 'owner', 'active') returning id`,
      [e],
    );
    const { rows: sel } = await pg.query(`insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`, [e, lk[0].id]);
    const phien = () =>
      vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
        galleryId: e,
        customerId: null,
        role: "owner",
        shareLinkId: lk[0].id,
        selectionId: sel[0].id,
        exp: 0,
      } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
    phien();
    const truoc = await (await layGallery(new Request("http://localhost/api/g/gallery"))).json();
    expect(JSON.stringify(truoc.data)).not.toContain("Fixture Bé E");
    await datTenBeChoBoAnh(admin, { galleryId: e, fullName: "Fixture Bé E" });
    phien();
    const sau = await (await layGallery(new Request("http://localhost/api/g/gallery"))).json();
    expect(JSON.stringify(sau.data)).toContain("Fixture Bé E");
    vi.restoreAllMocks();
  });
});
