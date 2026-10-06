/**
 * BB-369 (chủ studio 06/10/2026): Bàn làm việc "lúc hiện lúc không" với các dòng
 * "Bản ghi mới từ Lark". Muốn: việc xử lý xong thì biến mất, chưa xử lý thì luôn
 * còn đó.
 *
 * Bốn nguyên nhân, mỗi cái một ca:
 *   A. Đường hook Lark đọc dòng bằng API bản ghi thường → ô "Chi Nhánh" là mã
 *      lựa chọn (optXXX) → upsert ghi branch_id = null ĐÈ chi nhánh đã biết →
 *      dòng biến khỏi danh sách của nhân viên chi nhánh tới lượt đồng bộ sau.
 *      (Cơ sở dữ liệu thật, nền Fixture — cần đúng ngữ nghĩa `coalesce` của SQL.)
 *   B. Bộ ảnh đã tạo từ dòng (thuật sĩ) vẫn nằm trong khối tới lượt đồng bộ sau;
 *      dòng đã điền Trạng Thái bên Lark thì nằm lì mãi.
 *   C. Trần 50 dòng đọc mỗi lượt cắt trên thứ tự search không cố định.
 *   D. Một tab "Việc cần xử lý" tải hỏng thì số của nó rơi về 0 rồi hiện lại.
 *
 * Không gọi Lark thật: C giả `fetch` ở biên giới mạng.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { Client } from "pg";
import { dungNenFixture, donNenFixture } from "../fixtures/nen-fixture";
import {
  ghiBanGhiMoi,
  docDanhSachBanGhiMoi,
  dongBoBanGhiMoi,
  taoNguonLark,
  tenChiNhanhLark,
  TRAN_DOC_MOI_LUOT,
  type NguonLark,
} from "@/lib/lark/ban-ghi-moi";
import type { LarkRecord } from "@/lib/lark/sync-retouch";
import { demViecCanXuLy } from "@/lib/utils/viec-can-xu-ly-tabs";

const DB_TEN_GIA = "postgresql://u:p@db.fixture-bb369.supabase.co:5432/postgres";

function dongLark(id: string, chiNhanh: unknown, o: { tt?: string; linkApp?: string } = {}): LarkRecord {
  const f: Record<string, unknown> = {
    "Tên KH": [{ text: "Fixture BB-369 Mẹ", type: "text" }],
    "SDT KH": [{ text: "0901000001", type: "text" }],
    "Gói chụp": [{ text: "Baby 02", type: "text" }],
    "HĐ Tổng": [{ text: `HD_20261006#${id.slice(-4)}`, type: "text" }],
    "Chi Nhánh": chiNhanh,
  };
  if (o.tt) f["Trạng Thái"] = o.tt;
  if (o.linkApp) f["Link app"] = { link: o.linkApp, text: o.linkApp };
  return { record_id: id, fields: f };
}

describe("BB-369 A+B: danh sách ổn định trên cơ sở dữ liệu (nền Fixture)", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let maChiNhanh = "";
  let galleryId = "";
  const ids: string[] = [];

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const nen = await dungNenFixture(pg, "BB-369");
    branchId = nen.branchId;
    customerId = nen.customerId;
    const { rows } = await pg.query(`select code from branches where id = $1`, [branchId]);
    maChiNhanh = rows[0].code;
    for (let i = 0; i < 3; i++) ids.push(`recFixtureBB369${nen.runId}${i}`);
  });

  afterAll(async () => {
    try {
      await pg.query(`delete from lark_ban_ghi_moi where lark_record_id = any($1::text[])`, [ids]);
      const { rows } = await pg.query(`select count(*)::int n from lark_ban_ghi_moi where lark_record_id = any($1::text[])`, [ids]);
      expect(rows[0].n).toBe(0);
      await donNenFixture(pg, { galleryIds: [galleryId], customerIds: [customerId], branchIds: [branchId] });
    } finally {
      await pg.end();
    }
  });

  const branches = () => [{ id: branchId, code: maChiNhanh, name: `Fixture BB-369 Chi nhánh` }];
  const nhanVienChiNhanh = () => ({ toanQuyen: false, branchIds: [branchId] });

  it("A: lượt đồng bộ biết chi nhánh; hook ghi lại dòng với Chi Nhánh = optXXX → dòng VẪN thuộc chi nhánh", async () => {
    // Lượt đồng bộ (API search trả TÊN chi nhánh).
    expect(await ghiBanGhiMoi(pg, dongLark(ids[0]!, maChiNhanh), branches(), DB_TEN_GIA)).toBe("moi");
    const truoc = await docDanhSachBanGhiMoi(pg, nhanVienChiNhanh());
    expect(truoc.map((d) => d.recordId)).toEqual([ids[0]]);
    expect(truoc[0]!.chiNhanh).toBe(maChiNhanh);

    // Đường hook (API bản ghi thường trả MÃ lựa chọn).
    expect(await ghiBanGhiMoi(pg, dongLark(ids[0]!, ["optAbC123xyz"]), branches(), DB_TEN_GIA)).toBe("cap_nhat");
    const sau = await docDanhSachBanGhiMoi(pg, nhanVienChiNhanh());
    expect(sau.map((d) => d.recordId)).toEqual([ids[0]]);
    expect(sau[0]!.chiNhanh).toBe(maChiNhanh);
  });

  it("B: hai lần tải liên tiếp ra CÙNG danh sách; bộ ảnh vừa tạo từ dòng → dòng rời khối ngay", async () => {
    // Cùng một mốc `thay_luc` cho cả ba — thứ tự phải vẫn cố định (khoá phụ).
    const moc = new Date("2026-10-06T05:00:00Z");
    for (const id of ids.slice(1)) await ghiBanGhiMoi(pg, dongLark(id, maChiNhanh), branches(), DB_TEN_GIA, moc);
    await pg.query(`update lark_ban_ghi_moi set thay_luc = $2 where lark_record_id = any($1::text[])`, [ids, moc]);

    const lan1 = await docDanhSachBanGhiMoi(pg, nhanVienChiNhanh());
    const lan2 = await docDanhSachBanGhiMoi(pg, nhanVienChiNhanh());
    expect(lan1.map((d) => d.recordId)).toEqual([...ids].sort());
    expect(lan2).toEqual(lan1);

    // Nhân viên tạo bộ ảnh từ dòng ids[1] (thuật sĩ neo lark_hauky_record_id).
    const { rows } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count, lark_hauky_record_id)
       values ($1,$2,'Fixture BB-369 Bộ ảnh','draft','SEED_FOLDER_ID_BB369','https://example.com/x',0,$3) returning id`,
      [branchId, customerId, ids[1]],
    );
    galleryId = rows[0].id;
    const lan3 = await docDanhSachBanGhiMoi(pg, nhanVienChiNhanh());
    expect(lan3.map((d) => d.recordId)).toEqual([ids[0], ids[2]].sort());
  });
});

// ---------------------------------------------------------------------------
// B (đồng bộ): pg giả — dongBoBanGhiMoi chạm MỌI dòng của bảng, không chạy trên bb-dev.
// ---------------------------------------------------------------------------
function taoDbGia() {
  const banGhi = new Map<string, { lark_record_id: string; gallery_id: string | null }>();
  const client = {
    async query(sql: string, p: unknown[] = []) {
      if (/from branches/.test(sql)) return { rows: [{ id: "b1", code: "BB-NTB", name: "Baby Bean NTB" }], rowCount: 1 };
      if (/insert into lark_ban_ghi_moi/.test(sql)) {
        const moi = !banGhi.has(p[0] as string);
        if (moi) banGhi.set(p[0] as string, { lark_record_id: p[0] as string, gallery_id: null });
        return { rows: [{ moi }], rowCount: 1 };
      }
      if (/update lark_ban_ghi_moi b set gallery_id/.test(sql)) return { rows: [], rowCount: 0 };
      if (/select lark_record_id from lark_ban_ghi_moi where gallery_id is null/.test(sql)) {
        const rows = [...banGhi.values()].filter((b) => !b.gallery_id);
        return { rows, rowCount: rows.length };
      }
      if (/delete from lark_ban_ghi_moi where gallery_id is null/.test(sql)) {
        let n = 0;
        for (const id of p[0] as string[]) if (banGhi.delete(id)) n++;
        return { rows: [], rowCount: n };
      }
      if (/select lark_record_id, gallery_id from lark_ban_ghi_moi/.test(sql)) return { rows: [...banGhi.values()], rowCount: banGhi.size };
      if (/delete from lark_ban_ghi_moi/.test(sql)) return { rows: [], rowCount: 0 };
      if (/from galleries g/.test(sql)) return { rows: [], rowCount: 0 };
      throw new Error(`pg giả không biết câu lệnh: ${sql.slice(0, 60)}`);
    },
  };
  return { client: client as never, banGhi };
}

function nguon(dong: LarkRecord[], tatCaMa = dong.map((d) => d.record_id)): NguonLark {
  return {
    async docTrangThaiTrong() {
      return { dong, tatCaMa };
    },
    async timDongDaXoa() {
      return new Set<string>();
    },
  };
}

describe("BB-369 B: việc xong bên Lark thì rời khối, chưa xong thì còn", () => {
  it("dòng đã điền Trạng Thái bên Lark (không còn trong search) và dòng đã có Link app → rời khối; dòng còn lại giữ nguyên", async () => {
    const db = taoDbGia();
    await dongBoBanGhiMoi({
      client: db.client,
      nguon: nguon([dongLark("recA", "NTB"), dongLark("recB", "NTB"), dongLark("recC", "NTB")]),
      dbUrl: DB_TEN_GIA,
    });
    expect([...db.banGhi.keys()].sort()).toEqual(["recA", "recB", "recC"]);

    // Bên Lark: recA điền Trạng Thái (search không còn trả), recB dán Link app.
    const kq = await dongBoBanGhiMoi({
      client: db.client,
      nguon: nguon([dongLark("recB", "NTB", { linkApp: "https://hauky.babybeanstudio.vn/k/FIXTURE" }), dongLark("recC", "NTB")], [
        "recB",
        "recC",
      ]),
      dbUrl: DB_TEN_GIA,
    });
    expect(kq.daXuLyBenLark).toBe(2);
    expect([...db.banGhi.keys()]).toEqual(["recC"]);

    // Lượt sau Lark không đổi gì → danh sách y nguyên (không chập chờn).
    await dongBoBanGhiMoi({ client: db.client, nguon: nguon([dongLark("recC", "NTB")]), dbUrl: DB_TEN_GIA });
    expect([...db.banGhi.keys()]).toEqual(["recC"]);
  });

  it("dòng chưa đọc chi tiết vì trần 50 nhưng vẫn còn Trạng Thái trống → KHÔNG bị gỡ", async () => {
    const db = taoDbGia();
    await dongBoBanGhiMoi({ client: db.client, nguon: nguon([dongLark("recCu", "NTB")]), dbUrl: DB_TEN_GIA });
    await dongBoBanGhiMoi({ client: db.client, nguon: nguon([], ["recCu"]), dbUrl: DB_TEN_GIA });
    expect([...db.banGhi.keys()]).toEqual(["recCu"]);
  });

  it("tenChiNhanhLark: tên giữ, mã lựa chọn bỏ", () => {
    expect(tenChiNhanhLark("Thảo Điền")).toBe("Thảo Điền");
    expect(tenChiNhanhLark([{ text: "NTB" }])).toBe("NTB");
    expect(tenChiNhanhLark(["optAbC123xyz"])).toBe("");
    expect(tenChiNhanhLark({ type: 3, value: ["optZZ99"] })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// C: taoNguonLark — fetch giả ở biên giới mạng.
// ---------------------------------------------------------------------------
describe("BB-369 C: trần 50 đọc CÙNG một nhóm mỗi lượt (mới nhất trước)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU;
  });

  async function chayMotLuot(thuTuSearch: number[]) {
    const docChiTiet: string[] = [];
    const fetchGia = vi.fn(async (url: string) => {
      const u = String(url);
      const json = (data: unknown) => new Response(JSON.stringify({ code: 0, data, tenant_access_token: "t-fixture" }));
      if (u.includes("tenant_access_token")) return json({});
      if (u.endsWith("/tables?page_size=100")) return json({ items: [{ table_id: "tblFX", name: "Hậu Kỳ" }] });
      if (u.includes("/records/search")) {
        return json({
          items: thuTuSearch.map((i) => ({ record_id: `recFX${String(i).padStart(3, "0")}`, created_time: 1_700_000_000_000 + i * 1000 })),
          has_more: false,
        });
      }
      const m = u.match(/\/records\/(recFX\d+)$/);
      if (m) {
        docChiTiet.push(m[1]!);
        return json({ record: { record_id: m[1], fields: {} } });
      }
      throw new Error(`fetch giả không biết: ${u}`);
    });
    vi.stubGlobal("fetch", fetchGia);
    process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";
    const n = await taoNguonLark({ appId: "fx", appSecret: "fx", baseToken: "fxBase" });
    const kq = await n.docTrangThaiTrong();
    return { docChiTiet, kq };
  }

  it("search trả 60 dòng theo hai thứ tự khác nhau → hai lượt đọc cùng 50 dòng mới nhất; tatCaMa đủ 60", async () => {
    const xuoi = Array.from({ length: 60 }, (_, i) => i);
    const tron = [...xuoi].sort((a, b) => ((a * 37) % 61) - ((b * 37) % 61));
    const l1 = await chayMotLuot(xuoi);
    const l2 = await chayMotLuot(tron);
    expect(l1.docChiTiet).toHaveLength(TRAN_DOC_MOI_LUOT);
    expect(l2.docChiTiet).toEqual(l1.docChiTiet);
    expect(l1.docChiTiet[0]).toBe("recFX059"); // mới nhất trước
    expect(l1.kq.tatCaMa).toHaveLength(60);
  });
});

// ---------------------------------------------------------------------------
// D: đếm "Việc cần xử lý" — tab hỏng giữ số lượt trước.
// ---------------------------------------------------------------------------
describe("BB-369 D: tab tải hỏng không làm việc biến mất", () => {
  const traLoi = (data: unknown, ok = true) =>
    new Response(JSON.stringify(ok ? { data } : { error: { message: "hỏng" } }), { status: ok ? 200 : 500 });

  function goiGia(hong: Set<string>) {
    return async (url: string) => {
      if (hong.has(url)) return traLoi(null, false);
      if (url.includes("over-quota")) return traLoi({ items: [1, 2] });
      if (url.includes("dot-chon-cho-xac-nhan")) return traLoi({ boAnh: [1, 2, 3] });
      if (url.includes("loi-dong-bo")) return traLoi({ summary: { galleryCount: 0 } });
      return traLoi({ items: [] });
    };
  }

  it("lượt 2: route 'Ảnh vượt hạn mức' trả 500 → vẫn 2 việc, tổng không đổi", async () => {
    const l1 = await demViecCanXuLy("admin", goiGia(new Set()));
    expect(l1?.tong).toBe(5);
    const l2 = await demViecCanXuLy("admin", goiGia(new Set(["/api/admin/reports/over-quota"])), l1);
    expect(l2?.theoTab["over-quota"]).toBe(2);
    expect(l2?.tong).toBe(5);
    expect(l2?.dong.map((d) => d.tab)).toEqual(l1?.dong.map((d) => d.tab));
  });

  it("việc đã xử lý (route trả ít hơn) thì số giảm thật", async () => {
    const l1 = await demViecCanXuLy("admin", goiGia(new Set()));
    const l2 = await demViecCanXuLy(
      "admin",
      async (url: string) => (url.includes("over-quota") ? traLoi({ items: [] }) : goiGia(new Set())(url)),
      l1,
    );
    expect(l2?.theoTab["over-quota"]).toBe(0);
    expect(l2?.tong).toBe(3);
  });
});
