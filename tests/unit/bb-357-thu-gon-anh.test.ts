/**
 * BB-357 — thu gọn danh sách ảnh của bộ lưu trữ/hết hạn quá 6 tháng, chạy ĐÚNG
 * trên Postgres thật (bb-dev).
 *
 * Toàn bộ nằm trong MỘT giao dịch ngoài, rollback ở afterAll — kể cả migration
 * 0088 (DDL của Postgres có giao dịch): phép thử CHẠY 0088 để có cột mới rồi
 * rollback, bb-dev không bị áp migration và không mất dòng nào. `lock_timeout`
 * để phép thử không xếp hàng chặn app nếu bảng `galleries` đang bận.
 *
 * Đồng bộ lại từ Drive: chạy CHÍNH `dongBoBoAnh` (src/lib/drive/sync-gallery.ts).
 * Chỉ giả hai biên giới ra ngoài: Drive (`listImageFiles`) và lớp REST Supabase
 * (một bộ dựng câu nhỏ chạy SQL thật trên cùng giao dịch, nên khoá trùng
 * uq_photos_gallery_drive và trigger 0088 đều là của Postgres thật).
 *
 * Fixture toàn dữ liệu bịa (AGENTS.md §6): chi nhánh "FX357", thư mục SEED_FOLDER_ID_357*.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

vi.mock("server-only", () => ({}));
const listImageFiles = vi.fn();
vi.mock("@/lib/drive/list-files", () => ({ listImageFiles: (...a: unknown[]) => listImageFiles(...a) }));

import { BANG_DUOC_DON, BANG_THU_GON, donRac, khoaNgoaiPhotosLa, THU_GON_ANH, type TuyChonDonRac } from "@/lib/van-hanh/don-rac";
import { dongBoBoAnh } from "@/lib/drive/sync-gallery";

const dbUrl = process.env.SUPABASE_DB_URL;
const NGAY = 24 * 60 * 60 * 1000;
const truoc = (ngay: number) => new Date(Date.now() - ngay * NGAY).toISOString();
const MIGRATION_0088 = path.resolve(__dirname, "../../db/migrations/0088-thu-gon-anh-bo-cu.sql");

const SAVEPOINT: NonNullable<TuyChonDonRac["giaoDich"]> = {
  mo: async (c) => {
    await c.query("savepoint sp_bb357");
  },
  xong: async (c) => {
    await c.query("release savepoint sp_bb357");
  },
  huy: async (c) => {
    await c.query("rollback to savepoint sp_bb357");
    await c.query("release savepoint sp_bb357");
  },
};

/**
 * Lớp REST Supabase tối thiểu cho ĐÚNG các lời gọi của dongBoBoAnh, chạy SQL thật
 * trên `client` (cùng giao dịch với fixture). Tên cột đến từ mã nguồn, giá trị đi
 * bằng tham số.
 */
function supabaseTrenPg(client: pg.Client) {
  class Cau {
    private loc: [string, "eq" | "in", unknown][] = [];
    private kieu: "select" | "insert" | "upsert" | "update" = "select";
    private cot = "*";
    private dong: Record<string, unknown>[] = [];
    private gan: Record<string, unknown> = {};
    constructor(private bang: string) {}
    select(cot: string) {
      this.kieu = "select";
      this.cot = cot;
      return this;
    }
    insert(dong: Record<string, unknown>[]) {
      this.kieu = "insert";
      this.dong = dong;
      return this;
    }
    upsert(dong: Record<string, unknown>[], tc: { onConflict: string }) {
      expect(tc.onConflict).toBe("id");
      this.kieu = "upsert";
      this.dong = dong;
      return this;
    }
    update(gan: Record<string, unknown>) {
      this.kieu = "update";
      this.gan = gan;
      return this;
    }
    eq(cot: string, v: unknown) {
      this.loc.push([cot, "eq", v]);
      return this;
    }
    in(cot: string, v: unknown[]) {
      this.loc.push([cot, "in", v]);
      return this;
    }
    // BB-359: dongBoBoAnh đọc ảnh đang có theo trang (order + range).
    private trang = "";
    order(cot: string) {
      this.trang = ` order by ${cot}` + this.trang;
      return this;
    }
    range(tu: number, den: number) {
      this.trang += ` limit ${den - tu + 1} offset ${tu}`;
      return this;
    }
    private where(ts: unknown[]) {
      if (!this.loc.length) return "";
      return (
        " where " +
        this.loc
          .map(([c, op, v]) => {
            ts.push(v);
            return op === "eq" ? `${c} = $${ts.length}` : `${c}::text = any($${ts.length}::text[])`;
          })
          .join(" and ")
      );
    }
    private async chay(): Promise<{ data: Record<string, unknown>[] | null; error: Error | null }> {
      try {
        const ts: unknown[] = [];
        if (this.kieu === "select") {
          const { rows } = await client.query(`select ${this.cot} from ${this.bang}${this.where(ts)}${this.trang}`, ts);
          return { data: rows, error: null };
        }
        if (this.kieu === "update") {
          const cots = Object.keys(this.gan);
          const set = cots.map((c) => {
            ts.push(this.gan[c]);
            return `${c} = $${ts.length}`;
          });
          await client.query(`update ${this.bang} set ${set.join(", ")}${this.where(ts)}`, ts);
          return { data: null, error: null };
        }
        if (!this.dong.length) return { data: [], error: null };
        const cots = Object.keys(this.dong[0]!);
        const values = this.dong.map(
          (d) =>
            "(" +
            cots
              .map((c) => {
                ts.push(d[c]);
                return `$${ts.length}`;
              })
              .join(", ") +
            ")",
        );
        let sql = `insert into ${this.bang} (${cots.join(", ")}) values ${values.join(", ")}`;
        if (this.kieu === "upsert") {
          sql += ` on conflict (id) do update set ${cots.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ")}`;
        }
        await client.query(sql, ts);
        return { data: null, error: null };
      } catch (err) {
        return { data: null, error: err as Error };
      }
    }
    async maybeSingle() {
      const { data, error } = await this.chay();
      return { data: data?.[0] ?? null, error };
    }
    then<T>(ok: (v: { data: Record<string, unknown>[] | null; error: Error | null }) => T, hong?: (e: unknown) => T) {
      return this.chay().then(ok, hong);
    }
  }
  return { from: (bang: string) => new Cau(bang) };
}

describe("BB-357 hằng số và danh sách bảng", () => {
  it("photos KHÔNG lẫn vào danh sách bảng vận hành; chỉ bước anh_bo_cu được chạm", () => {
    expect(BANG_DUOC_DON).not.toContain("photos");
    expect(BANG_THU_GON).toEqual(["photos"]);
    expect(THU_GON_ANH.SAU_NGAY).toBe(180);
    expect([...THU_GON_ANH.TRANG_THAI].sort()).toEqual(["archived", "delivered", "expired"]); // BB-359 thêm đã giao
  });
});

describe.skipIf(!dbUrl)("BB-357 thu gọn ảnh trên Postgres thật (giao dịch rollback)", () => {
  let client: pg.Client;
  const id: Record<string, string> = {};
  /** Ảnh của bộ A theo vai trò. */
  const anhA: Record<string, string> = {};

  async function con(photoId: string | undefined): Promise<boolean> {
    if (!photoId) throw new Error("fixture chưa dựng");
    const { rows } = await client.query(`select 1 from photos where id = $1`, [photoId]);
    return rows.length > 0;
  }
  async function demAnh(galleryId: string | undefined): Promise<number> {
    const { rows } = await client.query(`select count(*)::int n from photos where gallery_id = $1`, [galleryId]);
    return rows[0].n;
  }
  async function bo(galleryId: string | undefined) {
    const { rows } = await client.query(
      `select photo_count, danh_sach_thu_gon_luc, so_anh_truoc_thu_gon,
              (select count(*)::int from photos p where p.gallery_id = g.id and p.status = 'active') as active
         from galleries g where id = $1`,
      [galleryId],
    );
    return rows[0];
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await client.query("begin");
    await client.query("set local lock_timeout = '5s'");
    // CHẠY 0088 trong giao dịch — rollback ở afterAll, bb-dev không bị áp.
    await client.query(fs.readFileSync(MIGRATION_0088, "utf8"));

    id.branch = (
      await client.query(`insert into branches (code, name) values ('FX357', 'Fixture BB-357 chi nhánh') returning id`)
    ).rows[0].id;
    id.customer = (
      await client.query(
        `insert into customers (branch_id, full_name, phone) values ($1, 'Fixture BB-357 Nguyễn Thị Mai', '0901000357') returning id`,
        [id.branch],
      )
    ).rows[0].id;

    const taoBo = async (ten: string, status: string, trangThaiTu: string, lastSynced: string) =>
      (
        await client.query(
          `insert into galleries (branch_id, customer_id, title, drive_folder_id, drive_folder_url, status, trang_thai_tu, last_synced_at)
           values ($1, $2, $3, $4, $5, $6::gallery_status, $7, $8) returning id`,
          [id.branch, id.customer, `Fixture BB-357 ${ten}`, `SEED_FOLDER_ID_357${ten}`,
            `https://drive.google.com/drive/folders/SEED_FOLDER_ID_357${ten}`, status, trangThaiTu, lastSynced],
        )
      ).rows[0].id as string;
    id.A = await taoBo("A", "archived", truoc(200), truoc(200)); // lưu trữ 200 ngày → THU GỌN
    id.B = await taoBo("B", "archived", truoc(30), truoc(200)); // lưu trữ mới 30 ngày → GIỮ
    id.C = await taoBo("C", "in_review", truoc(200), truoc(200)); // chưa đóng → GIỮ
    id.D = await taoBo("D", "expired", truoc(200), truoc(10)); // hết hạn lâu nhưng vừa Đồng bộ lại → GIỮ

    const anh = async (galleryId: string | undefined, ma: string, i: number, status = "active") =>
      (
        await client.query(
          `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
           values ($1, $2, $3, 'image/jpeg', $4, $5::photo_status) returning id`,
          [galleryId, `fx357_${ma}`, `${ma}.jpg`, i, status],
        )
      ).rows[0].id as string;
    const VAI = ["bia", "chon", "dot", "an", "tim", "mua", "thuong1", "thuong2"] as const;
    for (const [i, v] of VAI.entries()) anhA[v] = await anh(id.A, `A_${v}`, i + 1, v === "an" ? "hidden" : "active");
    for (const g of ["B", "C", "D"]) for (let i = 1; i <= 3; i++) await anh(id[g], `${g}_${i}`, i);
    for (const g of ["A", "B", "C", "D"]) {
      await client.query(
        `update galleries set photo_count = (select count(*) from photos where gallery_id = $1 and status = 'active') where id = $1`,
        [id[g]],
      );
    }
    // trigger 0088 không được đẩy trang_thai_tu khi status không đổi
    expect(new Date((await client.query(`select trang_thai_tu from galleries where id = $1`, [id.A])).rows[0].trang_thai_tu).getTime())
      .toBeLessThan(Date.now() - 180 * NGAY);

    await client.query(`update galleries set cover_photo_id = $2 where id = $1`, [id.A, anhA.bia]);
    const sl = (
      await client.query(
        `insert into share_links (gallery_id, token_hash, token_prefix) values ($1, $2, 'fx357') returning id`,
        [id.A, `fixture_bb357_${randomUUID()}`],
      )
    ).rows[0].id;
    const se = (await client.query(`insert into selections (gallery_id, share_link_id) values ($1, $2) returning id`, [id.A, sl]))
      .rows[0].id;
    await client.query(`insert into selection_items (selection_id, photo_id, gallery_id) values ($1, $2, $3)`, [se, anhA.chon, id.A]);
    await client.query(
      `insert into selection_rounds (gallery_id, selection_id, so_dot, trang_thai, anh_ids) values ($1, $2, 2, 'cho_xac_nhan', $3::uuid[])`,
      [id.A, se, [anhA.dot]],
    );
    await client.query(`insert into tim_gia_dinh (gallery_id, share_link_id, photo_id) values ($1, $2, $3)`, [id.A, sl, anhA.tim]);
    await client.query(
      `insert into yeu_cau_mua_them (gallery_id, so_luong, trang_thai, loai, anh_ids, share_link_id, don_gia, tam_tinh)
       values ($1, 1, 'moi', 'chinh_sua', $2::uuid[], $3, 0, 0)`,
      [id.A, [anhA.mua], sl],
    );
  }, 60_000);

  afterAll(async () => {
    if (!client) return;
    await client.query("rollback");
    const { rows } = await client.query(
      `select (select count(*)::int from branches where code = 'FX357') as chi_nhanh,
              (select count(*)::int from information_schema.columns where table_name = 'galleries' and column_name = 'danh_sach_thu_gon_luc') as cot_0088`,
    );
    console.info("BB357_SAU_ROLLBACK", JSON.stringify(rows[0]));
    await client.end();
  });

  it("khoá ngoại trỏ vào photos hôm nay đều đã được luật giữ biết", async () => {
    expect(await khoaNgoaiPhotosLa(client)).toEqual([]);
  });

  it("xem trước: đếm bộ A, không xoá dòng nào", async () => {
    const kq = await donRac(client, { thuTruoc: true, giaoDich: SAVEPOINT, chiLoai: ["anh_bo_cu"] });
    const k = kq.ketQua.find((x) => x.loai === "anh_bo_cu") as (typeof kq.ketQua)[number] & { boAnh: number };
    expect(k.loi).toBeUndefined();
    expect(k.boQua).toBeUndefined();
    expect(k.boAnh).toBeGreaterThanOrEqual(1);
    expect(k.xoa).toBeGreaterThanOrEqual(2);
    expect(await con(anhA.thuong1)).toBe(true);
    expect((await bo(id.A)).danh_sach_thu_gon_luc).toBeNull();
  });

  it("dọn thật (savepoint): bộ A mất ảnh thường, giữ bìa/ảnh chọn/đợt/ẩn/thả tim/mua thêm; B, C, D nguyên vẹn", async () => {
    const kq = await donRac(client, { thuTruoc: false, giaoDich: SAVEPOINT, chiLoai: ["anh_bo_cu"] });
    const k = kq.ketQua.find((x) => x.loai === "anh_bo_cu")!;
    expect(k.loi).toBeUndefined();

    expect(await con(anhA.thuong1)).toBe(false);
    expect(await con(anhA.thuong2)).toBe(false);
    for (const v of ["bia", "chon", "dot", "an", "tim", "mua"]) expect([v, await con(anhA[v])]).toEqual([v, true]);
    // ảnh khách chọn còn nguyên dòng chọn (CASCADE không chạy)
    const { rows: si } = await client.query(`select 1 from selection_items where photo_id = $1`, [anhA.chon]);
    expect(si).toHaveLength(1);

    const a = await bo(id.A);
    expect(a.danh_sach_thu_gon_luc).not.toBeNull();
    expect(a.so_anh_truoc_thu_gon).toBe(7); // 8 ảnh, 1 ẩn
    expect(a.photo_count).toBe(a.active); // đúng điều verify:db kiểm
    expect(a.photo_count).toBe(5);

    expect(await demAnh(id.B)).toBe(3);
    expect(await demAnh(id.C)).toBe(3);
    expect(await demAnh(id.D)).toBe(3);
    for (const g of ["B", "C", "D"]) expect((await bo(id[g])).danh_sach_thu_gon_luc).toBeNull();

    const { rows: nk } = await client.query(
      `select metadata from activity_logs where action = 'gallery.thu_gon_anh' and entity_id = $1`,
      [id.A],
    );
    expect(nk).toHaveLength(1);
    expect(nk[0].metadata.xoa).toBe(2);

    // lượt sau không đụng lại bộ đã thu gọn
    const lan2 = await donRac(client, { thuTruoc: true, giaoDich: SAVEPOINT, chiLoai: ["anh_bo_cu"] });
    expect(lan2.ketQua[0]).toBeDefined();
    const { rows: chon } = await client.query(
      `select count(*)::int n from galleries where id = $1 and danh_sach_thu_gon_luc is null`,
      [id.A],
    );
    expect(chon[0].n).toBe(0);
  });

  it("Đồng bộ lại từ Drive kéo về đủ ảnh, không trùng dòng, xoá dấu thu gọn", async () => {
    const ten = ["bia", "chon", "dot", "an", "tim", "mua", "thuong1", "thuong2"];
    listImageFiles.mockResolvedValueOnce(
      ten.map((v) => ({
        id: `fx357_A_${v}`,
        name: `${v}.jpg`,
        mimeType: "image/jpeg",
        size: 1000,
        width: 100,
        height: 150,
        takenAt: null,
        subfolder: null,
        modifiedAt: null,
      })),
    );
    const db = supabaseTrenPg(client) as unknown as Parameters<typeof dongBoBoAnh>[0];
    const kq = await dongBoBoAnh(db, id.A!, { driveFolderId: "SEED_FOLDER_ID_357A", coverPhotoId: anhA.bia ?? null, giaiDoanDau: false }, "bb357");
    expect(kq.them).toBe(2);

    const { rows } = await client.query(
      `select count(*)::int n, count(distinct drive_file_id)::int khac from photos where gallery_id = $1`,
      [id.A],
    );
    expect(rows[0]).toEqual({ n: 8, khac: 8 });
    // ảnh được giữ vẫn là CHÍNH dòng cũ (id không đổi) → lựa chọn của khách còn trỏ đúng
    expect(await con(anhA.chon)).toBe(true);
    const { rows: an } = await client.query(`select status from photos where id = $1`, [anhA.an]);
    expect(an[0].status).toBe("hidden");

    const a = await bo(id.A);
    expect(a.danh_sach_thu_gon_luc).toBeNull();
    expect(a.so_anh_truoc_thu_gon).toBeNull();
  });

  it("gặp khoá ngoại mới trỏ vào photos thì bước dừng, không xoá", async () => {
    await client.query("savepoint sp_fk");
    try {
      await client.query(`create table public.fx357_tro_anh (photo_id uuid references photos(id))`);
      expect((await khoaNgoaiPhotosLa(client)).length).toBe(1);
      const kq = await donRac(client, { thuTruoc: false, giaoDich: SAVEPOINT, chiLoai: ["anh_bo_cu"] });
      expect(kq.ketQua[0]!.loi).toMatch(/khoá ngoại mới/);
      expect(kq.ketQua[0]!.xoa).toBe(0);
    } finally {
      await client.query("rollback to savepoint sp_fk");
    }
  });
});
