/**
 * BB-359 mục 2 — thu gọn bộ ĐÃ GIAO, khách mở lại bộ đã thu gọn, đồng bộ đọc theo trang,
 * photo_count = ảnh khách thấy. Chạy trên Postgres thật (bb-dev) trong MỘT giao dịch,
 * rollback ở afterAll — kể cả migration 0088 (chạy trong giao dịch, KHÔNG áp lên bb-dev).
 *
 * Chỉ giả hai biên giới ra ngoài: Drive (`listImageFiles`) và lớp REST của Supabase (một
 * bộ dựng câu nhỏ chạy SQL thật trên cùng giao dịch, có TRẦN 1.000 DÒNG như max-rows của
 * PostgREST — đúng điều kiện làm lộ lỗi 2c).
 *
 * Fixture toàn dữ liệu bịa (AGENTS.md §6): "Fixture BB-359-…", thư mục SEED_FOLDER_ID_359*.
 *
 * Kiểm ngược (dán trong bàn giao):
 *   · 2c: bỏ vòng đọc theo trang trong sync-gallery.ts → ca ">1.000 ảnh" ĐỎ (khoá trùng
 *     uq_photos_gallery_drive vì 235 ảnh bị coi là mới).
 *   · 2d: trả `photo_count: conTrenDrive.size` → ca "photo_count = ảnh active" ĐỎ (6 ≠ 5).
 *   · 2a: bỏ "delivered" khỏi THU_GON_ANH.TRANG_THAI → ca "đã giao 200 ngày" ĐỎ.
 *   · 2b: bỏ điều kiện `mo_lai_anh_luc < now() - p_khoa` trong nhan_mo_lai_anh → ca khoá ĐỎ.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

vi.mock("server-only", () => ({}));
const listImageFiles = vi.fn();
vi.mock("@/lib/drive/list-files", () => ({ listImageFiles: (...a: unknown[]) => listImageFiles(...a) }));

import { donRac, THU_GON_ANH, type TuyChonDonRac } from "@/lib/van-hanh/don-rac";
import { dongBoBoAnh } from "@/lib/drive/sync-gallery";
import { boDangThuGon, nhanMoLaiAnh } from "@/lib/gallery/mo-lai-anh-thu-gon";

const dbUrl = process.env.SUPABASE_DB_URL;
const NGAY = 24 * 60 * 60 * 1000;
const truoc = (ngay: number) => new Date(Date.now() - ngay * NGAY).toISOString();
const MIGRATION_0088 = path.resolve(__dirname, "../../db/migrations/0088-thu-gon-anh-bo-cu.sql");
/** max-rows mặc định của PostgREST trên Supabase. */
const TRAN_POSTGREST = 1000;

const SAVEPOINT: NonNullable<TuyChonDonRac["giaoDich"]> = {
  mo: async (c) => {
    await c.query("savepoint sp_bb359");
  },
  xong: async (c) => {
    await c.query("release savepoint sp_bb359");
  },
  huy: async (c) => {
    await c.query("rollback to savepoint sp_bb359");
    await c.query("release savepoint sp_bb359");
  },
};

type Loc = [string, "eq" | "in", unknown];

/** Lớp REST Supabase tối thiểu — SQL thật trên `client`, trần 1.000 dòng mỗi lượt đọc. */
function supabaseTrenPg(client: pg.Client) {
  class Cau {
    private loc: Loc[] = [];
    private kieu: "select" | "insert" | "upsert" | "update" = "select";
    private cot = "*";
    private dong: Record<string, unknown>[] = [];
    private gan: Record<string, unknown> = {};
    private thuTu: string | null = null;
    private tu = 0;
    private den: number | null = null;
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
    upsert(dong: Record<string, unknown>[]) {
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
    order(cot: string) {
      this.thuTu = cot;
      return this;
    }
    range(tu: number, den: number) {
      this.tu = tu;
      this.den = den;
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
          // Như PostgREST: không bao giờ trả quá TRAN_POSTGREST dòng, kể cả khi không xin range.
          const soDong = this.den === null ? TRAN_POSTGREST : Math.min(TRAN_POSTGREST, this.den - this.tu + 1);
          const sql =
            `select ${this.cot} from ${this.bang}${this.where(ts)}` +
            (this.thuTu ? ` order by ${this.thuTu}` : "") +
            ` limit ${soDong} offset ${this.tu}`;
          const { rows } = await client.query(sql, ts);
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
  return {
    from: (bang: string) => new Cau(bang),
    rpc: async (ten: string, thamSo: Record<string, unknown>) => {
      expect(ten).toBe("nhan_mo_lai_anh");
      try {
        const { rows } = await client.query(`select public.nhan_mo_lai_anh($1::uuid) as kq`, [thamSo.p_gallery_id]);
        return { data: rows[0].kq, error: null };
      } catch (err) {
        return { data: null, error: err as Error };
      }
    },
  };
}

const anhDrive = (ma: string, i: number) => ({
  id: ma,
  name: `${ma}.jpg`,
  mimeType: "image/jpeg",
  size: 1000,
  width: 100,
  height: 150,
  takenAt: null,
  subfolder: null,
  modifiedAt: null,
  _i: i,
});

describe("BB-359 phạm vi thu gọn", () => {
  it("đã giao nằm trong phạm vi (anh chốt 02/10)", () => {
    expect(THU_GON_ANH.TRANG_THAI).toContain("delivered");
    expect(THU_GON_ANH.SAU_NGAY).toBe(180);
  });
});

describe.skipIf(!dbUrl)("BB-359 trên Postgres thật (giao dịch rollback)", () => {
  let client: pg.Client;
  const id: Record<string, string> = {};
  let db: Parameters<typeof dongBoBoAnh>[0];

  async function bo(galleryId: string | undefined) {
    const { rows } = await client.query(
      `select status, photo_count, trang_thai_tu, danh_sach_thu_gon_luc, mo_lai_anh_luc,
              (select count(*)::int from photos p where p.gallery_id = g.id and p.status = 'active') as active,
              (select count(*)::int from photos p where p.gallery_id = g.id) as tong
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

    id.branch = (
      await client.query(`insert into branches (code, name) values ('FX359', 'Fixture BB-359 chi nhánh') returning id`)
    ).rows[0].id;
    id.customer = (
      await client.query(
        `insert into customers (branch_id, full_name, phone) values ($1, 'Fixture BB-359 Nguyễn Thị Mai', '0901000359') returning id`,
        [id.branch],
      )
    ).rows[0].id;

    // Bộ ĐÃ GIAO tạo TRƯỚC khi chạy 0088 — để kiểm bước điền sẵn trang_thai_tu từ deliveries.
    id.giaoCu = (
      await client.query(
        `insert into galleries (branch_id, customer_id, title, drive_folder_id, drive_folder_url, status)
         values ($1, $2, 'Fixture BB-359 giao cũ', 'SEED_FOLDER_ID_359G', 'https://drive.google.com/drive/folders/SEED_FOLDER_ID_359G', 'delivered')
         returning id`,
        [id.branch, id.customer],
      )
    ).rows[0].id;
    await client.query(
      `insert into deliveries (gallery_id, branch_id, status, delivered_at) values ($1, $2, 'delivered', $3)`,
      [id.giaoCu, id.branch, truoc(4000)], // rất cũ: đứng đầu hàng thu gọn, trước mọi bộ thật
    );

    // CHẠY 0088 trong giao dịch — rollback ở afterAll, bb-dev không bị áp.
    await client.query(fs.readFileSync(MIGRATION_0088, "utf8"));

    const taoBo = async (ten: string, status: string, trangThaiTu: string) =>
      (
        await client.query(
          `insert into galleries (branch_id, customer_id, title, drive_folder_id, drive_folder_url, status, trang_thai_tu, last_synced_at)
           values ($1, $2, $3, $4, $5, $6::gallery_status, $7, $7) returning id`,
          [id.branch, id.customer, `Fixture BB-359 ${ten}`, `SEED_FOLDER_ID_359${ten}`,
            `https://drive.google.com/drive/folders/SEED_FOLDER_ID_359${ten}`, status, trangThaiTu],
        )
      ).rows[0].id as string;
    id.giaoMoi = await taoBo("giaoMoi", "delivered", truoc(30)); // giao 30 ngày → GIỮ
    id.lon = await taoBo("lon", "delivered", truoc(10)); // bộ 1.235 ảnh (đồng bộ lại)
    id.an = await taoBo("an", "delivered", truoc(10)); // có ảnh ẩn (photo_count)

    // Ảnh: bộ giao cũ 4 tấm (1 bìa); bộ lớn 1.235 tấm; bộ ẩn 6 tấm (1 ẩn).
    const anh = (g: string | undefined, tien: string, n: number) =>
      client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         select $1, $2 || i, $2 || i || '.jpg', 'image/jpeg', i, 'active' from generate_series(1, $3::int) i`,
        [g, tien, n],
      );
    await anh(id.giaoCu, "fx359_g_", 4);
    await anh(id.lon, "fx359_l_", 1235);
    await anh(id.an, "fx359_a_", 6);
    await client.query(`update photos set status = 'hidden' where gallery_id = $1 and drive_file_id = 'fx359_a_6'`, [id.an]);
    for (const g of [id.giaoCu, id.lon, id.an]) {
      await client.query(
        `update galleries set photo_count = (select count(*) from photos where gallery_id = $1 and status = 'active') where id = $1`,
        [g],
      );
    }
    const bia = (await client.query(`select id from photos where gallery_id = $1 and drive_file_id = 'fx359_g_1'`, [id.giaoCu]))
      .rows[0].id;
    await client.query(`update galleries set cover_photo_id = $2 where id = $1`, [id.giaoCu, bia]);

    db = supabaseTrenPg(client) as unknown as Parameters<typeof dongBoBoAnh>[0];
  }, 120_000);

  afterAll(async () => {
    if (!client) return;
    await client.query("rollback");
    const { rows } = await client.query(
      `select (select count(*)::int from branches where code = 'FX359') as chi_nhanh,
              (select count(*)::int from information_schema.columns where table_name = 'galleries' and column_name = 'mo_lai_anh_luc') as cot_0088`,
    );
    console.info("BB359_SAU_ROLLBACK", JSON.stringify(rows[0]));
    await client.end();
  });

  it("2a: 0088 điền mốc bộ đã giao từ deliveries.delivered_at (không phải updated_at mới)", async () => {
    const g = await bo(id.giaoCu);
    expect(new Date(g.trang_thai_tu).getTime()).toBeLessThan(Date.now() - 180 * NGAY);
  });

  it("2a: bộ đã giao > 6 tháng được thu gọn (giữ bìa), bộ giao 30 ngày giữ nguyên", async () => {
    const kq = await donRac(client, { thuTruoc: false, giaoDich: SAVEPOINT, chiLoai: ["anh_bo_cu"] });
    const k = kq.ketQua.find((x) => x.loai === "anh_bo_cu")!;
    expect(k.loi).toBeUndefined();
    const cu = await bo(id.giaoCu);
    expect(cu.danh_sach_thu_gon_luc).not.toBeNull();
    expect(cu.tong).toBe(1); // còn bìa
    expect(cu.photo_count).toBe(cu.active);
    const moi = await bo(id.giaoMoi);
    expect(moi.danh_sach_thu_gon_luc).toBeNull();
  });

  it("2b: boDangThuGon + nhan_mo_lai_anh — nhận MỘT lần, lần sau 'dang_mo', bộ thường 'khong_thu_gon'", async () => {
    expect(await boDangThuGon(db as never, id.giaoCu!)).toBe(true);
    expect(await boDangThuGon(db as never, id.giaoMoi!)).toBe(false);
    expect(await nhanMoLaiAnh(db as never, id.giaoMoi!)).toBe("khong_thu_gon");
    expect(await nhanMoLaiAnh(db as never, id.giaoCu!)).toBe("da_nhan");
    expect(await nhanMoLaiAnh(db as never, id.giaoCu!)).toBe("dang_mo");
    expect(await nhanMoLaiAnh(db as never, id.giaoCu!)).toBe("dang_mo");
    expect((await bo(id.giaoCu)).mo_lai_anh_luc).not.toBeNull();
  });

  it("2b: quá 3 bộ khác đang mở lại cùng lúc → 'ban' (giữ hạn mức Drive)", async () => {
    await client.query("savepoint sp_ban");
    try {
      await client.query(
        `update galleries set danh_sach_thu_gon_luc = now(), mo_lai_anh_luc = now() where id = any($1::uuid[])`,
        [[id.giaoMoi, id.lon, id.an]],
      );
      const khac = (
        await client.query(
          `insert into galleries (branch_id, customer_id, title, drive_folder_id, drive_folder_url, status, danh_sach_thu_gon_luc)
           values ($1, $2, 'Fixture BB-359 thứ tư', 'SEED_FOLDER_ID_359X', 'https://example.com/x', 'delivered', now()) returning id`,
          [id.branch, id.customer],
        )
      ).rows[0].id;
      expect(await nhanMoLaiAnh(db as never, khac)).toBe("ban");
    } finally {
      await client.query("rollback to savepoint sp_ban");
    }
  });

  it("2b: Đồng bộ lại xong (dongBoBoAnh) → hết thu gọn, đủ ảnh, không trùng", async () => {
    listImageFiles.mockResolvedValueOnce([1, 2, 3, 4].map((i) => anhDrive(`fx359_g_${i}`, i)));
    const kq = await dongBoBoAnh(db, id.giaoCu!, { driveFolderId: "SEED_FOLDER_ID_359G", coverPhotoId: null, giaiDoanDau: false }, "bb359");
    expect(kq.them).toBe(3);
    const g = await bo(id.giaoCu);
    expect(g.tong).toBe(4);
    expect(g.danh_sach_thu_gon_luc).toBeNull();
    expect(await boDangThuGon(db as never, id.giaoCu!)).toBe(false);
  });

  it("2c: bộ 1.235 ảnh (> trần 1.000 của PostgREST) đồng bộ lại không chèn trùng", async () => {
    const tren = Array.from({ length: 1240 }, (_, k) => anhDrive(`fx359_l_${k + 1}`, k + 1));
    listImageFiles.mockResolvedValueOnce(tren);
    const kq = await dongBoBoAnh(db, id.lon!, { driveFolderId: "SEED_FOLDER_ID_359lon", coverPhotoId: "x", giaiDoanDau: false }, "bb359");
    expect(kq.them).toBe(5); // chỉ 5 tấm thật sự mới
    expect(kq.capNhat).toBe(1235);
    const { rows } = await client.query(
      `select count(*)::int n, count(distinct drive_file_id)::int khac from photos where gallery_id = $1`,
      [id.lon],
    );
    expect(rows[0]).toEqual({ n: 1240, khac: 1240 });
  });

  it("2d: photo_count sau đồng bộ = số ảnh active (khớp verify:db), không tính ảnh ẩn", async () => {
    listImageFiles.mockResolvedValueOnce([1, 2, 3, 4, 5, 6].map((i) => anhDrive(`fx359_a_${i}`, i)));
    const kq = await dongBoBoAnh(db, id.an!, { driveFolderId: "SEED_FOLDER_ID_359an", coverPhotoId: "x", giaiDoanDau: false }, "bb359");
    const g = await bo(id.an);
    expect(g.active).toBe(5);
    expect(g.photo_count).toBe(g.active);
    expect(kq.photoCount).toBe(5);
  });
});
