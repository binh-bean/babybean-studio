// BB-352 — `db:nap-lai --xoa` không được xoá `schema_migrations`, mọi bảng phải
// được phân loại, và gặp bảng chưa phân loại thì công cụ phải DỪNG.
//
// Chỉ phép thử đơn vị: KHÔNG kết nối cơ sở dữ liệu nào (bb-dev là dữ liệu thật,
// AGENTS.md §6). Phân loại, luật dừng và lớp chốt cuối của xoaSachGiaoDich đều
// là logic thuần hoặc đi qua một client pg giả — chạy thật, không giả lập logic.
//
// Phép thử "mọi bảng trong db/migrations đã có tên trong PHAN_LOAI_BANG" đọc TÊN
// BẢNG từ các tệp SQL (dữ liệu schema, không phải mã nguồn của một thành phần):
// đây là cái chặn "thêm bảng 0086 mà quên phân loại" ngay ở \`npm test\`, trước
// khi nó tới được một lượt --xoa thật.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PHAN_LOAI_BANG,
  BANG_GIU_NGUYEN,
  THU_TU_XOA,
  phanLoaiBang,
  lyDoDungVoiBangLa,
  kiemTraPhanLoaiNhatQuan,
  bangCamXoa,
  xoaSachGiaoDich,
  kiemTraThuTuAnToan,
  GOC_REPO,
} from "../../scripts/nap-lai-tu-lark.mjs";

/** Chín bảng chưa phân loại mà vòng 7 (soát C, 01/10/2026) đo được trên bb-dev. */
const CHIN_BANG_MOI = [
  "album_covers",
  "lark_ban_ghi_moi",
  "lark_nhac_da_gui",
  "push_dang_ky",
  "selection_addon_photos",
  "share_link_ma",
  "thong_bao_khach",
  "tim_gia_dinh",
  "yeu_cau_mua_them",
] as const;

/** Một cơ sở dữ liệu giả định có đủ mọi bảng đã phân loại (độ phủ thật được kiểm ở ca quét db/*.sql bên dưới). */
const MOI_BANG_THAT = [
  ...Object.keys(PHAN_LOAI_BANG),
] as string[];

function clientGia(tenBang: string[]) {
  const lenh: string[] = [];
  return {
    lenh,
    async query(sql: string) {
      lenh.push(sql.trim().split("\n")[0]!.trim());
      if (/^delete from/i.test(sql)) return { rowCount: 1 };
      return { rows: [] };
    },
    tenBang,
  };
}

describe("BB-352 — schema_migrations không bao giờ bị xoá", () => {
  it("schema_migrations nằm trong BANG_GIU_NGUYEN", () => {
    expect(BANG_GIU_NGUYEN).toContain("schema_migrations");
  });

  it("phanLoaiBang xếp schema_migrations vào GIỮ, không vào xoá", () => {
    const kq = phanLoaiBang(["schema_migrations", "customers", "settings"]);
    expect(kq.giu).toContain("schema_migrations");
    expect(kq.xoa).not.toContain("schema_migrations");
    expect(kq.chuaPhanLoai).toEqual([]);
  });

  it("lớp chốt cuối: xoaSachGiaoDich từ chối danh sách có schema_migrations, TRƯỚC khi chạm một dòng", async () => {
    const client = clientGia([]);
    await expect(xoaSachGiaoDich(client, ["customers", "schema_migrations"])).rejects.toThrow(
      /schema_migrations/,
    );
    // Không có cả "begin": từ chối xảy ra trước giao dịch.
    expect(client.lenh).toEqual([]);
  });

  it("lớp chốt cuối cũng chặn mọi bảng nhóm GIỮ (vd settings), không chỉ schema_migrations", async () => {
    const client = clientGia([]);
    await expect(xoaSachGiaoDich(client, ["settings"])).rejects.toThrow(/settings/);
    expect(client.lenh).toEqual([]);
    expect(bangCamXoa(["customers", "roles", "schema_migrations"]).sort()).toEqual(["roles", "schema_migrations"]);
  });

  it("chạy xoá thật trên toàn bộ THU_TU_XOA: không có lệnh delete nào nhắm schema_migrations", async () => {
    const client = clientGia([]);
    await xoaSachGiaoDich(client, THU_TU_XOA);
    expect(client.lenh.some((l) => /schema_migrations/.test(l))).toBe(false);
    expect(client.lenh.filter((l) => /^delete from/i.test(l))).toHaveLength(THU_TU_XOA.length);
  });
});

describe("BB-352 — chín bảng mới đã có phân loại", () => {
  it.each(CHIN_BANG_MOI)("%s có trong PHAN_LOAI_BANG, kèm lý do", (bang) => {
    const p = PHAN_LOAI_BANG[bang];
    expect(p, `${bang} chưa được phân loại`).toBeDefined();
    expect(p!.lyDo.trim().length).toBeGreaterThan(10);
  });

  it("lark_ban_ghi_moi là bản sao của Lark nên thuộc nhóm nạp lại; tám bảng còn lại là dữ liệu thử", () => {
    expect(PHAN_LOAI_BANG.lark_ban_ghi_moi!.nhom).toBe("nap-lai-tu-lark");
    for (const b of CHIN_BANG_MOI.filter((x) => x !== "lark_ban_ghi_moi")) {
      expect(PHAN_LOAI_BANG[b]!.nhom, b).toBe("xoa-du-lieu-thu");
    }
  });

  it("một cơ sở dữ liệu có đủ mọi bảng: không bảng nào chưa phân loại, không bảng nào thiếu thứ tự xoá", () => {
    const kq = phanLoaiBang(MOI_BANG_THAT);
    expect(kq.chuaPhanLoai).toEqual([]);
    expect(kq.thieuThuTu).toEqual([]);
    expect(lyDoDungVoiBangLa(kq)).toEqual([]);
    // Ba nhóm cộng lại phủ đúng mọi bảng, không bảng nào vừa giữ vừa xoá.
    expect(kq.giu.length + kq.xoa.length).toBe(MOI_BANG_THAT.length);
    expect(kq.napLaiTuLark.length + kq.xoaDuLieuThu.length).toBe(kq.xoa.length);
  });

  it("bảng phân loại khớp THU_TU_XOA (không trùng, không thiếu, không bảng giữ nằm trong thứ tự xoá)", () => {
    const { nhatQuan, loi } = kiemTraPhanLoaiNhatQuan();
    expect(loi).toEqual([]);
    expect(nhatQuan).toBe(true);
  });

  it("thứ tự xoá đặt yeu_cau_mua_them TRƯỚC products (khoá ngoại bắt buộc, không cascade)", () => {
    const iYc = THU_TU_XOA.indexOf("yeu_cau_mua_them");
    const iSp = THU_TU_XOA.indexOf("products");
    expect(iYc).toBeGreaterThan(-1);
    expect(iYc).toBeLessThan(iSp);
    // và kiemTraThuTuAnToan bắt đúng lỗi này nếu thứ tự bị đảo
    const kq = kiemTraThuTuAnToan(["products", "yeu_cau_mua_them"], [
      { tu: "yeu_cau_mua_them", den: "products", batBuoc: true },
    ]);
    expect(kq.anToan).toBe(false);
  });

  it("MỌI bảng tạo trong db/schema.sql và db/migrations/*.sql đều đã được phân loại", () => {
    const thuMucDb = path.join(GOC_REPO, "db");
    const tep = [
      path.join(thuMucDb, "schema.sql"),
      ...fs
        .readdirSync(path.join(thuMucDb, "migrations"))
        .filter((f) => f.endsWith(".sql"))
        .map((f) => path.join(thuMucDb, "migrations", f)),
    ];
    const ten = new Set<string>();
    for (const t of tep) {
      const sql = fs
        .readFileSync(t, "utf8")
        // bỏ chú thích -- để "create table ... (" trong lời giải thích không bị đếm
        .split("\n")
        .filter((d) => !d.trim().startsWith("--"))
        .join("\n");
      for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?\s*\(/gi)) {
        ten.add(m[1]!.toLowerCase());
      }
    }
    // Chắc rằng bộ quét thật sự thấy bảng (không im lặng quét ra rỗng).
    expect(ten.size).toBeGreaterThan(30);
    for (const b of CHIN_BANG_MOI) expect(ten.has(b), `bộ quét không thấy ${b}`).toBe(true);
    expect(ten.has("schema_migrations")).toBe(true);

    const chuaCo = [...ten].filter((b) => !PHAN_LOAI_BANG[b]).sort();
    expect(chuaCo, `bảng mới chưa phân loại trong scripts/nap-lai-tu-lark.mjs: ${chuaCo.join(", ")}`).toEqual([]);
  });
});

describe("BB-352 — gặp bảng chưa phân loại thì DỪNG", () => {
  it("bảng lạ KHÔNG còn tự rơi vào diện xoá: nằm riêng ở chuaPhanLoai", () => {
    const kq = phanLoaiBang([...MOI_BANG_THAT, "mot_bang_moi_2027"]);
    expect(kq.chuaPhanLoai).toEqual(["mot_bang_moi_2027"]);
    expect(kq.xoa).not.toContain("mot_bang_moi_2027");
    expect(kq.giu).not.toContain("mot_bang_moi_2027");
  });

  it("lyDoDungVoiBangLa trả lý do (khác rỗng) và nêu đích danh tên bảng", () => {
    const kq = phanLoaiBang([...MOI_BANG_THAT, "mot_bang_moi_2027", "bang_la_khac"]);
    const lyDo = lyDoDungVoiBangLa(kq);
    expect(lyDo.length).toBeGreaterThan(0);
    expect(lyDo.join(" ")).toContain("mot_bang_moi_2027");
    expect(lyDo.join(" ")).toContain("bang_la_khac");
    expect(lyDo.join(" ")).toMatch(/PHAN_LOAI_BANG/);
  });

  it("bảng đã phân loại là xoá mà quên THU_TU_XOA cũng phải dừng", () => {
    const phanLoai = { ...PHAN_LOAI_BANG, bang_thu_nghiem: { nhom: "xoa-du-lieu-thu" as const, lyDo: "bảng thử nghiệm của phép thử" } };
    const kq = phanLoaiBang([...MOI_BANG_THAT, "bang_thu_nghiem"], phanLoai as never, THU_TU_XOA);
    expect(kq.thieuThuTu).toEqual(["bang_thu_nghiem"]);
    expect(lyDoDungVoiBangLa(kq).join(" ")).toContain("THU_TU_XOA");
  });

  it("kiemTraPhanLoaiNhatQuan bắt: bảng xoá thiếu trong thứ tự, bảng giữ nằm trong thứ tự xoá, thiếu lý do", () => {
    const phanLoai = {
      a: { nhom: "xoa-du-lieu-thu", lyDo: "dữ liệu thử" },
      b: { nhom: "giu", lyDo: "cấu hình" },
      c: { nhom: "nap-lai-tu-lark", lyDo: "" },
    } as never;
    const kq = kiemTraPhanLoaiNhatQuan(phanLoai, ["b", "c", "c"]);
    expect(kq.nhatQuan).toBe(false);
    const gop = kq.loi.join(" | ");
    expect(gop).toMatch(/a là bảng xoá nhưng thiếu trong THU_TU_XOA/);
    expect(gop).toMatch(/b thuộc nhóm GIỮ mà lại nằm trong THU_TU_XOA/);
    expect(gop).toMatch(/c: thiếu lý do/);
    expect(gop).toMatch(/c xuất hiện 2 lần/);
  });
});
