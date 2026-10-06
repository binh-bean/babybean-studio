/**
 * BB-372 — nhân viên xem link mời ông bà / người thân (CHỈ ĐỌC): canh chốt máy chủ.
 *
 *   1. Đúng chi nhánh mới xem được: nhân viên chi nhánh khác → 403 (cả trang khách lẫn màn bộ ảnh),
 *      vai không có `galleries:read` → 403. Khách/bộ không có → 404, mã sai → 400.
 *   2. KHÔNG lộ mã: JSON trả về không chứa mã đầy đủ của link mời, mã link gia đình, `token_hash`,
 *      bản mã hoá; `maDau` đúng 6 ký tự; mỗi link chỉ có đúng tập khoá đã khai (không có khoá lạ
 *      như tên / số điện thoại người mua).
 *   3. Số liệu đúng và không lẫn nhà khác: số lần mở, tim, yêu cầu mua thêm, đã thu hồi; màn bộ ảnh
 *      chỉ đếm tim / yêu cầu TRONG bộ đó; link của khách khác không xuất hiện.
 *   4. Báo cáo "Mời người thân" không đếm dữ liệu Fixture (khách / bộ "Fixture …").
 *
 * Dữ liệu: nền Fixture riêng (`dungNenFixture`), dọn theo id ở afterAll. Không chạm khách thật.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

vi.mock("server-only", () => ({}));

import * as staffMod from "@/lib/auth/staff";
import { GET as linkMoiCuaKhach } from "@/app/api/admin/customers/[id]/link-moi-nguoi-than/route";
import { GET as linkMoiCuaBo } from "@/app/api/admin/galleries/[id]/link-moi-nguoi-than/route";
import { GET as chiTietBo } from "@/app/api/admin/galleries/[id]/items/route";
import { GET as linkGiaDinhCuaBo } from "@/app/api/admin/galleries/[id]/link-gia-dinh/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { taoLinkGiaDinh } from "@/lib/gia-dinh/link-gia-dinh";
import { moiNguoiThan } from "@/lib/bao-cao/cac-bao-cao/moi-nguoi-than";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

const KHOA_LINK = [
  "daHetHan",
  "daThuHoi",
  "maDau",
  "moLanCuoi",
  "nhan",
  "phamVi",
  "shareLinkId",
  "soLanMo",
  "soTim",
  "soYeuCau",
  "taoLuc",
  "tieuDeBo",
].sort();

type LinkTra = {
  shareLinkId: string;
  nhan: string | null;
  soLanMo: number;
  soTim: number;
  soYeuCau: number;
  daThuHoi: boolean;
  phamVi: string;
  tieuDeBo: string | null;
  maDau: string;
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("BB-372: link mời người thân — chỉ đọc, đúng chi nhánh, không lộ mã", () => {
  let pg: Client;
  let nen: NenFixture;
  let khachKhac: string;
  const bo = { g1: "", g2: "" };
  const anh: string[] = [];
  const mai = { v1: "", v2: "", v3: "", vk: "" }; // mã đầy đủ (chỉ test biết)
  const idLink = { v1: "", v2: "", v3: "", vk: "" };
  let maGiaDinh = "";

  function laNhanVien(opts: { branchIds?: string[]; permissions?: string[] } = {}) {
    vi.spyOn(staffMod, "requireStaff").mockResolvedValue({
      staffId: null as unknown as string,
      role: "cs",
      permissions: opts.permissions ?? ["galleries:read", "galleries:share"],
      branchIds: opts.branchIds ?? [nen.branchId],
    } as unknown as Awaited<ReturnType<typeof staffMod.requireStaff>>);
  }
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const req = () => new Request("http://localhost/x");

  async function taoBo(khach: string, ten: string, taoLuc: string, soAnh: number): Promise<string> {
    const { rows } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price, created_at)
       values ($1,$2,$3,'in_review',$4,'https://example.com/bb372',$5,5,50000,$6) returning id`,
      [nen.branchId, khach, `Fixture BB-372 ${nen.runId} ${ten}`, `SEED_FOLDER_ID_BB372_${nen.runId}_${ten}`, soAnh, taoLuc],
    );
    const id = rows[0].id as string;
    for (let i = 1; i <= soAnh; i++) {
      const r = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
        [id, `bb372-${nen.runId}-${ten}-${i}`, `BB372${ten}_000${i}.jpg`, i],
      );
      anh.push(r.rows[0].id as string);
    }
    return id;
  }

  async function taoLinkMoi(o: {
    khach?: string;
    bo?: string;
    nhan: string;
    soLanMo?: number;
    thuHoi?: boolean;
  }): Promise<{ id: string; ma: string }> {
    const ma = randomBytes(32).toString("base64url"); // 43 ký tự như mã thật
    const { rows } = await pg.query(
      `insert into share_links (customer_id, gallery_id, token_hash, token_prefix, role, label, status, view_count, last_viewed_at, revoked_at)
       values ($1,$2,$3,$4,'viewer',$5,$6,$7,$8,$9) returning id`,
      [
        o.khach ?? null,
        o.bo ?? null,
        sha(ma),
        ma.slice(0, 6),
        o.nhan,
        o.thuHoi ? "revoked" : "active",
        o.soLanMo ?? 0,
        o.soLanMo ? "2026-10-04T05:00:00Z" : null,
        o.thuHoi ? "2026-10-05T00:00:00Z" : null,
      ],
    );
    return { id: rows[0].id as string, ma };
  }

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    nen = await dungNenFixture(pg, "BB-372");
    const { rows } = await pg.query(`insert into customers (branch_id, full_name) values ($1,$2) returning id`, [
      nen.branchId,
      `Fixture BB-372 Khách khác ${nen.runId}`,
    ]);
    khachKhac = rows[0].id;
    bo.g1 = await taoBo(nen.customerId, "G1", "2026-09-01T00:00:00Z", 2);
    bo.g2 = await taoBo(nen.customerId, "G2", "2026-09-20T00:00:00Z", 1);
    // anh[0], anh[1] thuộc G1; anh[2] thuộc G2.

    const kq = await taoLinkGiaDinh(createAdminClient(), { customerId: nen.customerId, staffId: null, requestId: "bb372" });
    maGiaDinh = kq.ma;

    const v1 = await taoLinkMoi({ khach: nen.customerId, nhan: "Bà nội", soLanMo: 5 });
    const v2 = await taoLinkMoi({ khach: nen.customerId, nhan: "Ông ngoại", thuHoi: true });
    const v3 = await taoLinkMoi({ bo: bo.g2, nhan: "Cô Hai", soLanMo: 1 });
    const vk = await taoLinkMoi({ khach: khachKhac, nhan: "Người nhà khác" });
    idLink.v1 = v1.id; mai.v1 = v1.ma;
    idLink.v2 = v2.id; mai.v2 = v2.ma;
    idLink.v3 = v3.id; mai.v3 = v3.ma;
    idLink.vk = vk.id; mai.vk = vk.ma;

    // V1 thả tim: 2 tấm ở G1, 1 tấm ở G2. V3 thả 1 tim ở G2.
    for (const [g, link, p] of [
      [bo.g1, idLink.v1, anh[0]],
      [bo.g1, idLink.v1, anh[1]],
      [bo.g2, idLink.v1, anh[2]],
      [bo.g2, idLink.v3, anh[2]],
    ] as const) {
      await pg.query(`insert into tim_gia_dinh (gallery_id, share_link_id, photo_id) values ($1,$2,$3)`, [g, link, p]);
    }
    // V1 gửi 1 yêu cầu chỉnh sửa ở G1 và 1 ở G2 (kèm tên + số điện thoại người mua — KHÔNG được lộ).
    for (const [g, p] of [
      [bo.g1, anh[0]],
      [bo.g2, anh[2]],
    ] as const) {
      await pg.query(
        `insert into yeu_cau_mua_them (gallery_id, product_id, so_luong, loai, anh_ids, don_gia, tam_tinh, ten_nguoi_mua, sdt_nguoi_mua, share_link_id)
         values ($1,null,1,'chinh_sua',$2::uuid[],50000,50000,'Fixture Bà Nội Thử','0901000001',$3)`,
        [g, [p], idLink.v1],
      );
    }
  }, 90_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (pg) {
      try {
        if (nen) {
          const ids = Object.values(bo).filter(Boolean);
          const khach = [nen.customerId, khachKhac].filter(Boolean);
          await pg.query(`delete from yeu_cau_mua_them where gallery_id = any($1::uuid[])`, [ids]);
          await pg.query(`delete from tim_gia_dinh where gallery_id = any($1::uuid[])`, [ids]);
          await pg.query(`delete from share_links where gallery_id = any($1::uuid[]) or customer_id = any($2::uuid[])`, [ids, khach]);
          await donNenFixture(pg, { galleryIds: ids, customerIds: khach, branchIds: [nen.branchId] });
        }
      } finally {
        await pg.end();
      }
    }
  }, 90_000);

  it("nhân viên đúng chi nhánh: trang khách trả link mời cả nhà + link mời theo bộ, KHÔNG có link của khách khác", async () => {
    laNhanVien();
    const r = await linkMoiCuaKhach(req(), ctx(nen.customerId));
    expect(r.status).toBe(200);
    const { data } = (await r.json()) as { data: { links: LinkTra[]; chuaApMigration: boolean } };
    expect(data.chuaApMigration).toBe(false);
    const theoId = new Map(data.links.map((l) => [l.shareLinkId, l]));
    expect(data.links).toHaveLength(3);
    expect(theoId.has(idLink.vk)).toBe(false);

    const v1 = theoId.get(idLink.v1)!;
    expect(v1).toMatchObject({ nhan: "Bà nội", soLanMo: 5, soTim: 3, soYeuCau: 2, daThuHoi: false, phamVi: "ca_nha" });
    const v2 = theoId.get(idLink.v2)!;
    expect(v2).toMatchObject({ nhan: "Ông ngoại", daThuHoi: true, soTim: 0, soYeuCau: 0 });
    const v3 = theoId.get(idLink.v3)!;
    expect(v3).toMatchObject({ nhan: "Cô Hai", phamVi: "bo", soTim: 1, soYeuCau: 0 });
    expect(v3.tieuDeBo).toContain("G2");
  });

  it("màn bộ ảnh: tim và yêu cầu chỉ đếm TRONG bộ đó; link theo bộ khác không hiện", async () => {
    laNhanVien();
    const g1 = (await (await linkMoiCuaBo(req(), ctx(bo.g1))).json()) as { data: { links: LinkTra[] } };
    expect(g1.data.links.map((l) => l.shareLinkId).sort()).toEqual([idLink.v1, idLink.v2].sort()); // V3 là của G2
    expect(g1.data.links.find((l) => l.shareLinkId === idLink.v1)).toMatchObject({ soTim: 2, soYeuCau: 1 });

    const g2 = (await (await linkMoiCuaBo(req(), ctx(bo.g2))).json()) as { data: { links: LinkTra[] } };
    expect(g2.data.links.map((l) => l.shareLinkId).sort()).toEqual([idLink.v1, idLink.v2, idLink.v3].sort());
    expect(g2.data.links.find((l) => l.shareLinkId === idLink.v1)).toMatchObject({ soTim: 1, soYeuCau: 1 });
    expect(g2.data.links.find((l) => l.shareLinkId === idLink.v3)).toMatchObject({ soTim: 1 });
  });

  it("AN NINH: nhân viên chi nhánh KHÁC → 403 cả hai đường (không lộ gì)", async () => {
    laNhanVien({ branchIds: ["00000000-0000-4000-8000-000000000000"] });
    const a = await linkMoiCuaKhach(req(), ctx(nen.customerId));
    const b = await linkMoiCuaBo(req(), ctx(bo.g1));
    expect(a.status).toBe(403);
    expect(b.status).toBe(403);
    const chu = (await a.text()) + (await b.text());
    expect(chu).not.toContain("Bà nội");
  });

  it("AN NINH: vai không có galleries:read → 403; mã sai → 400; không tồn tại → 404", async () => {
    laNhanVien({ permissions: ["customers:read"] });
    expect((await linkMoiCuaKhach(req(), ctx(nen.customerId))).status).toBe(403);
    expect((await linkMoiCuaBo(req(), ctx(bo.g1))).status).toBe(403);
    laNhanVien();
    expect((await linkMoiCuaKhach(req(), ctx("khong-phai-uuid"))).status).toBe(400);
    expect((await linkMoiCuaBo(req(), ctx("khong-phai-uuid"))).status).toBe(400);
    expect((await linkMoiCuaKhach(req(), ctx("00000000-0000-4000-8000-000000000001"))).status).toBe(404);
    expect((await linkMoiCuaBo(req(), ctx("00000000-0000-4000-8000-000000000001"))).status).toBe(404);
  });

  it("AN NINH: không lộ mã đầy đủ — chỉ 6 ký tự đầu; không có token_hash, mã link gia đình, tên / số điện thoại người mua", async () => {
    laNhanVien();
    for (const r of [await linkMoiCuaKhach(req(), ctx(nen.customerId)), await linkMoiCuaBo(req(), ctx(bo.g2))]) {
      const chu = await r.text();
      for (const ma of Object.values(mai)) {
        expect(chu).not.toContain(ma); // mã đầy đủ
        expect(chu).not.toContain(ma.slice(0, 7)); // quá 6 ký tự đầu
        expect(chu).not.toContain(sha(ma)); // token_hash
      }
      expect(chu).not.toContain(maGiaDinh);
      expect(chu).not.toContain(maGiaDinh.slice(0, 7));
      expect(chu).not.toMatch(/token_hash|ma_hoa|share_link_ma/);
      expect(chu).not.toContain("Fixture Bà Nội Thử");
      expect(chu).not.toContain("0901000001");
      const { data } = JSON.parse(chu) as { data: { links: Array<Record<string, unknown>> } };
      for (const l of data.links) {
        expect(Object.keys(l).sort()).toEqual(KHOA_LINK); // không khoá lạ
        expect(String(l.maDau).length).toBeLessThanOrEqual(6);
      }
      const v1 = data.links.find((l) => l.shareLinkId === idLink.v1)!;
      expect(v1.maDau).toBe(mai.v1.slice(0, 6)); // 6 ký tự đầu thật
    }
  });

  it("GỐC của 'link /g/… nổi bật': link mời người thân MỚI NHẤT của bộ không được thành 'link của bộ' ở màn chi tiết", async () => {
    // Bộ G1 có một link cũ theo bộ (owner, cũ hơn) và một link mời người thân (viewer, MỚI hơn).
    const maCu = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status, created_at)
       values ($1,$2,$3,'owner','Link cũ theo bộ','active','2026-09-02T00:00:00Z')`,
      [bo.g1, sha(maCu), maCu.slice(0, 6)],
    );
    const viewerMoi = await taoLinkMoi({ bo: bo.g1, nhan: "Dì Ba mời" });
    laNhanVien({ permissions: quyenCuaVai("owner") });
    const r = await chiTietBo(req(), ctx(bo.g1));
    expect(r.status).toBe(200);
    const { data } = (await r.json()) as { data: { shareLink: { id: string; tokenPrefix: string } | null } };
    expect(data.shareLink?.tokenPrefix).toBe(maCu.slice(0, 6)); // link owner, không phải viewer mới nhất
    expect(data.shareLink?.id).not.toBe(viewerMoi.id);
    // Màn bộ ảnh vẫn thấy link mời đó ở khối riêng, và nó KHÔNG bị đếm là "link cũ".
    const moi = (await (await linkMoiCuaBo(req(), ctx(bo.g1))).json()) as { data: { links: LinkTra[] } };
    expect(moi.data.links.some((l) => l.shareLinkId === viewerMoi.id)).toBe(true);
    const gd = (await (await linkGiaDinhCuaBo(req(), ctx(bo.g1))).json()) as { data: { soLinkCuConSong: number } };
    expect(gd.data.soLinkCuConSong).toBe(1); // chỉ link owner cũ, không đếm link mời
  });

  it("báo cáo 'Mời người thân' không đếm dữ liệu Fixture (khách và bộ 'Fixture …')", async () => {
    const kq = await moiNguoiThan.chay({
      client: createAdminClient(),
      chiNhanhIds: [nen.branchId],
      tu: new Date("2020-01-01T00:00:00Z"),
      den: new Date("2099-01-01T00:00:00Z"),
      nhom: "ngay",
    });
    expect(kq.theSo.map((t) => t.giaTri)).toEqual([0, 0, 0]);
    expect(kq.bang?.dong).toEqual([]);
  });
});
