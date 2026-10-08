/**
 * BB-397 — phép thử THUẦN: kiểm khách dự phòng bằng hoá đơn GỐC của bộ (khách app chưa có
 * `lark_customer_key`), lệnh nối khoá, và gốc của lỗi (dòng Hậu Kỳ không mang khoá khách).
 * Nguồn hoá đơn giả + hàm tra khách giả; không mạng, không cơ sở dữ liệu.
 */
import { describe, expect, it } from "vitest";
import {
  HOA_DON_FIXTURE,
  KHOA_KHACH_FIXTURE,
  KHOA_KHACH_FIXTURE_CHUA_NOI,
  LoiNguonHoaDon,
  type HoaDonChuan,
  type NguonHoaDon,
} from "@/lib/hoa-don/nguon-hoa-don";
import { kiemKhachChoBo, laKhopKhach, quyetDinhNoiKhoa } from "@/lib/hoa-don/khop-khach-du-phong";
import { bocDongHauKy } from "@/lib/lark/tra-hau-ky";
import { customerKey, syncSingleRetouchRecord } from "@/lib/lark/sync-retouch";
import { noiKhoaKhachNeuTrong } from "@/lib/lark/noi-khoa-khach";

const hd = (so: string): HoaDonChuan => structuredClone(HOA_DON_FIXTURE[`HD_20990101#${so}`] as HoaDonChuan);

/** Nguồn giả có đếm lượt đọc; `them` = hoá đơn gốc riêng cho từng ca. */
function nguonGia(them: HoaDonChuan[] = [], loi = false): NguonHoaDon & { daDoc: string[] } {
  const bang = new Map<string, HoaDonChuan>([...Object.entries(HOA_DON_FIXTURE), ...them.map((h) => [h.ma, h] as const)]);
  const daDoc: string[] = [];
  return {
    ten: "fixture",
    daDoc,
    async layHoaDon(ma: string) {
      daDoc.push(ma);
      if (loi) throw new LoiNguonHoaDon("CHAM", "chậm");
      const h = bang.get(ma);
      return h ? structuredClone(h) : null;
    },
  };
}
const goc = (so: string, khach: string | null): HoaDonChuan => ({ ...hd("9011"), ma: `HD_20990101#${so}`, khoaKhachNguon: khach });

const KHACH_BO = "00000000-0000-4000-8000-000000000397";
const KHACH_KHAC = "00000000-0000-4000-8000-000000000399";
const khongAiGiu = async () => null;

describe("BB-397: khớp khách qua hoá đơn gốc khi khách chưa có khoá Lark", () => {
  it("(a) khách chưa có khoá + hoá đơn gốc CÙNG khách → khop_qua_hoa_don_goc + lệnh nối khoá", async () => {
    const nguon = nguonGia();
    const kq = await kiemKhachChoBo({
      hoaDons: [hd("9012")],
      customerId: KHACH_BO,
      khoaKhachBo: null,
      maGoc: ["HD_20990101#9011", null],
      nguon,
      timKhachGiuKhoa: khongAiGiu,
    });
    expect(kq.theoMa["HD_20990101#9012"]).toBe("khop_qua_hoa_don_goc");
    expect(laKhopKhach(kq.theoMa["HD_20990101#9012"])).toBe(true);
    expect(kq.lenhNoi).toEqual({ loai: "noi", customerId: KHACH_BO, khoa: KHOA_KHACH_FIXTURE_CHUA_NOI });
    expect(nguon.daDoc).toEqual(["HD_20990101#9011"]);
  });

  it("(b) hoá đơn gốc của khách KHÁC → khac_khach, không nối", async () => {
    const kq = await kiemKhachChoBo({
      hoaDons: [hd("9012")],
      customerId: KHACH_BO,
      khoaKhachBo: null,
      maGoc: ["HD_20990101#9002"], // gốc mang KHOA_KHACH_FIXTURE, phát sinh mang khoá chưa nối
      nguon: nguonGia(),
      timKhachGiuKhoa: khongAiGiu,
    });
    expect(kq.theoMa["HD_20990101#9012"]).toBe("khac_khach");
    expect(kq.lenhNoi).toBeNull();
  });

  it("(c) không có hoá đơn gốc (trống / nguồn không có mã) → chặn như cũ: bo_chua_co_khoa", async () => {
    for (const maGoc of [[], [null], ["HD_20260924#5261"], ["không-phải-mã"]]) {
      const kq = await kiemKhachChoBo({
        hoaDons: [hd("9012")],
        customerId: KHACH_BO,
        khoaKhachBo: null,
        maGoc,
        nguon: nguonGia(),
        timKhachGiuKhoa: khongAiGiu,
      });
      expect(kq.theoMa["HD_20990101#9012"]).toBe("bo_chua_co_khoa");
      expect(kq.lenhNoi).toBeNull();
    }
  });

  it("(d) khoá đã thuộc khách KHÁC → vẫn khớp, KHÔNG nối, lệnh cảnh báo trùng khách", async () => {
    const kq = await kiemKhachChoBo({
      hoaDons: [hd("9012")],
      customerId: KHACH_BO,
      khoaKhachBo: null,
      maGoc: ["HD_20990101#9011"],
      nguon: nguonGia(),
      timKhachGiuKhoa: async (k) => (k === KHOA_KHACH_FIXTURE_CHUA_NOI ? KHACH_KHAC : null),
    });
    expect(kq.theoMa["HD_20990101#9012"]).toBe("khop_qua_hoa_don_goc");
    expect(kq.lenhNoi).toEqual({ loai: "trung_khach", customerId: KHACH_BO, khoa: KHOA_KHACH_FIXTURE_CHUA_NOI, khachGiuKhoa: KHACH_KHAC });
  });

  it("gốc lệch khách nhau / gốc không có khách → không đoán, chặn như cũ", async () => {
    const nguon = nguonGia([goc("9091", "fx-khac"), goc("9092", null)]);
    const lech = await kiemKhachChoBo({
      hoaDons: [hd("9012")],
      customerId: KHACH_BO,
      khoaKhachBo: null,
      maGoc: ["HD_20990101#9011", "HD_20990101#9091"],
      nguon,
      timKhachGiuKhoa: khongAiGiu,
    });
    expect(lech.theoMa["HD_20990101#9012"]).toBe("bo_chua_co_khoa");
    expect(lech.khoaGoc).toMatchObject({ ok: false, lyDo: "goc_nhieu_khach" });
    const trong = await kiemKhachChoBo({
      hoaDons: [hd("9012")],
      customerId: KHACH_BO,
      khoaKhachBo: null,
      maGoc: ["HD_20990101#9092"],
      nguon,
      timKhachGiuKhoa: khongAiGiu,
    });
    expect(trong.theoMa["HD_20990101#9012"]).toBe("bo_chua_co_khoa");
    expect(trong.khoaGoc).toMatchObject({ ok: false, lyDo: "goc_khong_co_khach" });
  });

  it("khách ĐÃ có khoá → so như cũ, KHÔNG đọc hoá đơn gốc (khoá khác vẫn là khách khác)", async () => {
    const nguon = nguonGia();
    const kq = await kiemKhachChoBo({
      hoaDons: [hd("9012"), hd("9002")],
      customerId: KHACH_BO,
      khoaKhachBo: KHOA_KHACH_FIXTURE,
      maGoc: ["HD_20990101#9011"],
      nguon,
      timKhachGiuKhoa: khongAiGiu,
    });
    expect(kq.theoMa).toEqual({ "HD_20990101#9012": "khac_khach", "HD_20990101#9002": "khop" });
    expect(kq.lenhNoi).toBeNull();
    expect(nguon.daDoc).toEqual([]);
  });

  it("bộ không có khách → không dự phòng; nguồn hỏng khi đọc gốc → ném LoiNguonHoaDon", async () => {
    const kq = await kiemKhachChoBo({
      hoaDons: [hd("9012")],
      customerId: null,
      khoaKhachBo: null,
      maGoc: ["HD_20990101#9011"],
      nguon: nguonGia(),
      timKhachGiuKhoa: khongAiGiu,
    });
    expect(kq.theoMa["HD_20990101#9012"]).toBe("bo_chua_co_khoa");
    await expect(
      kiemKhachChoBo({
        hoaDons: [hd("9012")],
        customerId: KHACH_BO,
        khoaKhachBo: null,
        maGoc: ["HD_20990101#9011"],
        nguon: nguonGia([], true),
        timKhachGiuKhoa: khongAiGiu,
      }),
    ).rejects.toBeInstanceOf(LoiNguonHoaDon);
  });

  it("nhiều hoá đơn: một cái khách khác → cả lượt không nối khoá", async () => {
    const kq = await kiemKhachChoBo({
      hoaDons: [hd("9012"), hd("9002")],
      customerId: KHACH_BO,
      khoaKhachBo: null,
      maGoc: ["HD_20990101#9011"],
      nguon: nguonGia(),
      timKhachGiuKhoa: khongAiGiu,
    });
    expect(kq.theoMa).toEqual({ "HD_20990101#9012": "khop_qua_hoa_don_goc", "HD_20990101#9002": "khac_khach" });
    expect(kq.lenhNoi).toBeNull();
  });

  it("quyetDinhNoiKhoa: không đè khoá đã có; chính khách này đã giữ → không làm gì", () => {
    expect(quyetDinhNoiKhoa({ customerId: KHACH_BO, khoaKhachBo: "abc", khoa: "x", khachGiuKhoa: null })).toBeNull();
    expect(quyetDinhNoiKhoa({ customerId: KHACH_BO, khoaKhachBo: null, khoa: "x", khachGiuKhoa: KHACH_BO })).toBeNull();
  });
});

describe("BB-397: gốc của lỗi — dòng Hậu Kỳ phải mang khoá khách để đường tạo/gắn bộ đặt khoá", () => {
  it("bocDongHauKy băm ô 'Mã KH' bằng ĐÚNG customerKey của đồng bộ Lark", () => {
    const d = bocDongHauKy({
      record_id: "recX",
      fields: { "HĐ Tổng": "HD_20990101#9011", "Mã KH": [{ type: "text", text: "KH-FIXTURE-0901000001" }] },
    });
    expect(d.khoaKhach).toBe(customerKey("KH-FIXTURE-0901000001"));
    expect(bocDongHauKy({ record_id: "recY", fields: { "HĐ Tổng": "HD_20990101#9011" } }).khoaKhach).toBeUndefined();
  });
});

/** Supabase giả tối thiểu cho `noiKhoaKhachNeuTrong` (giữ bảng customers trong bộ nhớ). */
function adminGia(khach: { id: string; lark_customer_key: string | null }[]) {
  const from = () => {
    const loc: { eq: [string, unknown][]; isNull: string[] } = { eq: [], isNull: [] };
    let capNhat: Record<string, unknown> | null = null;
    const khop = () =>
      khach.filter((k) => loc.eq.every(([c, v]) => (k as Record<string, unknown>)[c] === v) && loc.isNull.every((c) => (k as Record<string, unknown>)[c] === null));
    const b = {
      select: () => b,
      update: (v: Record<string, unknown>) => ((capNhat = v), b),
      eq: (c: string, v: unknown) => (loc.eq.push([c, v]), b),
      is: (c: string) => (loc.isNull.push(c), b),
      limit: () => b,
      maybeSingle: async () => ({ data: khop()[0] ?? null, error: null }),
      then: (ok: (r: unknown) => void) => {
        const ds = khop();
        if (capNhat) {
          if (khach.some((k) => k.lark_customer_key === capNhat!.lark_customer_key)) return ok({ data: null, error: { code: "23505" } });
          for (const k of ds) Object.assign(k, capNhat);
        }
        return ok({ data: ds.map((k) => ({ id: k.id })), error: null });
      },
    };
    return b;
  };
  return { from } as unknown as Parameters<typeof noiKhoaKhachNeuTrong>[0];
}

describe("BB-397: noiKhoaKhachNeuTrong — đường tạo/gắn bộ đặt khoá, không đè, không giành khoá", () => {
  it("khách trống khoá → da_noi; gọi lại → da_co_khoa; khách khác giữ → trung_khach; khách có khoá khác → không đè", async () => {
    const bang = [
      { id: "k1", lark_customer_key: null },
      { id: "k2", lark_customer_key: "khoa-k2" },
      { id: "k3", lark_customer_key: null },
    ];
    const admin = adminGia(bang);
    expect(await noiKhoaKhachNeuTrong(admin, "k1", "khoa-moi")).toBe("da_noi");
    expect(bang[0]?.lark_customer_key).toBe("khoa-moi");
    expect(await noiKhoaKhachNeuTrong(admin, "k1", "khoa-moi")).toBe("da_co_khoa");
    expect(await noiKhoaKhachNeuTrong(admin, "k3", "khoa-k2")).toBe("trung_khach");
    expect(bang[2]?.lark_customer_key).toBeNull();
    expect(await noiKhoaKhachNeuTrong(admin, "k2", "khoa-khac")).toBe("da_co_khoa");
    expect(bang[1]?.lark_customer_key).toBe("khoa-k2");
    expect(await noiKhoaKhachNeuTrong(admin, "k3", undefined)).toBe("khong_co_khoa");
  });
});

describe("BB-397: đồng bộ Hậu Kỳ — bộ ĐÃ CÓ (tạo bằng thuật sĩ) vẫn được nối khoá khách", () => {
  const banGhi = {
    record_id: "rec_bb397",
    fields: {
      "Trạng thái": "Đã gửi file gốc",
      "Link ảnh gửi khách": "https://drive.google.com/drive/folders/1Fixture397aaaaaaaaaaaaaaaaaaaa",
      "Hợp đồng": "HD_20990101#9011",
      "Mã KH": [{ text: "KH-FIXTURE-0901000397", type: "text" }],
    },
  };
  const clientGia = () => {
    const cauLenh: { sql: string; params?: unknown[] }[] = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        cauLenh.push({ sql, params });
        if (sql.includes("from galleries where drive_folder_id")) {
          return { rows: [{ id: "gal-cu", title: "Album", status: "draft", customer_id: "kh-cu" }] };
        }
        return { rows: [] };
      },
    } as unknown as import("pg").Client;
    return { client, cauLenh };
  };
  const chung = { branches: [], staffList: [], index: 0, dbUrl: "postgresql://localhost/test" };

  it("write → update lark_customer_key chỉ khi trống và chưa ai giữ; chạy thử → không ghi", async () => {
    const a = clientGia();
    const kq = await syncSingleRetouchRecord({ ...chung, client: a.client, record: banGhi, write: true });
    expect(kq.action).toBe("already_exists");
    const u = a.cauLenh.find((c) => c.sql.includes("update customers set lark_customer_key"));
    expect(u?.params).toEqual([customerKey("KH-FIXTURE-0901000397"), "kh-cu"]);
    expect(u?.sql).toMatch(/lark_customer_key is null/);
    expect(u?.sql).toMatch(/not exists \(select 1 from customers c2 where c2\.lark_customer_key = \$1\)/);
    const b = clientGia();
    await syncSingleRetouchRecord({ ...chung, client: b.client, record: banGhi, write: false });
    expect(b.cauLenh.some((c) => c.sql.includes("update customers set lark_customer_key"))).toBe(false);
  });
});
