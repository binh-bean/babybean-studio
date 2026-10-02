// BB-352 (CV-01) — phép kiểm cấu trúc của `verify:db` cho dãy 0052–0085 phải ĐỎ
// được khi cơ sở dữ liệu thiếu một thứ nó đòi.
//
// Vì sao cần: vòng 7 (01/10/2026) đo `verify:db` xanh 17/17 trên một cơ sở dữ liệu
// thiếu cả dãy 0077–0085. Một cổng chưa từng được thấy đỏ thì không ai biết nó đỏ
// được. Ở đây dựng một cơ sở dữ liệu GIẢ (chỉ giả lập biên giới: `client.query`
// trả hàng như information_schema/pg_proc/pg_tables sẽ trả, và `fetch` trả mã
// HTTP) rồi RÚT từng bảng / từng cột / từng hàm ra, đòi cổng đỏ đúng chỗ đó.
// Logic của cổng (so danh sách với những gì cơ sở dữ liệu trả) chạy thật.
//
// KHÔNG kết nối cơ sở dữ liệu nào, và dĩ nhiên không chạm bb-prod.

import { describe, it, expect } from "vitest";
import {
  kiemDayMigrationMoi,
  BANG_DAY_MOI,
  COT_DAY_MOI,
  HAM_DAY_MOI,
} from "../../scripts/lib/kiem-cau-truc-day-moi.mjs";

interface KetQuaKiem {
  name: string;
  pass: boolean;
  detail: string;
}

interface TrangThaiDb {
  bang: Map<string, { rowsecurity: boolean }>;
  cot: Set<string>; // "bang.cot"
  ham: Map<string, number>; // tên -> số tham số
  quyenAnon: Map<string, string[]>; // bảng -> quyền anon đang có
  restMo: Set<string>; // bảng mà REST với khoá anon trả 200
}

/** Một cơ sở dữ liệu ĐỦ MỌI THỨ cổng đòi, xanh toàn bộ. */
function dbDay(): TrangThaiDb {
  const cot = new Set<string>();
  for (const [b, cs] of Object.entries(COT_DAY_MOI as Record<string, string[]>)) for (const c of cs) cot.add(`${b}.${c}`);
  return {
    bang: new Map((BANG_DAY_MOI as string[]).map((t) => [t, { rowsecurity: true }])),
    cot,
    ham: new Map(Object.entries(HAM_DAY_MOI as Record<string, number>)),
    quyenAnon: new Map(),
    restMo: new Set(),
  };
}

function chay(db: TrangThaiDb, tuyChon: Record<string, unknown> = {}): Promise<KetQuaKiem[]> {
  const client = {
    async query(sql: string, params: unknown[] = []) {
      const dsTen = (params[0] ?? []) as string[];
      if (/has_table_privilege/.test(sql)) {
        const rows = [...db.bang.keys()]
          .filter((t) => dsTen.includes(t))
          .map((t) => ({ tablename: t, quyen: db.quyenAnon.get(t) ?? [] }));
        return { rows, rowCount: rows.length };
      }
      if (/information_schema\.columns/.test(sql)) {
        const rows = [...db.cot]
          .map((k) => ({ table_name: k.split(".")[0]!, column_name: k.split(".")[1]! }))
          .filter((r) => dsTen.includes(r.table_name));
        return { rows, rowCount: rows.length };
      }
      if (/from pg_proc/.test(sql)) {
        const rows = [...db.ham.entries()]
          .filter(([f]) => dsTen.includes(f))
          .map(([proname, so_tham_so]) => ({ proname, so_tham_so }));
        return { rows, rowCount: rows.length };
      }
      throw new Error(`Câu lệnh không lường trước: ${sql.slice(0, 60)}`);
    },
  };
  const tables = [...db.bang.entries()].map(([tablename, v]) => ({ tablename, rowsecurity: v.rowsecurity }));
  const fetchFn = (async (url: string) => {
    const ten = /\/rest\/v1\/([a-z_0-9]+)\?/.exec(url)?.[1] ?? "";
    return { status: db.restMo.has(ten) ? 200 : 401 };
  }) as unknown as typeof fetch;
  return kiemDayMigrationMoi({
    client,
    tables,
    apiUrl: "https://gia.supabase.test",
    publishableKey: "khoa-gia",
    fetchFn,
    ...tuyChon,
  });
}

const doKet = (kq: KetQuaKiem[]) => kq.filter((r) => !r.pass);

describe("kiemDayMigrationMoi — cơ sở dữ liệu đủ thì xanh", () => {
  it("sáu phép kiểm, cả sáu đạt", async () => {
    const kq = await chay(dbDay());
    expect(kq).toHaveLength(6);
    expect(doKet(kq)).toEqual([]);
  });
});

describe("kiemDayMigrationMoi — RÚT MỘT BẢNG khỏi cơ sở dữ liệu thì phải ĐỎ, nêu đích danh bảng", () => {
  it.each(BANG_DAY_MOI as string[])("thiếu bảng %s", async (bang) => {
    const db = dbDay();
    db.bang.delete(bang);
    const hong = doKet(await chay(db));
    const phepKiemBang = hong.find((r) => /bảng của 0052–0083 tồn tại/.test(r.name));
    expect(phepKiemBang, `cổng KHÔNG đỏ khi thiếu bảng ${bang}`).toBeDefined();
    expect(phepKiemBang!.detail).toContain(bang);
  });
});

describe("kiemDayMigrationMoi — RÚT MỘT CỘT thì phải ĐỎ, nêu đích danh cột", () => {
  const moiCot = Object.entries(COT_DAY_MOI as Record<string, string[]>).flatMap(([b, cs]) => cs.map((c) => `${b}.${c}`));
  it.each(moiCot)("thiếu cột %s", async (khoa) => {
    const db = dbDay();
    db.cot.delete(khoa);
    const hong = doKet(await chay(db));
    const phep = hong.find((r) => /cột mới của 0077–0083 tồn tại/.test(r.name));
    expect(phep, `cổng KHÔNG đỏ khi thiếu cột ${khoa}`).toBeDefined();
    expect(phep!.detail).toContain(khoa);
  });

  it("cột galleries.lark_photo (0081) nằm trong danh sách canh", () => {
    expect(moiCot).toContain("galleries.lark_photo");
  });
});

describe("kiemDayMigrationMoi — hàm viết lại sai chữ ký hoặc mất thì ĐỎ", () => {
  it.each(Object.keys(HAM_DAY_MOI as Record<string, number>))("mất hàm %s", async (ham) => {
    const db = dbDay();
    db.ham.delete(ham);
    const hong = doKet(await chay(db));
    expect(hong.find((r) => /Hàm viết lại/.test(r.name))?.detail).toContain(ham);
  });

  it.each(Object.entries(HAM_DAY_MOI as Record<string, number>))(
    "hàm %s còn bản CŨ (ít tham số hơn %i) — migration chưa áp",
    async (ham, soDung) => {
      const db = dbDay();
      db.ham.set(ham, soDung - 1);
      const hong = doKet(await chay(db));
      const phep = hong.find((r) => /Hàm viết lại/.test(r.name));
      expect(phep?.detail).toContain(ham);
      expect(phep?.detail).toContain(`thấy ${soDung - 1}`);
    },
  );
});

describe("kiemDayMigrationMoi — bảng mới mà an ninh hở thì ĐỎ", () => {
  it("RLS tắt trên một bảng mới", async () => {
    const db = dbDay();
    db.bang.set("tim_gia_dinh", { rowsecurity: false });
    const hong = doKet(await chay(db));
    const phep = hong.find((r) => r.name === "Bảng mới: RLS bật");
    expect(phep?.detail).toContain("tim_gia_dinh");
  });

  it("anon có quyền SELECT trên một bảng mới", async () => {
    const db = dbDay();
    db.quyenAnon.set("lark_ban_ghi_moi", ["SELECT"]);
    const hong = doKet(await chay(db));
    const phep = hong.find((r) => /anon không có quyền nào/.test(r.name));
    expect(phep?.detail).toContain("lark_ban_ghi_moi(SELECT)");
  });

  it("khoá công khai đọc được một bảng mới qua REST (HTTP 200)", async () => {
    const db = dbDay();
    db.restMo.add("share_link_ma");
    const hong = doKet(await chay(db));
    const phep = hong.find((r) => /khoá publishable không đọc được/.test(r.name));
    expect(phep?.detail).toContain("share_link_ma");
  });
});

describe("kiemDayMigrationMoi — danh sách canh không được rỗng đi cho xanh", () => {
  it("danh sách mặc định gồm đủ chín bảng chưa phân loại của vòng 7 và các bảng 0077–0083", () => {
    const bat = [
      "album_covers", "lark_ban_ghi_moi", "lark_nhac_da_gui", "push_dang_ky", "selection_addon_photos",
      "share_link_ma", "thong_bao_khach", "tim_gia_dinh", "yeu_cau_mua_them",
      "schema_migrations", "selection_rounds",
    ];
    for (const b of bat) expect(BANG_DAY_MOI as string[], b).toContain(b);
  });

  it("đòi thêm một bảng chưa có trong cơ sở dữ liệu thì đỏ (danh sách thật sự được dùng)", async () => {
    const hong = doKet(await chay(dbDay(), { bang: [...(BANG_DAY_MOI as string[]), "bang_se_co_o_0086"] }));
    expect(hong.find((r) => /tồn tại/.test(r.name))?.detail).toContain("bang_se_co_o_0086");
  });

  it("cơ sở dữ liệu TRỐNG (chưa áp dãy nào) đỏ ở cả bốn phép kiểm cấu trúc", async () => {
    const trong: TrangThaiDb = { bang: new Map(), cot: new Set(), ham: new Map(), quyenAnon: new Map(), restMo: new Set() };
    const hong = doKet(await chay(trong));
    const ten = hong.map((r) => r.name).join(" | ");
    expect(ten).toMatch(/bảng của 0052–0083 tồn tại/);
    expect(ten).toMatch(/Bảng mới: RLS bật/);
    expect(ten).toMatch(/cột mới của 0077–0083 tồn tại/);
    expect(ten).toMatch(/Hàm viết lại/);
  });
});
