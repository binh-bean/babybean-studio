/**
 * BB-409 — Thùng rác bộ ảnh: luật thuần + chặn Lark sinh lại bộ đã xoá.
 * Phép thử THUẦN: không chạm cơ sở dữ liệu (client pg là đồ giả ghi lại câu hỏi),
 * không gọi Lark (`fetch` bị chặn).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";

import {
  SO_NGAY_THUNG_RAC,
  bamThuMucDrive,
  chonBoQuaHan,
  laDongBiChan,
  mocCatQuaHan,
  soNgayConLai,
  xacNhanDungMa,
} from "@/lib/thung-rac/thung-rac";
import { syncSingleRetouchRecord } from "@/lib/lark/sync-retouch";

const NGAY = 24 * 60 * 60 * 1000;
const BAY_GIO = new Date("2026-10-20T03:00:00.000Z");
const truoc = (ngay: number, gio = 0) => new Date(BAY_GIO.getTime() - ngay * NGAY - gio * 3600_000).toISOString();

describe("BB-409: còn N ngày trong thùng rác", () => {
  it("vừa xoá → còn đủ 10 ngày", () => {
    expect(SO_NGAY_THUNG_RAC).toBe(10);
    expect(soNgayConLai(truoc(0), BAY_GIO)).toBe(10);
  });
  it("làm tròn LÊN: xoá 9 ngày 21 giờ trước → còn 1 ngày (chưa tới hạn)", () => {
    expect(soNgayConLai(truoc(9, 21), BAY_GIO)).toBe(1);
  });
  it("tròn 10 ngày hoặc hơn → 0, không âm", () => {
    expect(soNgayConLai(truoc(10), BAY_GIO)).toBe(0);
    expect(soNgayConLai(truoc(25), BAY_GIO)).toBe(0);
  });
  it("mốc cắt cho câu truy vấn đúng 10 ngày trước", () => {
    expect(mocCatQuaHan(BAY_GIO)).toBe(truoc(10));
  });
});

describe("BB-409: chọn bộ quá hạn để dọn", () => {
  const ds = [
    { id: "moi", deletedAt: truoc(2) },
    { id: "vua-toi-han", deletedAt: truoc(10) },
    { id: "chua-toi-han-1-gio", deletedAt: truoc(9, 23) },
    { id: "cu-nhat", deletedAt: truoc(30) },
    { id: "hong", deletedAt: "không phải ngày" },
    { id: "cu-nhi", deletedAt: truoc(15) },
  ];
  it("chỉ chọn bộ đã đủ 10 ngày, cũ nhất trước", () => {
    expect(chonBoQuaHan(ds, BAY_GIO, 10).map((b) => b.id)).toEqual(["cu-nhat", "cu-nhi", "vua-toi-han"]);
  });
  it("tôn trọng giới hạn mỗi lượt", () => {
    expect(chonBoQuaHan(ds, BAY_GIO, 2).map((b) => b.id)).toEqual(["cu-nhat", "cu-nhi"]);
    expect(chonBoQuaHan(ds, BAY_GIO, 0)).toEqual([]);
  });
});

describe("BB-409: dấu chặn Lark + xác nhận xoá hẳn", () => {
  const FOLDER = "SEED_FOLDER_ID_409";
  it("băm thư mục Drive, không lưu id thật", () => {
    const h = bamThuMucDrive(FOLDER);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(FOLDER);
    expect(bamThuMucDrive("  ")).toBeNull();
  });
  it("chặn theo mã dòng Lark hoặc theo thư mục; dấu đã bỏ thì không chặn", () => {
    const dau = [{ lark_hauky_record_id: "recA", drive_folder_hash: bamThuMucDrive(FOLDER), bo_dau_luc: null }];
    expect(laDongBiChan(dau, { recordId: "recA" })).toBe(true);
    expect(laDongBiChan(dau, { recordId: "recKhac", driveFolderId: FOLDER })).toBe(true);
    expect(laDongBiChan(dau, { recordId: "recKhac", driveFolderId: "SEED_FOLDER_ID_KHAC" })).toBe(false);
    const daBo = [{ ...dau[0]!, bo_dau_luc: "2026-10-10T00:00:00Z" }];
    expect(laDongBiChan(daBo, { recordId: "recA", driveFolderId: FOLDER })).toBe(false);
  });
  it("xoá hẳn ngay phải gõ đúng mã bộ (8 ký tự đầu)", () => {
    const id = "abcdef12-3456-4789-8abc-def012345678";
    expect(xacNhanDungMa(id, "ABCDEF12 ")).toBe(true);
    expect(xacNhanDungMa(id, "abcdef1")).toBe(false);
    expect(xacNhanDungMa(id, undefined)).toBe(false);
  });
});

// --- Đồng bộ Lark dựng bằng dữ liệu giả ---------------------------------------
describe("BB-409: đồng bộ Lark KHÔNG sinh lại bộ đã xoá", () => {
  const FOLDER = "1SeedFolderBb409xxxxxxxxxxxxxxxx";
  const record = {
    record_id: "rec_bb409_gia",
    fields: {
      "Trạng thái": "Đã gửi file gốc",
      "Link ảnh gửi khách": `https://drive.google.com/drive/folders/${FOLDER}`,
      "Chi nhánh": "Quận 1",
    },
  };

  function clientGia(dau: Array<Record<string, unknown>>) {
    const cauHoi: string[] = [];
    const client = {
      cauHoi,
      query: vi.fn(async (sql: string) => {
        cauHoi.push(sql);
        if (sql.includes("bo_anh_da_xoa")) return { rows: dau };
        if (/from galleries where drive_folder_id/.test(sql)) {
          return { rows: [{ id: "g-da-co", title: "Fixture BB-409", status: "ready", customer_id: null }] };
        }
        return { rows: [] };
      }),
    };
    return client;
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("BB-409: phép thử không được gọi Lark/Drive");
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const chay = (client: ReturnType<typeof clientGia>, write = true) =>
    syncSingleRetouchRecord({
      client: client as never,
      record: record as never,
      branches: [{ id: "b-q1", code: "BB-Q1", name: "BabyBean Quận 1" }],
      staffList: [],
      write,
      index: 0,
    });

  it("dòng trùng dấu (mã dòng Lark) → bỏ qua, không đụng bảng galleries", async () => {
    const client = clientGia([{ lark_hauky_record_id: "rec_bb409_gia", drive_folder_hash: null, bo_dau_luc: null }]);
    const kq = await chay(client);
    expect(kq.action).toBe("skipped");
    expect(kq.reason).toMatch(/thùng rác/);
    expect(client.cauHoi.some((q) => /galleries/.test(q) && !/bo_anh_da_xoa/.test(q))).toBe(false);
  });

  it("dòng trùng dấu theo thư mục Drive (bộ tạo tay chưa neo dòng) → cũng bỏ qua", async () => {
    const client = clientGia([{ lark_hauky_record_id: null, drive_folder_hash: bamThuMucDrive(FOLDER), bo_dau_luc: null }]);
    expect((await chay(client)).action).toBe("skipped");
  });

  it("không có dấu → đồng bộ chạy tiếp như cũ (tới bước tìm bộ đã có)", async () => {
    const client = clientGia([]);
    const kq = await chay(client, false);
    expect(kq.action).toBe("already_exists");
  });
});

// --- Link gia đình /k/<mã>: bộ trong thùng rác không hiện, số thứ tự giữ nguyên ---
import { danhSachBoAnhGiaDinh } from "@/lib/gia-dinh/bo-anh-gia-dinh";

describe("BB-409: trang gia đình bỏ bộ trong thùng rác", () => {
  const dong = (id: string, so: number, deleted_at: string | null) => ({
    id,
    title: null,
    status: "ready",
    photo_count: 12,
    cover_photo_id: null,
    created_at: `2026-09-0${so}T00:00:00Z`,
    so_thu_tu_khach: so,
    lark_trang_thai: null,
    lark_trang_thai_tu: null,
    reopened_at: null,
    deleted_at,
    shoot: null,
    baby: null,
  });
  const adminGia = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "is", "not", "gt", "in"]) q[m] = () => q;
    q.then = (xong: (v: unknown) => unknown) => Promise.resolve(xong({ data: rows, error: null }));
    return { from: () => q } as never;
  };

  it("bộ 2 ở thùng rác: chỉ hiện bộ 1 và 3, giữ đúng số 1 và 3", async () => {
    const ds = await danhSachBoAnhGiaDinh(
      adminGia([dong("bo-1", 1, null), dong("bo-2", 2, "2026-10-09T00:00:00Z"), dong("bo-3", 3, null)]),
      "khach-gia",
    );
    expect(ds.map((b) => [b.id, b.soThuTu]).sort()).toEqual([
      ["bo-1", 1],
      ["bo-3", 3],
    ]);
  });
});
