/**
 * BB-368 — link gia đình ở màn chi tiết bộ ảnh (anh chốt 06/10).
 *
 * Canh ba chốt máy chủ:
 *   1. `POST /api/admin/galleries/<id>/share-link` khi khách của bộ ĐÃ có link
 *      gia đình sống → 409, KHÔNG tạo link theo bộ, KHÔNG thu hồi link cũ,
 *      KHÔNG ghi Lark (không còn đường nào ghi đè ô Link app bằng `/g/`).
 *   2. `ghiLinkGiaDinhVeLark`: mỗi dòng Hậu Kỳ nhận `/k/<mã>/<n>` của ĐÚNG bộ
 *      đó — không phải `/k/<mã>` chung, không lệch số giữa hai bộ.
 *   3. `ghiLinkManConSauDongBo` (sau Đồng bộ ảnh): chỉ ghi khi bộ có ảnh + khách
 *      có link gia đình, và luôn xin `chiKhiTrong: true` (ô đã có gì thì thôi).
 *
 * Lark: `ghiLinkAppVeLark` là BẢN GIẢ (ghi lại lời gọi) — không bao giờ chạm Lark
 * thật; chốt `khongGuiRaLarkThat()` vẫn bật (ca cuối). Phần "ô đã có thì không
 * ghi" ở tầng `fetch` nằm ở tests/unit/bb-368-ghi-lark-chi-khi-trong.test.ts.
 *
 * Dữ liệu: nền Fixture riêng (`dungNenFixture`), dọn theo id ở afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

type GoiLark = { recordId: string; diaChi: string; chiKhiTrong?: boolean };
const goiLark: GoiLark[] = [];
vi.mock("@/lib/lark/ghi-link-app", async (goc) => ({
  ...(await goc<typeof import("@/lib/lark/ghi-link-app")>()),
  ghiLinkAppVeLark: async (o: GoiLark) => {
    goiLark.push({ recordId: o.recordId, diaChi: o.diaChi, chiKhiTrong: o.chiKhiTrong });
    return { ghiDuoc: true, chayThu: false, recordId: o.recordId };
  },
}));

import * as staffMod from "@/lib/auth/staff";
import { POST as taoLinkTheoBo } from "@/app/api/admin/galleries/[id]/share-link/route";
import { GET as docLinkCuaBo } from "@/app/api/admin/galleries/[id]/link-gia-dinh/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { taoLinkGiaDinh, ghiLinkGiaDinhVeLark, ghiLinkManConSauDongBo } from "@/lib/gia-dinh/link-gia-dinh";
import { khongGuiRaLarkThat } from "@/lib/kiem-thu";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";

const GOC = "https://fixture-bb368.test";

describe("BB-368: link gia đình ở màn bộ ảnh — chốt máy chủ", () => {
  let pg: Client;
  let nen: NenFixture;
  let khachKhac: string;
  /** Bộ 1 (cũ hơn), bộ 2 (mới hơn) của khách chính; bộ 3 chưa có ảnh; bộ K của khách khác. */
  const bo: Record<"b1" | "b2" | "b3" | "k1", string> = { b1: "", b2: "", b3: "", k1: "" };
  let linkCuB2 = "";
  let maGiaDinh = "";

  function laNhanVien(role = "cs") {
    vi.spyOn(staffMod, "requireStaff").mockResolvedValue({
      staffId: null as unknown as string,
      role,
      permissions: ["galleries:share", "galleries:write"],
      branchIds: [nen.branchId],
    } as unknown as Awaited<ReturnType<typeof staffMod.requireStaff>>);
  }
  const post = () =>
    new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  async function taoBo(khach: string, ten: string, taoLuc: string, soAnh: number): Promise<string> {
    const { rows } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price, lark_hauky_record_id, created_at)
       values ($1,$2,$3,$4,$5,'https://example.com/bb368',$6,5,50000,$7,$8) returning id`,
      [
        nen.branchId,
        khach,
        `Fixture BB-368 ${nen.runId} Bộ ${ten}`,
        soAnh > 0 ? "in_review" : "draft",
        `SEED_FOLDER_ID_BB368_${nen.runId}_${ten}`,
        soAnh,
        `recFX368${nen.runId}${ten}`,
        taoLuc,
      ],
    );
    const id = rows[0].id as string;
    for (let i = 1; i <= soAnh; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [id, `bb368-${nen.runId}-${ten}-${i}`, `BB368${ten}_000${i}.jpg`, i],
      );
    }
    return id;
  }

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", GOC);
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    nen = await dungNenFixture(pg, "BB-368");
    const { rows } = await pg.query(`insert into customers (branch_id, full_name) values ($1,$2) returning id`, [
      nen.branchId,
      `Fixture BB-368 Khách khác ${nen.runId}`,
    ]);
    khachKhac = rows[0].id;
    // Tạo bộ 2 TRƯỚC bộ 1 trong thời gian thực, nhưng created_at của bộ 1 cũ hơn:
    // số thứ tự phải theo created_at (cách trang gia đình đánh số), không theo lượt chèn.
    bo.b2 = await taoBo(nen.customerId, "B2", "2026-09-20T00:00:00Z", 2);
    bo.b1 = await taoBo(nen.customerId, "B1", "2026-09-01T00:00:00Z", 2);
    bo.b3 = await taoBo(nen.customerId, "B3", "2026-10-01T00:00:00Z", 0);
    bo.k1 = await taoBo(khachKhac, "K1", "2026-09-05T00:00:00Z", 2);
  }, 60_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (pg) {
      try {
        if (nen) {
          const ids = Object.values(bo).filter(Boolean);
          await pg.query(`delete from selections where gallery_id = any($1::uuid[])`, [ids]);
          await pg.query(
            `delete from share_links where gallery_id = any($1::uuid[]) or customer_id = any($2::uuid[])`,
            [ids, [nen.customerId, khachKhac]],
          );
          await donNenFixture(pg, { galleryIds: ids, customerIds: [nen.customerId, khachKhac], branchIds: [nen.branchId] });
        }
      } finally {
        await pg.end();
      }
    }
  }, 60_000);

  it("khách CHƯA có link gia đình: share-link vẫn tạo link theo bộ như cũ (đối chứng)", async () => {
    laNhanVien();
    goiLark.length = 0;
    const r = await taoLinkTheoBo(post(), ctx(bo.b2));
    expect(r.status).toBe(200);
    const { data } = (await r.json()) as { data: { shareLinkId: string; duongDan: string } };
    expect(data.duongDan).toMatch(/^\/g\//);
    linkCuB2 = data.shareLinkId;
    expect(goiLark).toHaveLength(1);
  });

  it("GET màn bộ ảnh khi chưa có link gia đình: soThuTu đúng theo created_at, linkGiaDinh null", async () => {
    laNhanVien();
    const r = await docLinkCuaBo(new Request("http://localhost/x"), ctx(bo.b2));
    expect(r.status).toBe(200);
    const { data } = (await r.json()) as { data: { customerId: string; soThuTu: number; linkGiaDinh: unknown; soLinkCuConSong: number } };
    expect(data.customerId).toBe(nen.customerId);
    expect(data.soThuTu).toBe(2);
    expect(data.linkGiaDinh).toBeNull();
    expect(data.soLinkCuConSong).toBe(1);
  });

  it("khách ĐÃ có link gia đình: share-link → 409 kèm link màn con, không tạo / không thu hồi / không ghi Lark", async () => {
    const admin = createAdminClient();
    const kq = await taoLinkGiaDinh(admin, { customerId: nen.customerId, staffId: null, requestId: "bb368" });
    maGiaDinh = kq.ma;
    expect(kq.luuDiaChiDuoc).toBe(true);

    const truoc = await pg.query(`select id, status from share_links where gallery_id = $1 order by id`, [bo.b2]);
    laNhanVien();
    goiLark.length = 0;
    const r = await taoLinkTheoBo(post(), ctx(bo.b2));
    expect(r.status).toBe(409);
    const j = (await r.json()) as {
      error: { code: string; details: { linkGiaDinh: { duongDan: string; duongDanManCon: string; soThuTu: number } } };
    };
    expect(j.error.code).toBe("CONFLICT");
    expect(j.error.details.linkGiaDinh.duongDan).toBe(`/k/${maGiaDinh}`);
    expect(j.error.details.linkGiaDinh.duongDanManCon).toBe(`/k/${maGiaDinh}/2`);

    const sau = await pg.query(`select id, status from share_links where gallery_id = $1 order by id`, [bo.b2]);
    expect(sau.rows).toEqual(truoc.rows); // không thêm link, link cũ không bị thu hồi
    expect(sau.rows.find((x) => x.id === linkCuB2)?.status).toBe("active");
    expect(goiLark).toHaveLength(0);
  });

  it("GET màn bộ ảnh khi đã có link gia đình: link màn con /k/<mã>/<n> đúng bộ", async () => {
    laNhanVien();
    for (const [id, n] of [
      [bo.b1, 1],
      [bo.b2, 2],
      [bo.b3, 3],
    ] as const) {
      const r = await docLinkCuaBo(new Request("http://localhost/x"), ctx(id));
      const { data } = (await r.json()) as {
        data: { soThuTu: number; coAnh: boolean; linkGiaDinh: { duongDanManCon: string; diaChiManCon: string } };
      };
      expect(data.soThuTu).toBe(n);
      expect(data.linkGiaDinh.duongDanManCon).toBe(`/k/${maGiaDinh}/${n}`);
      expect(data.linkGiaDinh.diaChiManCon).toBe(`${GOC}/k/${maGiaDinh}/${n}`);
      expect(data.coAnh).toBe(id !== bo.b3);
    }
  });

  it("nhân viên chi nhánh khác: GET màn bộ ảnh → 403 (không lộ link)", async () => {
    vi.spyOn(staffMod, "requireStaff").mockResolvedValue({
      staffId: null as unknown as string,
      role: "cs",
      permissions: ["galleries:share"],
      branchIds: ["00000000-0000-4000-8000-000000000000"],
    } as unknown as Awaited<ReturnType<typeof staffMod.requireStaff>>);
    expect((await docLinkCuaBo(new Request("http://localhost/x"), ctx(bo.b2))).status).toBe(403);
  });

  it("ghiLinkGiaDinhVeLark: mỗi dòng Hậu Kỳ nhận /k/<mã>/<n> của ĐÚNG bộ đó", async () => {
    goiLark.length = 0;
    const kq = await ghiLinkGiaDinhVeLark(createAdminClient(), nen.customerId, maGiaDinh);
    expect(kq.tong).toBe(3);
    const theoDong = Object.fromEntries(goiLark.map((g) => [g.recordId, g.diaChi]));
    expect(theoDong).toEqual({
      [`recFX368${nen.runId}B1`]: `${GOC}/k/${maGiaDinh}/1`,
      [`recFX368${nen.runId}B2`]: `${GOC}/k/${maGiaDinh}/2`,
      [`recFX368${nen.runId}B3`]: `${GOC}/k/${maGiaDinh}/3`,
    });
    // Không dòng nào nhận link trang gia đình chung.
    expect(goiLark.some((g) => g.diaChi === `${GOC}/k/${maGiaDinh}`)).toBe(false);
    // Dòng của khách khác không bị chạm.
    expect(goiLark.some((g) => g.recordId.endsWith("K1"))).toBe(false);
  });

  it("sau Đồng bộ ảnh: bộ có ảnh + khách có link → ghi /k/<mã>/<n> với chiKhiTrong, có nhật ký 6 ký tự", async () => {
    goiLark.length = 0;
    const kq = await ghiLinkManConSauDongBo(createAdminClient(), bo.b1, { requestId: "bb368-sync" });
    expect(kq).toMatchObject({ daThu: true, ghiDuoc: true, duongDan: `/k/${maGiaDinh}/1` });
    expect(goiLark).toEqual([{ recordId: `recFX368${nen.runId}B1`, diaChi: `${GOC}/k/${maGiaDinh}/1`, chiKhiTrong: true }]);

    const { rows } = await pg.query(
      `select metadata from activity_logs where entity_id = $1 and action = 'share_link.gia_dinh_ghi_lark_sau_dong_bo'`,
      [bo.b1],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.tokenPrefix).toBe(maGiaDinh.slice(0, 6));
    expect(JSON.stringify(rows[0].metadata)).not.toContain(maGiaDinh);
  });

  it("sau Đồng bộ ảnh: bộ chưa có ảnh hoặc khách chưa có link gia đình → không ghi gì", async () => {
    goiLark.length = 0;
    const admin = createAdminClient();
    expect(await ghiLinkManConSauDongBo(admin, bo.b3, { requestId: "bb368" })).toMatchObject({ daThu: false, boQua: "bo_chua_co_anh" });
    expect(await ghiLinkManConSauDongBo(admin, bo.k1, { requestId: "bb368" })).toMatchObject({
      daThu: false,
      boQua: "chua_co_link_gia_dinh",
    });
    expect(goiLark).toHaveLength(0);
  });

  it("chốt phép thử vẫn bật: không gì ra Lark thật", () => {
    expect(khongGuiRaLarkThat()).toBe(true);
  });
});
