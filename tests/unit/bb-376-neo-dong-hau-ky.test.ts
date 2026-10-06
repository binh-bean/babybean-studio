/**
 * BB-376 — bộ ảnh tạo qua đường hook/cron Lark phải neo `lark_hauky_record_id`.
 *
 * Cơ sở dữ liệu: CHỈ nền Fixture (chi nhánh + khách "Fixture BB-376 …"), dọn theo id.
 * Lark giả: bản ghi dựng tay, `docDongTheoMa` giả — không gọi Lark thật.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { dungNenFixture, donNenFixture } from "../fixtures/nen-fixture";
import { syncSingleRetouchRecord } from "@/lib/lark/sync-retouch";
import { dienBuNeoDongHauKy, neoBoAnhVaoDongHauKy, type DongHauKyKhop } from "@/lib/lark/neo-dong-hau-ky";

describe("BB-376 trên cơ sở dữ liệu (nền Fixture)", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let runId = "";
  let so = "";
  let branches: { id: string; code: string; name: string }[] = [];

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const nen = await dungNenFixture(pg, "BB-376");
    branchId = nen.branchId;
    customerId = nen.customerId;
    runId = nen.runId;
    so = String(parseInt(runId, 16) % 1_000_000).padStart(6, "0");
    branches = [{ id: branchId, code: `FX-${runId}`, name: `Fixture BB-376 ${runId}` }];
  });

  afterAll(async () => {
    try {
      await donNenFixture(pg, { customerIds: [customerId], branchIds: [branchId] });
    } finally {
      await pg.end();
    }
  });

  const thuMuc = (h: string) => `SEED_FOLDER_ID_BB376_${runId}_${h}`;
  function dongHauKy(rec: string, folder: string) {
    return {
      record_id: rec,
      fields: {
        "Tên KH": [{ text: `Fixture BB-376 Mẹ ${runId}`, type: "text" }],
        "Mã KH": [{ text: `FXKH376${runId}${folder}`, type: "text" }],
        "Hợp đồng chi tiết": [{ text: `HD_20261006#${so}_${folder.length}`, type: "text" }],
        "Link ảnh gửi khách": `https://drive.google.com/drive/folders/${thuMuc(folder)}`,
      } as Record<string, unknown>,
    };
  }
  const dongBo = (record: ReturnType<typeof dongHauKy>, write = true) =>
    syncSingleRetouchRecord({
      client: pg,
      record,
      branches,
      staffList: [],
      write,
      index: 0,
      dbUrl: process.env.SUPABASE_DB_URL,
    });
  const neoCua = async (id: string) =>
    (await pg.query(`select lark_hauky_record_id as r from galleries where id = $1`, [id])).rows[0].r as string | null;
  const nhatKyLech = async (galleryId: string) =>
    (
      await pg.query(`select metadata from activity_logs where entity_id = $1 and action = 'gallery.lark_dong_lech'`, [galleryId])
    ).rows;

  it("đường hook tạo bộ MỚI → có lark_hauky_record_id = mã dòng", async () => {
    const kq = await dongBo(dongHauKy("recFX376a", "a"));
    expect(kq.action).toBe("created");
    expect(await neoCua(kq.galleryId!)).toBe("recFX376a");
  });

  it("chạy thử (write=false) không tạo gì, cũng không neo", async () => {
    const kq = await dongBo(dongHauKy("recFX376z", "z"), false);
    expect(kq.action).toBe("created");
    expect(kq.galleryId).toBeUndefined();
    const { rows } = await pg.query(`select 1 from galleries where drive_folder_id = $1`, [thuMuc("z")]);
    expect(rows).toHaveLength(0);
  });

  it("bộ có sẵn (đường cũ, chưa neo) → lượt đồng bộ sau neo vào dòng; lượt thứ ba giữ nguyên", async () => {
    const { rows } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count)
       values ($1,$2,'Fixture BB-376 Bộ cũ','draft',$3,'https://example.com/x',0) returning id`,
      [branchId, customerId, thuMuc("b")],
    );
    const id = rows[0].id as string;
    expect(await neoCua(id)).toBeNull();
    const kq = await dongBo(dongHauKy("recFX376b", "b"));
    expect(kq.action).toBe("already_exists");
    expect(await neoCua(id)).toBe("recFX376b");
    await dongBo(dongHauKy("recFX376b", "b"));
    expect(await neoCua(id)).toBe("recFX376b");
    expect(await nhatKyLech(id)).toHaveLength(0);
  });

  it("bộ đã neo dòng KHÁC → không đổi, ghi nhật ký gallery.lark_dong_lech (một lần dù đồng bộ lặp)", async () => {
    const { rows } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count, lark_hauky_record_id)
       values ($1,$2,'Fixture BB-376 Bộ neo khác','draft',$3,'https://example.com/x',0,'recFX376goc') returning id`,
      [branchId, customerId, thuMuc("c")],
    );
    const id = rows[0].id as string;
    const kq = await dongBo(dongHauKy("recFX376moi", "c"));
    expect(kq.action).toBe("already_exists");
    expect(await neoCua(id)).toBe("recFX376goc");
    await dongBo(dongHauKy("recFX376moi", "c"));
    expect(await neoCua(id)).toBe("recFX376goc");
    const nk = await nhatKyLech(id);
    expect(nk).toHaveLength(1);
    expect(nk[0].metadata).toMatchObject({ dongDangNeo: "recFX376goc", dongLarkMoi: "recFX376moi", canNhanVienXacNhan: true });
  });

  it("neoBoAnhVaoDongHauKy không ném khi lỗi (bộ không tồn tại / mã rỗng)", async () => {
    expect(await neoBoAnhVaoDongHauKy(pg, { galleryId: "00000000-0000-0000-0000-000000000000", recordId: "recX" })).toBe("loi");
    expect(await neoBoAnhVaoDongHauKy(pg, { galleryId: "00000000-0000-0000-0000-000000000000", recordId: "" })).toBe("loi");
  });

  it("script điền bù: chạy thử không ghi; khớp duy nhất → neo; nhiều dòng → thu hẹp theo thư mục hoặc mơ hồ; không thấy → đếm", async () => {
    const ma = (n: number) => `HD_20261006#${so}${n}`;
    const tao = async (n: number, tieuDe: string) =>
      (
        await pg.query(
          `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count, lark_contract_code, lark_contract_codes)
           values ($1,$2,$3,'draft',$4,'https://example.com/x',0,$5,array[$5]) returning id`,
          [branchId, customerId, tieuDe, thuMuc(`s${n}`), ma(n)],
        )
      ).rows[0].id as string;
    const duy = await tao(1, "Fixture BB-376 Duy nhất");
    const thuHep = await tao(2, "Fixture BB-376 Thu hẹp");
    const moHo = await tao(3, "Fixture BB-376 Mơ hồ");
    const vang = await tao(4, "Fixture BB-376 Không thấy");
    const chung1 = await tao(5, "Fixture BB-376 Chung một");
    const chung2 = await tao(6, "Fixture BB-376 Chung hai");

    const du = (rec: string, folder = ""): DongHauKyKhop => ({ recordId: rec, linkAnh: folder ? `https://drive.google.com/drive/folders/${thuMuc(folder)}` : "" });
    const kho = new Map<string, DongHauKyKhop[]>([
      [ma(1), [du("recFX376s1")]],
      [ma(2), [du("recFX376s2x", "khac"), du("recFX376s2", "s2")]],
      [ma(3), [du("recFX376s3a"), du("recFX376s3b")]],
      [ma(5), [du("recFX376cm")]],
      [ma(6), [du("recFX376cm")]],
    ]);
    const docDongTheoMa = async (cacMa: string[]) => new Map(cacMa.map((m) => [m, kho.get(m) ?? []]));
    const chiBo = [duy, thuHep, moHo, vang, chung1, chung2];

    const thu = await dienBuNeoDongHauKy(pg, { docDongTheoMa, ghi: false, chiBo });
    expect(thu).toMatchObject({ boTrong: 6, seNeo: 2, khongThay: 1, daGhi: false });
    expect(thu.moHo.map((m) => m.lyDo).sort()).toEqual(["dong_chung_nhieu_bo", "dong_chung_nhieu_bo", "nhieu_dong"]);
    expect(await neoCua(duy)).toBeNull();

    const that = await dienBuNeoDongHauKy(pg, { docDongTheoMa, ghi: true, chiBo });
    expect(that.seNeo).toBe(2);
    expect(await neoCua(duy)).toBe("recFX376s1");
    expect(await neoCua(thuHep)).toBe("recFX376s2");
    for (const id of [moHo, vang, chung1, chung2]) expect(await neoCua(id)).toBeNull();

    // Chạy lại: bộ đã neo không bị đụng tới.
    const lai = await dienBuNeoDongHauKy(pg, { docDongTheoMa, ghi: true, chiBo });
    expect(lai.boTrong).toBe(4);
    expect(lai.seNeo).toBe(0);
    expect(await neoCua(duy)).toBe("recFX376s1");
  });
});
