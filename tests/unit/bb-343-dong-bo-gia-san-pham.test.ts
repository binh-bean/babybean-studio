/**
 * BB-343 — đồng bộ giá + trạng thái sản phẩm từ bảng "Sản phẩm" bên Lark.
 *
 * Lark GIẢ ở biên mạng (`fetch` bị thay), không giả lập bất cứ thứ gì bên trong
 * mã. Phần cuối chạy trên bb-dev nhưng CHỈ chạm hàng "Fixture BB-343-…" và trả
 * lại sạch theo id (AGENTS.md §5a điều 3).
 *
 * Thước đo (§5a): mỗi ca dưới đây đã được thử hoàn nguyên — xem bàn giao.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import { GET as docItems } from "@/app/api/admin/galleries/[id]/items/route";
import {
  chuyenDongLark,
  cellNumber,
  cellText,
  classify,
  splitName,
  layKeHoach,
  dat80PhanTram,
  dongBoGiaSanPham,
  docBangSanPhamTuLark,
  khoPg,
  metadataNhatKy,
  type KhoDongBoGia,
  type SanPhamHienCo,
  type LenhCapNhat,
} from "@/lib/lark/dong-bo-gia-san-pham";
import * as script from "../../scripts/sync-lark-catalog.mjs";

// ---------------------------------------------------------------------------
// Dựng dữ liệu
// ---------------------------------------------------------------------------

type DongLark = { record_id: string; fields: Record<string, unknown> };

const dongLark = (
  recordId: string,
  ten: string,
  opts: { loai?: string; gia?: unknown; trangThai?: string } = {},
): DongLark => ({
  record_id: recordId,
  fields: {
    "Tên SP/DV": ten,
    "Phân Loại Sản Xuất": [{ text: opts.loai ?? "In Ấn" }],
    ...(opts.gia !== undefined ? { "Giá Bán": opts.gia } : {}),
    ...(opts.trangThai ? { "Trạng Thái Sử Dụng": [{ text: opts.trangThai }] } : {}),
  },
});

const spApp = (id: string, ten: string, recordId: string | null, o: Partial<SanPhamHienCo> = {}): SanPhamHienCo => ({
  id,
  name: ten,
  material: null,
  size: null,
  list_price: null,
  price_confidence: null,
  is_active: true,
  lark_record_id: recordId,
  ...o,
});

/** Kho trong bộ nhớ: ghi lại mọi lần ghi để ca kiểm "không ghi gì". */
function khoGia(sanPham: SanPhamHienCo[]) {
  const ghi = { apDung: [] as { capNhat: LenhCapNhat[]; idsTat: string[] }[], caiDat: [] as unknown[] };
  const kho: KhoDongBoGia = {
    docSanPham: async () => sanPham,
    apDung: async (capNhat, idsTat) => {
      ghi.apDung.push({ capNhat, idsTat });
    },
    docCaiDat: async () => null,
    ghiCaiDat: async (_k, v) => {
      ghi.caiDat.push(v);
    },
  };
  return { kho, ghi };
}

// Lark giả ở biên mạng ------------------------------------------------------

interface LarkGia {
  trang: DongLark[][];
  loiBang?: { code: number; msg: string };
  gocGoi: string[];
}

const fetchThat = globalThis.fetch;

function dungLarkGia(cau: { trang: DongLark[][]; loiBang?: { code: number; msg: string } }): LarkGia {
  const lark: LarkGia = { ...cau, gocGoi: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      // Chỉ Lark bị thay; Supabase (route đọc đơn ở ca 21) vẫn đi đường thật.
      if (!u.includes("open.larksuite.com")) return fetchThat(url, init);
      lark.gocGoi.push(u);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (u.includes("/auth/v3/tenant_access_token")) return json({ tenant_access_token: "t-gia" });
      if (u.includes("/tables?page_size")) {
        return json({
          code: 0,
          data: {
            items: [
              { table_id: "tblHoaDon", name: "Hóa đơn chi tiết" },
              { table_id: "tblSP", name: "Sản phẩm" },
            ],
          },
        });
      }
      if (u.includes("/tables/tblSP/records")) {
        if (lark.loiBang) return json({ code: lark.loiBang.code, msg: lark.loiBang.msg });
        const m = u.match(/page_token=p(\d+)/);
        const i = m ? Number(m[1]) : 0;
        return json({
          code: 0,
          data: {
            items: lark.trang[i] ?? [],
            has_more: i + 1 < lark.trang.length,
            page_token: `p${i + 1}`,
          },
        });
      }
      throw new Error(`Lark giả: không biết đường ${u} (bảng hóa đơn KHÔNG được đọc)`);
    }),
  );
  return lark;
}

const ENV_LARK = { LARK_APP_ID: "id", LARK_APP_SECRET: "bí-mật-giả", LARK_BASE_APP_TOKEN: "base-giả" };

beforeAll(() => {
  // Cửa thoát của chốt BB-052/kiem-thu: fetch đã bị thay nên không ra mạng thật.
  process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";
});
afterAll(() => {
  delete process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Dòng Lark → sản phẩm
// ---------------------------------------------------------------------------

describe("BB-343 · đọc một dòng Lark thành sản phẩm", () => {
  it("1. Tên, vật liệu, kích thước, giá, trạng thái", () => {
    const d = chuyenDongLark(dongLark("recA", "Gỗ 40 x 60", { gia: 1600000 }));
    expect(d).toEqual({
      loai: "ok",
      sp: { recordId: "recA", name: "Gỗ 40 x 60", kind: "print", material: "Gỗ", size: "40x60", giaBan: 1600000, isActive: true },
    });
  });

  it("2. 'Ngừng Kinh Doanh' → tắt; ô Giá Bán trống → 0 (chưa nhập)", () => {
    const d = chuyenDongLark(dongLark("recB", "Mica 70x110", { trangThai: "Ngừng Kinh Doanh" }));
    expect(d.loai === "ok" && d.sp.isActive).toBe(false);
    expect(d.loai === "ok" && d.sp.giaBan).toBe(0);
  });

  it("3. Mã lấy từ cột Record ID, rơi về record_id của Lark", () => {
    const a = chuyenDongLark({ record_id: "recX", fields: { ...dongLark("", "Baby 02").fields, "Record ID": "recMA" } });
    expect(a.loai === "ok" && a.sp.recordId).toBe("recMA");
    const b = chuyenDongLark(dongLark("recX", "Baby 02"));
    expect(b.loai === "ok" && b.sp.recordId).toBe("recX");
  });

  it("4. Tên trống / phân loại lạ → bỏ qua, nhưng giữ mã để biết Lark còn dòng đó", () => {
    expect(chuyenDongLark(dongLark("recC", "  "))).toMatchObject({ loai: "boQua", recordId: "recC" });
    expect(chuyenDongLark(dongLark("recD", "Canvas 30x40", { loai: "Loại lạ" }))).toMatchObject({
      loai: "boQua",
      recordId: "recD",
    });
  });

  it("5. Luật đọc GIỐNG HỆT script sync-lark-catalog.mjs trên cùng đầu vào", () => {
    const ten = ["Gỗ 40x60", "Gỗ 40 X 60", "Baby 02", "Edit file", "edit file", "Edit file Ảnh Phóng", "Mica 120×180", "Khung 5x7 ", "Album  20x20", "70x110", ""];
    const loai = ["Chụp / Quay", "In Ấn", "Phát Sinh", "Makeup", "Dịch vụ Hậu Kỳ", "Lạ", "", " In Ấn "];
    for (const t of ten) {
      expect(splitName(t), `splitName(${t})`).toEqual(script.splitName(t));
      for (const l of loai) expect(classify(t, l), `classify(${t}, ${l})`).toBe(script.classify(t, l));
    }
    const o = [null, undefined, "", "12", 1600000, "1.600.000đ", [{ text: "In Ấn" }], [{ name: "a" }, "b"], { text: "x" }, { name: "y" }];
    for (const v of o) {
      expect(cellText(v)).toBe(script.cellText(v));
      expect(cellNumber(v)).toBe(script.cellNumber(v));
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Kế hoạch: danh sách đổi giá, bật/tắt, sản phẩm biến mất
// ---------------------------------------------------------------------------

describe("BB-343 · kế hoạch đồng bộ", () => {
  const hienCo = [
    spApp("p1", "Gỗ 40x60", "recA", { material: "Gỗ", size: "40x60", list_price: 1500000, price_confidence: 0.9 }),
    spApp("p2", "Mica 70x110", "recB", { material: "Mica", size: "70x110", list_price: 7600000, price_confidence: 1 }),
    spApp("p3", "Baby 02", "recC", { list_price: 2000000, price_confidence: 1 }),
    spApp("p4", "Khung 20x30", "recD", { material: "Khung", size: "20x30", list_price: null }),
  ];

  it("6. Danh sách đổi giá: tên, giá cũ → giá mới; giá không đổi thì không có dòng", () => {
    const kh = layKeHoach(hienCo, [
      dongLark("recA", "Gỗ 40x60", { gia: 1600000 }), // đổi
      dongLark("recB", "Mica 70x110", { gia: 7600000 }), // giữ
      dongLark("recC", "Baby 02", { gia: 2000000 }), // giữ
      dongLark("recD", "Khung 20x30", { gia: 350000 }), // chưa có giá → có giá
    ]);
    expect(kh.doiGia).toEqual([
      { ten: "Gỗ 40x60", cu: 1500000, moi: 1600000 },
      { ten: "Khung 20x30", cu: null, moi: 350000 },
    ]);
    // Giá Bán > 0 là giá niêm yết, độ tin cậy 1 (như script).
    expect(kh.capNhat.find((c) => c.id === "p1")?.set).toMatchObject({ list_price: 1600000, price_confidence: 1 });
    expect(kh.capNhat.find((c) => c.id === "p2")).toBeUndefined();
  });

  it("7. 'Giá Bán' trống hoặc 0 → GIỮ giá hiện có, không ghi null hay 0", () => {
    const kh = layKeHoach(hienCo, [dongLark("recA", "Gỗ 40x60"), dongLark("recB", "Mica 70x110", { gia: 0 })]);
    expect(kh.doiGia).toEqual([]);
    for (const c of kh.capNhat) {
      expect(c.set).not.toHaveProperty("list_price");
      expect(c.set).not.toHaveProperty("price_confidence");
    }
  });

  it("8. Bật / tắt theo 'Trạng Thái Sử Dụng'", () => {
    const co = [
      spApp("p1", "Gỗ 40x60", "recA", { material: "Gỗ", size: "40x60", is_active: true }),
      spApp("p2", "Mica 70x110", "recB", { material: "Mica", size: "70x110", is_active: false }),
    ];
    const kh = layKeHoach(co, [
      dongLark("recA", "Gỗ 40x60", { trangThai: "Ngừng Kinh Doanh" }),
      dongLark("recB", "Mica 70x110", { trangThai: "Đang kinh doanh" }),
    ]);
    expect(kh.soTatTheoLark).toBe(1);
    expect(kh.soBat).toBe(1);
    expect(kh.capNhat.find((c) => c.id === "p1")?.set).toEqual({ is_active: false });
    expect(kh.capNhat.find((c) => c.id === "p2")?.set).toEqual({ is_active: true });
  });

  it("9. Đổi tên bên Lark → cập nhật tên, vật liệu, kích thước (khớp theo mã, không theo tên)", () => {
    const kh = layKeHoach(
      [spApp("p1", "Gỗ 40x60", "recA", { material: "Gỗ", size: "40x60" })],
      [dongLark("recA", "Gỗ sồi 50 x 70")],
    );
    expect(kh.capNhat[0]?.set).toEqual({ name: "Gỗ sồi 50 x 70", material: "Gỗ sồi", size: "50x70" });
    expect(kh.chuaCoTrongApp).toBe(0);
  });

  it("10. Sản phẩm biến mất khỏi Lark → chỉ TẮT (không xoá); sản phẩm không mã Lark và dòng bị bỏ qua thì không đụng", () => {
    const co = [
      spApp("p1", "Còn", "recA", { is_active: true }),
      spApp("p2", "Đã mất", "recGONE", { is_active: true }),
      spApp("p3", "Đã mất nhưng đã tắt từ trước", "recGONE2", { is_active: false }),
      spApp("p4", "Không mã Lark", null, { is_active: true }),
      spApp("p5", "Bị bỏ qua vì phân loại lạ", "recSKIP", { is_active: true }),
    ];
    const kh = layKeHoach(co, [
      dongLark("recA", "Còn"),
      dongLark("recSKIP", "Bị bỏ qua vì phân loại lạ", { loai: "Loại lạ" }),
      dongLark("recMOI", "Gỗ 10x15"), // chưa có trong app
    ]);
    expect(kh.tatMatLark).toEqual([{ id: "p2", name: "Đã mất" }]);
    expect(kh.chuaCoTrongApp).toBe(1);
    expect(kh.boQua).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Hai chốt an toàn — vi phạm là KHÔNG GHI GÌ
// ---------------------------------------------------------------------------

describe("BB-343 · chốt an toàn: Lark lỗi / đọc dưới 80% thì không ghi gì", () => {
  const muoi = Array.from({ length: 10 }, (_, i) => spApp(`p${i}`, `SP ${i}`, `rec${i}`, { list_price: 100000 }));
  const larkDu = (n: number) =>
    Array.from({ length: n }, (_, i) => dongLark(`rec${i}`, `SP ${i}`, { gia: 200000 }));

  it("11. Ngưỡng đúng 80%: 8/10 qua, 7/10 chặn", () => {
    expect(dat80PhanTram(8, 10)).toBe(true);
    expect(dat80PhanTram(7, 10)).toBe(false);
    expect(dat80PhanTram(0, 0)).toBe(false);
  });

  it("12. Lark trả 7/10 dòng → KHÔNG ghi (kho không bị gọi), trả DOC_QUA_IT", async () => {
    dungLarkGia({ trang: [larkDu(7)] });
    const { kho, ghi } = khoGia(muoi);
    const kq = await dongBoGiaSanPham({
      kho,
      docLark: () => docBangSanPhamTuLark(ENV_LARK),
      ghi: true,
      nguon: "nut",
    });
    expect(kq.ok).toBe(false);
    expect(kq.loi?.ma).toBe("DOC_QUA_IT");
    expect(kq.daGhi).toBe(false);
    expect(ghi.apDung).toEqual([]);
    expect(ghi.caiDat).toEqual([]);
    // Ghi nhận bằng số, để nhật ký nói đúng chuyện gì xảy ra.
    expect(kq.soDocTuLark).toBe(7);
    expect(kq.soCoMaTrongApp).toBe(10);
  });

  it("13. Lark trả 8/10 dòng → ghi; sản phẩm 2 dòng thiếu bị coi là biến mất và tắt", async () => {
    dungLarkGia({ trang: [larkDu(8)] });
    const { kho, ghi } = khoGia(muoi);
    const kq = await dongBoGiaSanPham({ kho, docLark: () => docBangSanPhamTuLark(ENV_LARK), ghi: true, nguon: "cron" });
    expect(kq.ok).toBe(true);
    expect(kq.daGhi).toBe(true);
    expect(ghi.apDung).toHaveLength(1);
    expect(ghi.apDung[0]?.idsTat.sort()).toEqual(["p8", "p9"]);
    expect(kq.soGiaDoi).toBe(8);
    expect(kq.soTat).toBe(2);
    expect(ghi.caiDat).toHaveLength(1);
  });

  it("14. Lark trả mã lỗi → KHÔNG ghi, trả LARK_LOI (không ném)", async () => {
    dungLarkGia({ trang: [], loiBang: { code: 99991663, msg: "token hết hạn" } });
    const { kho, ghi } = khoGia(muoi);
    const kq = await dongBoGiaSanPham({ kho, docLark: () => docBangSanPhamTuLark(ENV_LARK), ghi: true, nguon: "nut" });
    expect(kq.ok).toBe(false);
    expect(kq.loi?.ma).toBe("LARK_LOI");
    expect(kq.loi?.thongBao).toContain("token hết hạn");
    expect(ghi.apDung).toEqual([]);
  });

  it("15. Lark không cấp được token → LARK_LOI, không ghi", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: 10003, msg: "app_secret sai" }))));
    const { kho, ghi } = khoGia(muoi);
    const kq = await dongBoGiaSanPham({ kho, docLark: () => docBangSanPhamTuLark(ENV_LARK), ghi: true, nguon: "cron" });
    expect(kq.loi?.ma).toBe("LARK_LOI");
    expect(ghi.apDung).toEqual([]);
  });

  it("16. Bảng rỗng → BANG_RONG, không ghi (kể cả khi app cũng chưa có mã Lark nào)", async () => {
    dungLarkGia({ trang: [[]] });
    const { kho, ghi } = khoGia([]);
    const kq = await dongBoGiaSanPham({ kho, docLark: () => docBangSanPhamTuLark(ENV_LARK), ghi: true, nguon: "cron" });
    expect(kq.loi?.ma).toBe("BANG_RONG");
    expect(ghi.apDung).toEqual([]);
  });

  it("17. Đọc nhiều trang (has_more) và CHỈ gọi bảng Sản phẩm — không đụng bảng hóa đơn", async () => {
    const lark = dungLarkGia({ trang: [larkDu(4), larkDu(10).slice(4)] });
    const { kho } = khoGia(muoi);
    const kq = await dongBoGiaSanPham({ kho, docLark: () => docBangSanPhamTuLark(ENV_LARK), ghi: false, nguon: "nut" });
    expect(kq.soDocTuLark).toBe(10);
    expect(lark.gocGoi.some((u) => u.includes("tblHoaDon"))).toBe(false);
    expect(lark.gocGoi.filter((u) => u.includes("/tables/tblSP/records"))).toHaveLength(2);
    // Chỉ GET/POST xin token; không lần gọi nào ghi lên Lark.
    const fetchMock = vi.mocked(globalThis.fetch);
    const phuongThuc = fetchMock.mock.calls.map(([, init]) => (init as RequestInit | undefined)?.method ?? "GET");
    expect(phuongThuc.filter((m) => m !== "GET")).toEqual(["POST"]); // đúng một POST: xin token
  });

  it("18. Xem thử (ghi=false): tính được số đổi nhưng không ghi gì", async () => {
    dungLarkGia({ trang: [larkDu(10)] });
    const { kho, ghi } = khoGia(muoi);
    const kq = await dongBoGiaSanPham({ kho, docLark: () => docBangSanPhamTuLark(ENV_LARK), ghi: false, nguon: "nut" });
    expect(kq.ok).toBe(true);
    expect(kq.daGhi).toBe(false);
    expect(kq.soGiaDoi).toBe(10);
    expect(ghi.apDung).toEqual([]);
    expect(ghi.caiDat).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Nội dung nhật ký
// ---------------------------------------------------------------------------

describe("BB-343 · nhật ký", () => {
  it("19. Có danh sách 'tên: cũ → mới', số bật/tắt; không có dữ liệu khách", async () => {
    dungLarkGia({ trang: [[dongLark("recA", "Gỗ 40x60", { gia: 1600000 }), dongLark("recB", "Mica 70x110", { trangThai: "Ngừng Kinh Doanh" })]] });
    const { kho } = khoGia([
      spApp("p1", "Gỗ 40x60", "recA", { material: "Gỗ", size: "40x60", list_price: 1500000 }),
      spApp("p2", "Mica 70x110", "recB", { material: "Mica", size: "70x110", list_price: 7600000 }),
    ]);
    const kq = await dongBoGiaSanPham({ kho, docLark: () => docBangSanPhamTuLark(ENV_LARK), ghi: true, nguon: "nut" });
    const m = metadataNhatKy(kq);
    expect(m.doiGia).toEqual(["Gỗ 40x60: 1500000 → 1600000"]);
    expect(m).toMatchObject({ soGiaDoi: 1, soBat: 0, soTat: 1, ketQua: "thanh_cong", nguon: "nut", daGhi: true });
  });

  it("20. Lượt hỏng cũng có nội dung nhật ký, nói rõ lỗi gì", () => {
    const m = metadataNhatKy({
      ok: false, daGhi: false, nguon: "cron", loi: { ma: "DOC_QUA_IT", thongBao: "Lark chỉ trả 3" },
      soDocTuLark: 3, soCoMaTrongApp: 10, soGiaDoi: 0, doiGia: [], soBat: 0, soTat: 0, tatMatLark: [], chuaCoTrongApp: 0, soDongBoQua: 0,
    });
    expect(m).toMatchObject({ ketQua: "loi", loi: "DOC_QUA_IT", daGhi: false, soDocTuLark: 3, soCoMaTrongApp: 10 });
  });
});

// ---------------------------------------------------------------------------
// 5. Trên bb-dev: ghi thật qua khoPg, và ĐƠN ĐÃ ĐẶT GIỮ GIÁ LÚC ĐẶT
// ---------------------------------------------------------------------------

describe("BB-343 · bb-dev: đơn đã đặt giữ giá lúc đặt khi list_price đổi", () => {
  const dau = `fixture-bb343-${Date.now()}`;
  const KHOA_CAI_DAT_THU = `fixture_bb343_${Date.now()}`;
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let productId = "";
  let selectionId = "";

  const asOwner = () =>
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000343",
      role: "owner",
      branchIds: [branchId],
      permissions: quyenCuaVai("owner"),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);

  /** Kho thật (ghi thật vào products) nhưng nhìn thấy riêng hàng fixture, và ghi mốc vào khoá thử. */
  const khoChiFixture = (): KhoDongBoGia => {
    const that = khoPg(client);
    return {
      ...that,
      docSanPham: async () => (await that.docSanPham()).filter((p) => p.lark_record_id?.startsWith(dau)),
      ghiCaiDat: (_k, v) => that.ghiCaiDat(KHOA_CAI_DAT_THU, v),
    };
  };

  const tongSanPham = async (): Promise<number> => {
    asOwner();
    const res = await docItems(new Request("http://localhost"), { params: Promise.resolve({ id: galleryId }) });
    expect(res.status).toBe(200);
    return (await res.json()).data.addonsAmount as number;
  };

  const giaHienTai = async () =>
    Number((await client.query("select list_price from products where id = $1", [productId])).rows[0].list_price);

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    branchId = (await client.query("select id from branches order by name limit 1")).rows[0].id;

    productId = (
      await client.query(
        `insert into products (name, kind, material, size, list_price, price_confidence, price_samples, lark_record_id, is_active)
         values ('Fixture BB-343-Gỗ 40x60', 'print', 'Fixture BB-343-Gỗ', '40x60', 100000, 1, 0, $1, true) returning id`,
        [`${dau}-a`],
      )
    ).rows[0].id;
    await client.query(
      `insert into products (name, kind, lark_record_id, is_active, list_price)
       values ('Fixture BB-343-Sẽ biến mất', 'print', $1, true, 50000)`,
      [`${dau}-gone`],
    );

    customerId = (await client.query(`insert into customers (branch_id, full_name) values ($1,'Fixture BB-343') returning id`, [branchId])).rows[0].id;
    galleryId = (
      await client.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count, submitted_at)
         values ($1,$2,'Fixture BB-343','submitted',$3,'https://example.com/x',10, now()) returning id`,
        [branchId, customerId, `fixture-bb343-folder-${Date.now()}`],
      )
    ).rows[0].id;
    const linkId = (
      await client.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
         values ($1, md5(random()::text), 'bb343a', 'owner', 'active') returning id`,
        [galleryId],
      )
    ).rows[0].id;
    selectionId = (
      await client.query(
        `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, snapshot_extra_amount)
         values ($1,$2,true, now(), 0) returning id`,
        [galleryId, linkId],
      )
    ).rows[0].id;

    // Đơn đã đặt: đơn giá CHÉP từ list_price lúc đặt (đúng cách /api/g/addons và
    // dot-chon-server làm). Dòng 1: lượt chọn chính. Dòng 2: đợt mua thêm (dot = 2).
    await client.query(
      `insert into selection_addons (selection_id, product_id, quantity, unit_price, dot)
       select $1, id, 2, list_price, 1 from products where id = $2`,
      [selectionId, productId],
    );
    await client.query(
      `insert into selection_addons (selection_id, product_id, quantity, unit_price, dot)
       select $1, id, 1, list_price, 2 from products where id = $2`,
      [selectionId, productId],
    );
  });

  afterAll(async () => {
    // Trả sạch theo id / theo khoá thử — không đụng hàng nào khác.
    await client.query(`delete from selection_addons where selection_id = $1`, [selectionId]);
    await client.query(`delete from selections where gallery_id = $1`, [galleryId]);
    await client.query(`delete from share_links where gallery_id = $1`, [galleryId]);
    await client.query(`delete from galleries where id = $1`, [galleryId]);
    await client.query(`delete from customers where id = $1`, [customerId]);
    await client.query(`delete from products where lark_record_id like $1`, [`${dau}%`]);
    await client.query(`delete from settings where key = $1`, [KHOA_CAI_DAT_THU]);
    await client.end();
  });

  it("21. Đổi list_price bằng chính đường đồng bộ → tổng đơn cũ KHÔNG đổi; tính lại theo list_price thì sẽ đổi", async () => {
    expect(await tongSanPham()).toBe(300000); // 2×100.000 + 1×100.000

    dungLarkGia({ trang: [[dongLark(`${dau}-a`, "Fixture BB-343-Gỗ 40x60", { gia: 130000 })]] }); // Lark: giá mới 130.000, dòng "gone" vắng
    // 80%: 2 sản phẩm fixture có mã Lark, Lark trả 1 → 50% — đúng ra phải bị CHẶN.
    const chan = await dongBoGiaSanPham({ kho: khoChiFixture(), docLark: () => docBangSanPhamTuLark(ENV_LARK), ghi: true, nguon: "nut" });
    expect(chan.loi?.ma).toBe("DOC_QUA_IT");
    expect(await giaHienTai()).toBe(100000); // chốt 80% giữ nguyên giá

    // Lark trả cả hai dòng (cả hai còn tồn tại) → qua chốt; giá a đổi, b giữ.
    dungLarkGia({
      trang: [[dongLark(`${dau}-a`, "Fixture BB-343-Gỗ 40x60", { gia: 130000 }), dongLark(`${dau}-gone`, "Fixture BB-343-Sẽ biến mất", { gia: 50000 })]],
    });
    const kq = await dongBoGiaSanPham({ kho: khoChiFixture(), docLark: () => docBangSanPhamTuLark(ENV_LARK), ghi: true, nguon: "nut" });
    expect(kq.ok).toBe(true);
    expect(kq.doiGia).toEqual([{ ten: "Fixture BB-343-Gỗ 40x60", cu: 100000, moi: 130000 }]);
    expect(await giaHienTai()).toBe(130000); // giá niêm yết ĐÃ đổi thật

    expect(await tongSanPham()).toBe(300000); // đơn cũ giữ giá lúc đặt

    // Đổi tiếp thẳng bằng SQL (mô phỏng admin sửa tay): vẫn không đổi.
    await client.query("update products set list_price = 999000 where id = $1", [productId]);
    expect(await tongSanPham()).toBe(300000);

    // Kiểm ngược: nếu tổng bị TÍNH LẠI từ list_price (join products), nó sẽ ra số khác —
    // chứng tỏ phép thử trên phân biệt được hai cách tính.
    const tinhLai = Number(
      (
        await client.query(
          `select sum(sa.quantity * p.list_price) t from selection_addons sa join products p on p.id = sa.product_id where sa.selection_id = $1`,
          [selectionId],
        )
      ).rows[0].t,
    );
    expect(tinhLai).toBe(3 * 999000);
    expect(tinhLai).not.toBe(300000);
    await client.query("update products set list_price = 130000 where id = $1", [productId]);
  });

  it("22. Sản phẩm biến mất khỏi Lark bị TẮT, KHÔNG bị xoá; mốc 'gần nhất' ghi vào settings", async () => {
    // Lark trả 1 dòng nhưng 80% cần ≥ 2: thêm một sản phẩm fixture để tỉ lệ đạt. Dùng 5 dòng Lark / 5 mã.
    const phu = [] as string[];
    for (let i = 0; i < 3; i++) {
      const id = `${dau}-phu${i}`;
      phu.push(id);
      await client.query(`insert into products (name, kind, lark_record_id, is_active) values ($1,'print',$2,true)`, [`Fixture BB-343-phụ ${i}`, id]);
    }
    // 5 sản phẩm fixture có mã (a, gone, phu0-2). Lark trả 4 (thiếu "gone") = 80% → qua.
    dungLarkGia({
      trang: [[
        dongLark(`${dau}-a`, "Fixture BB-343-Gỗ 40x60", { gia: 130000 }),
        ...phu.map((id, i) => dongLark(id, `Fixture BB-343-phụ ${i}`)),
      ]],
    });
    const kq = await dongBoGiaSanPham({ kho: khoChiFixture(), docLark: () => docBangSanPhamTuLark(ENV_LARK), ghi: true, nguon: "cron" });
    expect(kq.ok).toBe(true);
    expect(kq.tatMatLark).toEqual(["Fixture BB-343-Sẽ biến mất"]);
    expect(kq.soTat).toBe(1);

    const { rows } = await client.query(`select is_active from products where lark_record_id = $1`, [`${dau}-gone`]);
    expect(rows).toHaveLength(1); // còn nguyên hàng — không xoá
    expect(rows[0].is_active).toBe(false);

    const { rows: s } = await client.query(`select value from settings where key = $1 and branch_id is null`, [KHOA_CAI_DAT_THU]);
    expect(s[0].value).toMatchObject({ nguon: "cron", soGiaDoi: 0 });
    expect(typeof s[0].value.luc).toBe("string");
  });
});
