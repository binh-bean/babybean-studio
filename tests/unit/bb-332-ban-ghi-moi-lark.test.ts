/**
 * BB-332 — "Bản ghi mới từ Lark": luật chọn dòng, và luật "Lark xoá dòng thì
 * app xoá theo, nhưng cẩn thận".
 *
 * Lark giả (NguonLark truyền vào) và pg giả trong bộ nhớ: bảng lark_ban_ghi_moi
 * đến từ migration 0079 chưa áp, và phép thử không được ghi vào bb-dev hay gọi
 * Lark thật. pg giả mô phỏng đúng các câu lệnh ban-ghi-moi.ts gửi đi.
 */
import { describe, it, expect } from "vitest";
import {
  laBanGhiMoi,
  bocBanGhiMoi,
  khiLarkXoaDong,
  dongBoBanGhiMoi,
  xuLyBoAnhMatDongLark,
  khopChiNhanh,
  TRAN_XOA_MOI_LUOT,
  type NguonLark,
} from "@/lib/lark/ban-ghi-moi";
import type { LarkRecord } from "@/lib/lark/sync-retouch";

const DB_TEN_GIA = "postgresql://u:p@db.fixture-bb332.supabase.co:5432/postgres";

function dong(
  id: string,
  o: Partial<{ ten: string; sdt: string; goi: string; tt: string; drive: string; linkApp: unknown }> = {},
): LarkRecord {
  const f: Record<string, unknown> = {
    "Tên KH": [{ text: o.ten ?? "Fixture BB-332 Mai", type: "text" }],
    "SDT KH": [{ text: o.sdt ?? "0901000001", type: "text" }],
    "Gói chụp": [{ text: o.goi ?? "Fam 04", type: "text" }],
    "HĐ Tổng": [{ text: "HD_20260930#01", type: "text" }],
    "Chi Nhánh": [{ text: "Quận 1", type: "text" }],
  };
  if (o.tt) f["Trạng Thái"] = o.tt;
  if (o.drive) f["Link ảnh gửi khách"] = { link: o.drive, text: "FB Mẹ Mai (Bé Na)" };
  if (o.linkApp !== undefined) f["Link app"] = o.linkApp;
  if (o.ten === "") delete f["Tên KH"];
  if (o.sdt === "") delete f["SDT KH"];
  if (o.goi === "") delete f["Gói chụp"];
  return { record_id: id, fields: f };
}

describe("BB-332: luật bản ghi mới", () => {
  it("đủ tên + SĐT + gói và Trạng Thái trống → là bản ghi mới", () => {
    const { banGhi, trangThai } = bocBanGhiMoi(dong("recA"));
    expect(banGhi.tenKhach).toBe("Fixture BB-332 Mai");
    expect(banGhi.maHoaDon).toBe("HD_20260930#01");
    expect(laBanGhiMoi(banGhi, trangThai)).toBe(true);
  });

  it("thiếu tên, SĐT hoặc gói → không phải", () => {
    for (const thieu of [{ ten: "" }, { sdt: "" }, { goi: "" }]) {
      const { banGhi, trangThai } = bocBanGhiMoi(dong("recB", thieu));
      expect(laBanGhiMoi(banGhi, trangThai)).toBe(false);
    }
  });

  it("Trạng Thái đã có (vd 'Đã gửi file gốc') → không phải bản ghi mới", () => {
    const { banGhi, trangThai } = bocBanGhiMoi(dong("recC", { tt: "Đã gửi file gốc" }));
    expect(laBanGhiMoi(banGhi, trangThai)).toBe(false);
  });

  it("đã có Link app gửi khách (ô URL hoặc ô chữ) → KHÔNG phải bản ghi mới, dù Trạng Thái trống", () => {
    const LINK = "https://hauky.babybeanstudio.vn/g/FIXTUREbb332";
    for (const o of [{ linkApp: { link: LINK, text: LINK } }, { linkApp: [{ text: LINK, type: "text" }] }]) {
      const { banGhi, trangThai } = bocBanGhiMoi(dong("recLinkApp", o));
      expect(trangThai).toBe("");
      expect(banGhi.linkApp).toBe(LINK);
      expect(laBanGhiMoi(banGhi, trangThai)).toBe(false);
    }
  });

  it("Link app trống nhưng ĐÃ có link Drive → vẫn là bản ghi mới (Drive không phải điều kiện)", () => {
    const d = "https://drive.google.com/drive/folders/SEED_FOLDER_ID_BB332";
    const { banGhi, trangThai } = bocBanGhiMoi(dong("recChiDrive", { drive: d }));
    expect(banGhi.linkApp).toBe("");
    expect(laBanGhiMoi(banGhi, trangThai)).toBe(true);
  });

  it("dòng đã có Link app không vào bảng bản ghi mới khi đồng bộ", async () => {
    const db = taoDbGia([]);
    const kq = await dongBoBanGhiMoi({
      client: db.client,
      nguon: nguonGia([dong("recMoiThat"), dong("recDaGuiLink", { linkApp: { link: "https://hauky.babybeanstudio.vn/g/X", text: "x" } })]),
      dbUrl: DB_TEN_GIA,
    });
    expect(kq.moi).toBe(1);
    expect([...db.banGhi.keys()]).toEqual(["recMoiThat"]);
  });

  it("chỉ lấy link Drive, không lấy nhãn (tên khách) của ô link", () => {
    const d = "https://drive.google.com/drive/folders/SEED_FOLDER_ID_BB332";
    expect(bocBanGhiMoi(dong("recD", { drive: d })).banGhi.driveUrl).toBe(d);
    expect(bocBanGhiMoi(dong("recE", { drive: "https://example.com/x" })).banGhi.driveUrl).toBeNull();
  });

  it("chi nhánh không khớp → null, không đoán chi nhánh đầu tiên", () => {
    const b = [
      { id: "b1", code: "BB-NTB", name: "Baby Bean Tân Bình" },
      { id: "b2", code: "BB-PT", name: "Baby Bean Pasteur" },
      { id: "b3", code: "BB-TD", name: "Baby Bean Thảo Điền" },
    ];
    expect(khopChiNhanh("NTB", b)).toBe("b1");
    expect(khopChiNhanh("Pasteur", b)).toBe("b2");
    expect(khopChiNhanh("Thảo Điền", b)).toBe("b3");
    expect(khopChiNhanh("Chi nhánh lạ", b)).toBeNull();
    expect(khopChiNhanh("Baby Bean", b)).toBeNull(); // khớp nhiều → không đoán
  });
});

describe("BB-332: Lark xoá dòng", () => {
  it("bộ ảnh chưa gửi khách (nháp/ready, không Link app, không ảnh chọn) → lưu trữ", () => {
    expect(khiLarkXoaDong({ id: "g", status: "draft", soLinkApp: 0, soAnhChon: 0 })).toBe("luu_tru");
    expect(khiLarkXoaDong({ id: "g", status: "ready", soLinkApp: 0, soAnhChon: 0 })).toBe("luu_tru");
  });

  it("đã có Link app, đã có ảnh chọn, hoặc khách đã chốt → KHÔNG xoá, chỉ đánh dấu", () => {
    expect(khiLarkXoaDong({ id: "g", status: "ready", soLinkApp: 1, soAnhChon: 0 })).toBe("danh_dau");
    expect(khiLarkXoaDong({ id: "g", status: "ready", soLinkApp: 0, soAnhChon: 3 })).toBe("danh_dau");
    expect(khiLarkXoaDong({ id: "g", status: "submitted", soLinkApp: 0, soAnhChon: 0 })).toBe("danh_dau");
  });
});

// ---------------------------------------------------------------------------
// pg giả trong bộ nhớ
// ---------------------------------------------------------------------------
interface GalleryGia {
  id: string;
  status: string;
  lark_hauky_record_id: string | null;
  lark_dong_da_xoa_luc: Date | null;
  soLinkApp: number;
  soAnhChon: number;
}

function taoDbGia(galleries: GalleryGia[]) {
  const banGhi = new Map<string, Record<string, unknown>>();
  const cacCau: string[] = [];
  const client = {
    async query(sql: string, p: unknown[] = []) {
      cacCau.push(sql);
      if (/from branches/.test(sql)) return { rows: [{ id: "b1", code: "BB-Q1", name: "BabyBean Quận 1" }], rowCount: 1 };
      if (/insert into lark_ban_ghi_moi/.test(sql)) {
        const moi = !banGhi.has(p[0] as string);
        banGhi.set(p[0] as string, { ...(banGhi.get(p[0] as string) ?? { gallery_id: null }), lark_record_id: p[0], branch_id: p[1], ten_khach: p[2] });
        return { rows: [{ moi }], rowCount: 1 };
      }
      if (/update lark_ban_ghi_moi b set gallery_id/.test(sql)) {
        let n = 0;
        for (const b of banGhi.values()) {
          const g = galleries.find((x) => x.lark_hauky_record_id === b.lark_record_id && x.status !== "archived");
          if (g && !b.gallery_id) {
            b.gallery_id = g.id;
            n++;
          }
        }
        return { rows: [], rowCount: n };
      }
      if (/select lark_record_id, gallery_id from lark_ban_ghi_moi/.test(sql)) {
        return { rows: [...banGhi.values()], rowCount: banGhi.size };
      }
      if (/from galleries g/.test(sql)) {
        const ids = p[0] as string[];
        const rows = galleries.filter((g) => g.lark_hauky_record_id && ids.includes(g.lark_hauky_record_id) && g.status !== "archived");
        return { rows, rowCount: rows.length };
      }
      if (/update galleries set status = 'archived'/.test(sql)) {
        const g = galleries.find((x) => x.id === p[0] && x.status === p[2]);
        if (g) {
          g.status = "archived";
          g.lark_dong_da_xoa_luc = p[1] as Date;
        }
        return { rows: [], rowCount: g ? 1 : 0 };
      }
      if (/update galleries set lark_dong_da_xoa_luc/.test(sql)) {
        const g = galleries.find((x) => x.id === p[0]);
        if (g) g.lark_dong_da_xoa_luc = p[1] as Date;
        return { rows: [], rowCount: g ? 1 : 0 };
      }
      if (/delete from lark_ban_ghi_moi/.test(sql)) {
        let n = 0;
        for (const id of p[0] as string[]) if (banGhi.delete(id)) n++;
        return { rows: [], rowCount: n };
      }
      throw new Error(`pg giả không biết câu lệnh: ${sql.slice(0, 60)}`);
    },
  };
  return { client: client as never, banGhi, cacCau };
}

function nguonGia(dongMoi: LarkRecord[], daXoa: string[] = []): NguonLark & { hoiXoa: string[][] } {
  const hoiXoa: string[][] = [];
  return {
    hoiXoa,
    async docTrangThaiTrong() {
      return dongMoi;
    },
    async timDongDaXoa(ids) {
      hoiXoa.push(ids);
      return new Set(ids.filter((i) => daXoa.includes(i)));
    },
  };
}

describe("BB-332: dongBoBanGhiMoi (Lark giả, pg giả)", () => {
  it("chỉ ghi dòng đúng luật; lượt hai là cập nhật, không nhân đôi", async () => {
    const db = taoDbGia([]);
    const nguon = nguonGia([dong("recMoi1"), dong("recThieuGoi", { goi: "" })]);
    const kq1 = await dongBoBanGhiMoi({ client: db.client, nguon, dbUrl: DB_TEN_GIA });
    expect(kq1.moi).toBe(1);
    expect([...db.banGhi.keys()]).toEqual(["recMoi1"]);
    const kq2 = await dongBoBanGhiMoi({ client: db.client, nguon, dbUrl: DB_TEN_GIA });
    expect(kq2).toMatchObject({ moi: 0, capNhat: 1 });
  });

  it("Lark xoá dòng: bản ghi mới bị xoá; bộ chưa gửi khách lưu trữ; bộ đã gửi chỉ đánh dấu", async () => {
    const galleries: GalleryGia[] = [
      { id: "gNhap", status: "draft", lark_hauky_record_id: "recNhap", lark_dong_da_xoa_luc: null, soLinkApp: 0, soAnhChon: 0 },
      { id: "gDaGui", status: "in_review", lark_hauky_record_id: "recDaGui", lark_dong_da_xoa_luc: null, soLinkApp: 1, soAnhChon: 4 },
    ];
    const db = taoDbGia(galleries);
    // Lượt 1: ba dòng mới; hai dòng đã thành bộ ảnh (neo lark_hauky_record_id).
    await dongBoBanGhiMoi({ client: db.client, nguon: nguonGia([dong("recChuaTao"), dong("recNhap"), dong("recDaGui")]), dbUrl: DB_TEN_GIA });
    // Lượt 2: Lark đã xoá cả ba.
    const kq = await dongBoBanGhiMoi({
      client: db.client,
      nguon: nguonGia([], ["recChuaTao", "recNhap", "recDaGui"]),
      dbUrl: DB_TEN_GIA,
    });
    expect(kq).toMatchObject({ xoaBanGhi: 3, luuTruBoAnh: 1, danhDauLarkXoa: 1 });
    expect(db.banGhi.size).toBe(0);
    expect(galleries[0]!.status).toBe("archived");
    // Bộ đã gửi khách: KHÔNG xoá, KHÔNG lưu trữ — chỉ đánh dấu cho Việc cần xử lý.
    expect(galleries[1]!.status).toBe("in_review");
    expect(galleries[1]!.lark_dong_da_xoa_luc).toBeInstanceOf(Date);
  });

  it(`Lark báo quá ${TRAN_XOA_MOI_LUOT} dòng bị xoá một lượt → nghi đọc hỏng, không xoá gì`, async () => {
    const ids = Array.from({ length: TRAN_XOA_MOI_LUOT + 1 }, (_, i) => `recX${i}`);
    const db = taoDbGia([]);
    await dongBoBanGhiMoi({ client: db.client, nguon: nguonGia(ids.map((i) => dong(i))), dbUrl: DB_TEN_GIA });
    const kq = await dongBoBanGhiMoi({ client: db.client, nguon: nguonGia([], ids), dbUrl: DB_TEN_GIA });
    expect(kq.xoaBanGhi).toBe(0);
    expect(kq.boQuaXoa).toBeTruthy();
    expect(db.banGhi.size).toBe(ids.length);
  });

  it("cron: bộ ảnh đã đánh dấu từ trước thì không làm lại", async () => {
    const galleries: GalleryGia[] = [
      { id: "g1", status: "in_review", lark_hauky_record_id: "rec1", lark_dong_da_xoa_luc: new Date("2026-09-01"), soLinkApp: 1, soAnhChon: 0 },
    ];
    const db = taoDbGia(galleries);
    const kq = await xuLyBoAnhMatDongLark(db.client, ["rec1"]);
    expect(kq).toEqual({ luuTru: 0, danhDau: 0 });
  });
});
