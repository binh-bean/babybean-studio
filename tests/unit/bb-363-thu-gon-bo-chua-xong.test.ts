/**
 * BB-363 mục 1 — thu gọn ảnh cả bộ CHƯA XONG (ready / in_review / draft / sync_error) mà
 * KHÔNG AI MỞ LINK quá 6 tháng. Mốc là lần mở link cuối (`galleries.mo_link_cuoi_luc`, 0088),
 * không phải `trang_thai_tu`; chưa ai mở thì `sent_at`, rồi `created_at`.
 *
 * Chạy trên Postgres thật (bb-dev) trong MỘT giao dịch, rollback ở afterAll — kể cả migration
 * 0088 (chạy trong giao dịch, KHÔNG áp lên bb-dev). Chỉ giả Drive (`listImageFiles`) và lớp
 * REST của Supabase (SQL thật trên cùng giao dịch).
 *
 * Fixture toàn dữ liệu bịa (AGENTS.md §6): "Fixture BB-363-…", thư mục SEED_FOLDER_ID_363*.
 *
 * Kiểm ngược (dán trong bàn giao):
 *   · bỏ "ready" khỏi THU_GON_ANH.TRANG_THAI_CHUA_XONG → ca "ready chưa ai mở 300 ngày" ĐỎ;
 *   · đo mốc bộ chưa xong bằng trang_thai_tu thay vì lần mở link → ca "mở 10 ngày trước" ĐỎ;
 *   · bỏ câu ghi galleries trong tang_luot_mo_link (0088) → ca "mở link ghi mốc" ĐỎ;
 *   · bỏ nhánh "bộ đang thu gọn được đồng bộ lại = mở lại" trong trigger 0088 → ca
 *     "đồng bộ lại xong không bị thu gọn lại ngay đêm đó" ĐỎ.
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

const dbUrl = process.env.SUPABASE_DB_URL;
const NGAY = 24 * 60 * 60 * 1000;
const truoc = (ngay: number) => new Date(Date.now() - ngay * NGAY).toISOString();
const MIGRATION_0088 = path.resolve(__dirname, "../../db/migrations/0088-thu-gon-anh-bo-cu.sql");

const SAVEPOINT: NonNullable<TuyChonDonRac["giaoDich"]> = {
  mo: async (c) => {
    await c.query("savepoint sp_bb363");
  },
  xong: async (c) => {
    await c.query("release savepoint sp_bb363");
  },
  huy: async (c) => {
    await c.query("rollback to savepoint sp_bb363");
    await c.query("release savepoint sp_bb363");
  },
};

/** Lớp REST Supabase tối thiểu đủ cho dongBoBoAnh — SQL thật trên `client`. */
function supabaseTrenPg(client: pg.Client) {
  type Loc = [string, "eq" | "in", unknown];
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
          const soDong = this.den === null ? 1000 : Math.min(1000, this.den - this.tu + 1);
          const sql =
            `select ${this.cot} from ${this.bang}${this.where(ts)}` +
            (this.thuTu ? ` order by ${this.thuTu}` : "") +
            ` limit ${soDong} offset ${this.tu}`;
          return { data: (await client.query(sql, ts)).rows, error: null };
        }
        if (this.kieu === "update") {
          const set = Object.keys(this.gan).map((c) => {
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

const anhDrive = (ma: string) => ({
  id: ma,
  name: `${ma}.jpg`,
  mimeType: "image/jpeg",
  size: 1000,
  width: 100,
  height: 150,
  takenAt: null,
  subfolder: null,
  modifiedAt: null,
});

describe("BB-363 phạm vi thu gọn bộ chưa xong", () => {
  it("bộ khách chưa chọn xong nằm trong phạm vi; bộ đang đồng bộ và bộ khách đã chốt thì không", () => {
    expect(THU_GON_ANH.TRANG_THAI_CHUA_XONG).toEqual(expect.arrayContaining(["ready", "in_review"]));
    for (const s of ["syncing", "submitted", "in_retouch", "awaiting_approval", "approved"]) {
      expect(THU_GON_ANH.TRANG_THAI_CHUA_XONG).not.toContain(s);
    }
    expect(THU_GON_ANH.TRANG_THAI).toEqual(["delivered", "archived", "expired"]); // giữ như cũ
  });
});

describe.skipIf(!dbUrl)("BB-363 trên Postgres thật (giao dịch rollback)", () => {
  let client: pg.Client;
  const id: Record<string, string> = {};
  let db: Parameters<typeof dongBoBoAnh>[0];

  async function bo(galleryId: string | undefined) {
    const { rows } = await client.query(
      `select status, photo_count, danh_sach_thu_gon_luc, mo_link_cuoi_luc,
              (select count(*)::int from photos p where p.gallery_id = g.id) as tong
         from galleries g where id = $1`,
      [galleryId],
    );
    return rows[0];
  }
  const thuGon = async () => {
    const kq = await donRac(client, { thuTruoc: false, giaoDich: SAVEPOINT, chiLoai: ["anh_bo_cu"] });
    const k = kq.ketQua.find((x) => x.loai === "anh_bo_cu")!;
    expect(k.loi).toBeUndefined();
    expect(k.boQua).toBeUndefined();
    return k;
  };

  beforeAll(async () => {
    client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await client.query("begin");
    await client.query("set local lock_timeout = '5s'");

    // Một link ĐÃ MỞ trước khi áp 0088 — để kiểm bước điền sẵn mo_link_cuoi_luc từ share_links.
    id.branch = (
      await client.query(`insert into branches (code, name) values ('FX363', 'Fixture BB-363 chi nhánh') returning id`)
    ).rows[0].id;
    id.customer = (
      await client.query(
        `insert into customers (branch_id, full_name, phone) values ($1, 'Fixture BB-363 Nguyễn Thị Mai', '0901000363') returning id`,
        [id.branch],
      )
    ).rows[0].id;
    const taoBo = async (ten: string, status: string, taoLuc: string, ngoai: Record<string, string | null> = {}) =>
      (
        await client.query(
          `insert into galleries (branch_id, customer_id, title, drive_folder_id, drive_folder_url, status, created_at, sent_at)
           values ($1, $2, $3, $4, $5, $6::gallery_status, $7, $8) returning id`,
          [id.branch, id.customer, `Fixture BB-363 ${ten}`, `SEED_FOLDER_ID_363${ten}`,
            `https://drive.google.com/drive/folders/SEED_FOLDER_ID_363${ten}`, status, taoLuc, ngoai.sent_at ?? null],
        )
      ).rows[0].id as string;

    id.diemSan = await taoBo("diemSan", "ready", truoc(300));
    id.linkDiemSan = (
      await client.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, last_viewed_at)
         values ($1, 'fixture-bb363-diemsan', 'bb363d', 'owner', $2) returning id`,
        [id.diemSan, truoc(12)],
      )
    ).rows[0].id;

    // CHẠY 0088 trong giao dịch — rollback ở afterAll, bb-dev không bị áp.
    await client.query(fs.readFileSync(MIGRATION_0088, "utf8"));

    id.chuaMo = await taoBo("chuaMo", "ready", truoc(300)); // chưa ai mở, tạo 300 ngày → THU GỌN
    id.moGan = await taoBo("moGan", "ready", truoc(300)); // tạo 300 ngày, mở 10 ngày trước → GIỮ
    id.guiGan = await taoBo("guiGan", "in_review", truoc(300), { sent_at: truoc(20) }); // gửi link 20 ngày → GIỮ
    id.daChot = await taoBo("daChot", "submitted", truoc(300)); // khách đã chốt → ngoài phạm vi
    id.dangChon = await taoBo("dangChon", "in_review", truoc(400)); // khách chọn dở, không ai mở → THU GỌN
    await client.query(`update galleries set mo_link_cuoi_luc = $2 where id = $1`, [id.moGan, truoc(10)]);
    // trang_thai_tu RẤT cũ nhưng vừa mở: phải giữ (mốc là lần mở, không phải trang_thai_tu).
    await client.query(`update galleries set trang_thai_tu = $2 where id = $1`, [id.moGan, truoc(900)]);

    const anh = (g: string | undefined, tien: string, n: number) =>
      client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         select $1, $2 || i, $2 || i || '.jpg', 'image/jpeg', i, 'active' from generate_series(1, $3::int) i`,
        [g, tien, n],
      );
    for (const [k, tien] of [
      ["chuaMo", "fx363_c_"],
      ["moGan", "fx363_m_"],
      ["guiGan", "fx363_g_"],
      ["daChot", "fx363_d_"],
      ["dangChon", "fx363_s_"],
    ] as const) {
      await anh(id[k], tien, 6);
      await client.query(`update galleries set photo_count = 6 where id = $1`, [id[k]]);
    }

    // Bộ "đang chọn dở": khách đã chọn 2 ảnh (lượt chọn chưa chốt).
    id.linkChon = (
      await client.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role) values ($1, 'fixture-bb363-chon', 'bb363c', 'owner') returning id`,
        [id.dangChon],
      )
    ).rows[0].id;
    id.selChon = (
      await client.query(`insert into selections (gallery_id, share_link_id, is_primary) values ($1, $2, true) returning id`, [
        id.dangChon,
        id.linkChon,
      ])
    ).rows[0].id;
    await client.query(
      `insert into selection_items (selection_id, gallery_id, photo_id)
       select $1, $2, p.id from photos p where p.gallery_id = $2 and p.drive_file_id in ('fx363_s_2', 'fx363_s_5')`,
      [id.selChon, id.dangChon],
    );

    db = supabaseTrenPg(client) as unknown as Parameters<typeof dongBoBoAnh>[0];
  }, 120_000);

  afterAll(async () => {
    if (!client) return;
    await client.query("rollback");
    const { rows } = await client.query(
      `select (select count(*)::int from branches where code = 'FX363') as chi_nhanh,
              (select count(*)::int from information_schema.columns where table_name = 'galleries' and column_name = 'mo_link_cuoi_luc') as cot_0088`,
    );
    console.info("BB363_SAU_ROLLBACK", JSON.stringify(rows[0]));
    expect(rows[0]).toEqual({ chi_nhanh: 0, cot_0088: 0 });
    await client.end();
  });

  it("0088 điền sẵn mo_link_cuoi_luc từ share_links.last_viewed_at (lần mở thật)", async () => {
    const g = await bo(id.diemSan);
    const lech = Math.abs(new Date(g.mo_link_cuoi_luc).getTime() - new Date(truoc(12)).getTime());
    expect(lech).toBeLessThan(60_000);
  });

  it("mở link (tang_luot_mo_link) ghi mo_link_cuoi_luc = bây giờ", async () => {
    await client.query("savepoint sp_mo");
    try {
      await client.query(`select public.tang_luot_mo_link($1::uuid)`, [id.linkDiemSan]);
      const g = await bo(id.diemSan);
      expect(Date.now() - new Date(g.mo_link_cuoi_luc).getTime()).toBeLessThan(5 * 60_000);
      // Hàm security definer viết lại vẫn KHÔNG cho anon/authenticated gọi (AGENTS.md §5b).
      const { rows } = await client.query(
        `select has_function_privilege('anon', 'public.tang_luot_mo_link(uuid)', 'EXECUTE') as anon,
                has_function_privilege('authenticated', 'public.tang_luot_mo_link(uuid)', 'EXECUTE') as auth`,
      );
      expect(rows[0]).toEqual({ anon: false, auth: false });
    } finally {
      await client.query("rollback to savepoint sp_mo");
    }
  });

  it("thu gọn bộ chưa xong không ai mở > 6 tháng; giữ bộ vừa mở / vừa gửi link / khách đã chốt", async () => {
    await thuGon();
    expect((await bo(id.chuaMo)).danh_sach_thu_gon_luc).not.toBeNull();
    expect((await bo(id.dangChon)).danh_sach_thu_gon_luc).not.toBeNull();
    for (const k of ["moGan", "guiGan", "daChot", "diemSan"]) {
      const g = await bo(id[k]);
      expect({ k, thuGon: g.danh_sach_thu_gon_luc }).toEqual({ k, thuGon: null });
      expect(g.tong).toBe(k === "diemSan" ? 0 : 6);
    }
  });

  it("bộ đang chọn dở: ảnh khách đã chọn còn nguyên sau khi thu gọn", async () => {
    const g = await bo(id.dangChon);
    expect(g.tong).toBe(2);
    const { rows } = await client.query(
      `select count(*)::int n from selection_items si join photos p on p.id = si.photo_id where si.selection_id = $1`,
      [id.selChon],
    );
    expect(rows[0].n).toBe(2);
  });

  it("mở lại (đồng bộ lại từ Drive): đủ ảnh, giữ lựa chọn, trạng thái không đổi, chọn tiếp được", async () => {
    listImageFiles.mockResolvedValueOnce([1, 2, 3, 4, 5, 6].map((i) => anhDrive(`fx363_s_${i}`)));
    await dongBoBoAnh(db, id.dangChon!, { driveFolderId: "SEED_FOLDER_ID_363dangChon", coverPhotoId: "x", giaiDoanDau: false }, "bb363");
    const g = await bo(id.dangChon);
    expect(g.tong).toBe(6);
    expect(g.status).toBe("in_review");
    expect(g.danh_sach_thu_gon_luc).toBeNull();
    // Trigger 0088: đồng bộ lại một bộ ĐANG thu gọn = một lần mở lại.
    expect(Date.now() - new Date(g.mo_link_cuoi_luc).getTime()).toBeLessThan(5 * 60_000);
    const { rows } = await client.query(
      `select p.drive_file_id from selection_items si join photos p on p.id = si.photo_id where si.selection_id = $1 order by 1`,
      [id.selChon],
    );
    expect(rows.map((r) => r.drive_file_id)).toEqual(["fx363_s_2", "fx363_s_5"]);
    // Chọn tiếp một ảnh vừa nạp lại.
    await client.query(
      `insert into selection_items (selection_id, gallery_id, photo_id)
       select $1, $2, p.id from photos p where p.gallery_id = $2 and p.drive_file_id = 'fx363_s_3'`,
      [id.selChon, id.dangChon],
    );
    const { rows: n } = await client.query(`select count(*)::int n from selection_items where selection_id = $1`, [id.selChon]);
    expect(n[0].n).toBe(3);
  });

  it("đồng bộ lại xong thì đêm sau KHÔNG bị thu gọn lại ngay", async () => {
    await thuGon();
    expect((await bo(id.dangChon)).danh_sach_thu_gon_luc).toBeNull();
    expect((await bo(id.dangChon)).tong).toBe(6);
  });
});
