/**
 * BB-377 — ảnh chỉnh sửa của ảnh MUA THÊM đi trọn vòng duyệt: phép thử đơn vị trên
 * ĐÚNG hàm thuần các route gọi (`theo-dot.ts`, `cong-khach.ts`).
 *
 *   1. Phân đợt: ảnh gốc thuộc đợt chọn thêm (BB-321) / yêu cầu người thân (BB-345)
 *      → tấm chỉnh ghép về đúng đợt, nhãn "Mua thêm đợt N", "đề xuất bởi <nhãn link>".
 *   2. Mốc gửi theo đợt: ảnh mua thêm chỉ lộ khi CSKH gửi ĐÚNG đợt đó; mốc chung
 *      (trong gói) không mở ảnh mua thêm; chưa áp 0095 → luật BB-371 cũ.
 *   3. Trạng thái vòng duyệt từng đợt + nút gửi.
 *   4. Đếm lần sửa theo BỘ (một cột Trạng Thái Lark cho cả bộ).
 */

import { describe, it, expect } from "vitest";
import {
  KHOA_TRONG_GOI,
  dungNhomMuaThem,
  gomTheoDot,
  guiDuocDotMuaThem,
  khachThayAnhChinhTheoDot,
  khoaCuaAnhGoc,
  laKhoaMuaThem,
  lanSuaKeTiep,
  mocGuiCuaKhoa,
  nhanCuaKhoa,
  trangThaiDuyetDot,
  type MocDot,
} from "@/lib/anh-chinh-sua/theo-dot";
import { trangThaiLarkTheoLanSua } from "@/lib/anh-chinh-sua/nhan-dien";

const YC = "0b6c2a8e-1d2f-4c3b-9a1e-2f3d4c5b6a70";

describe("BB-377 · phân đợt ảnh chỉnh", () => {
  const nhom = dungNhomMuaThem(
    [
      { soDot: 3, trangThai: "da_xac_nhan", anhIds: ["g5"] },
      { soDot: 2, trangThai: "cho_xac_nhan", anhIds: ["g3", "g4"] },
      { soDot: 4, trangThai: "tu_choi", anhIds: ["g6"] }, // đã trả về khách — không còn mua
    ],
    [
      { id: YC, loai: "chinh_sua", trangThai: "da_chot", anhIds: ["g7"], nhanLink: "Bà nội", coLink: true },
      { id: "x", loai: "chinh_sua", trangThai: "moi", anhIds: ["g8"], nhanLink: "Ông", coLink: true }, // chưa chốt mua
      { id: "y", loai: "san_pham", trangThai: "da_chot", anhIds: ["g9"], nhanLink: null, coLink: false }, // không phải chỉnh sửa
    ],
  );

  it("chỉ đợt đã mua (khoá) và yêu cầu chỉnh sửa đã chốt; đợt tăng dần trước, người thân sau", () => {
    expect(nhom.map((n) => n.khoa)).toEqual(["dot:2", "dot:3", `mt:${YC}`]);
    expect(nhom.map((n) => n.nhan)).toEqual(["Mua thêm đợt 2", "Mua thêm đợt 3", "Mua thêm (gia đình đề xuất)"]);
    expect(nhom[2]!.deXuatBoi).toBe("Bà nội");
    expect(nhom[0]!.deXuatBoi).toBeNull();
  });

  it("tấm chỉnh thuộc đợt của ẢNH GỐC nó ghép được; không ghép được / ảnh trong gói → Trong gói", () => {
    expect(khoaCuaAnhGoc("g4", nhom)).toBe("dot:2");
    expect(khoaCuaAnhGoc("g7", nhom)).toBe(`mt:${YC}`);
    expect(khoaCuaAnhGoc("g1", nhom)).toBe(KHOA_TRONG_GOI);
    expect(khoaCuaAnhGoc("g6", nhom)).toBe(KHOA_TRONG_GOI); // đợt bị từ chối
    expect(khoaCuaAnhGoc(null, nhom)).toBe(KHOA_TRONG_GOI);
    expect(nhanCuaKhoa("dot:3", nhom)).toBe("Mua thêm đợt 3");
    expect(nhanCuaKhoa(KHOA_TRONG_GOI, nhom)).toBe("Trong gói");
  });

  it("gom theo đợt giữ thứ tự Trong gói → đợt; bỏ nhóm rỗng", () => {
    const g = gomTheoDot(
      [
        { id: "a", khoa: "dot:3" },
        { id: "b", khoa: KHOA_TRONG_GOI },
        { id: "c", khoa: "dot:3" },
      ],
      nhom,
    );
    expect(g.map((x) => [x.khoa, x.anh.map((a) => a.id)])).toEqual([
      [KHOA_TRONG_GOI, ["b"]],
      ["dot:3", ["a", "c"]],
    ]);
  });

  it("khoá đợt: chỉ dot:N (N ≥ 2) hoặc mt:<uuid>", () => {
    expect(laKhoaMuaThem("dot:2")).toBe(true);
    expect(laKhoaMuaThem(`mt:${YC}`)).toBe(true);
    for (const x of ["goc", "dot:1", "dot:", "mt:abc", "dot:2;drop", null, 3]) expect(laKhoaMuaThem(x)).toBe(false);
  });
});

describe("BB-377 · mốc gửi theo đợt", () => {
  const mocChung = "2026-10-06T10:00:00Z";
  const mocDot = new Map<string, MocDot>([["dot:2", { guiLuc: "2026-10-06T12:00:00Z", duyetLuc: null }]]);

  it("ảnh mua thêm chưa gửi đợt của nó: khách KHÔNG thấy — dù có trước mốc gửi chung", () => {
    expect(
      khachThayAnhChinhTheoDot({ trangThaiBo: "approved", khoa: "dot:3", mocChung, mocDot, anhTaoLuc: "2026-10-06T09:00:00Z" }),
    ).toBe(false);
  });

  it("CSKH gửi đợt 2: tấm đợt 2 tạo trước mốc thấy, tấm về SAU mốc ẩn tới lượt gửi sau", () => {
    const v = { trangThaiBo: "approved", khoa: "dot:2", mocChung, mocDot };
    expect(khachThayAnhChinhTheoDot({ ...v, anhTaoLuc: "2026-10-06T11:59:00Z" })).toBe(true);
    expect(khachThayAnhChinhTheoDot({ ...v, anhTaoLuc: "2026-10-06T12:00:01Z" })).toBe(false);
  });

  it("bộ đã duyệt/đã giao vẫn xem được ảnh mua thêm đã gửi; bộ hết hạn/cất kho thì không", () => {
    const v = { khoa: "dot:2", mocChung, mocDot, anhTaoLuc: "2026-10-06T11:00:00Z" };
    expect(khachThayAnhChinhTheoDot({ ...v, trangThaiBo: "delivered" })).toBe(true);
    expect(khachThayAnhChinhTheoDot({ ...v, trangThaiBo: "expired" })).toBe(false);
    expect(khachThayAnhChinhTheoDot({ ...v, trangThaiBo: "archived" })).toBe(false);
  });

  it("ảnh trong gói vẫn đúng luật BB-371 (trạng thái bộ + mốc chung)", () => {
    const v = { khoa: KHOA_TRONG_GOI, mocChung, mocDot, anhTaoLuc: "2026-10-06T09:00:00Z" };
    expect(khachThayAnhChinhTheoDot({ ...v, trangThaiBo: "awaiting_approval" })).toBe(true);
    expect(khachThayAnhChinhTheoDot({ ...v, trangThaiBo: "in_retouch" })).toBe(false);
  });

  it("chưa áp 0095 (mocDot = null): mọi tấm đi luật cũ một mốc chung", () => {
    const v = { trangThaiBo: "awaiting_approval", khoa: "dot:3", mocChung, mocDot: null };
    expect(khachThayAnhChinhTheoDot({ ...v, anhTaoLuc: "2026-10-06T09:00:00Z" })).toBe(true);
    expect(khachThayAnhChinhTheoDot({ ...v, anhTaoLuc: "2026-10-06T11:00:00Z" })).toBe(false);
  });

  it("mốc tính 'chưa gửi' ở quản trị: đợt mua thêm theo mốc riêng, trong gói theo mốc chung", () => {
    expect(mocGuiCuaKhoa("dot:2", mocChung, mocDot)).toBe("2026-10-06T12:00:00Z");
    expect(mocGuiCuaKhoa("dot:3", mocChung, mocDot)).toBeNull();
    expect(mocGuiCuaKhoa(KHOA_TRONG_GOI, mocChung, mocDot)).toBe(mocChung);
    expect(mocGuiCuaKhoa("dot:3", mocChung, null)).toBe(mocChung);
  });
});

describe("BB-377 · vòng duyệt từng đợt", () => {
  const gui = "2026-10-06T12:00:00Z";
  it("chưa gửi / chờ duyệt / đang sửa / đã duyệt", () => {
    expect(trangThaiDuyetDot(undefined, false)).toBe("chua_gui");
    expect(trangThaiDuyetDot({ guiLuc: gui, duyetLuc: null }, false)).toBe("cho_duyet");
    expect(trangThaiDuyetDot({ guiLuc: gui, duyetLuc: null }, true)).toBe("dang_sua");
    expect(trangThaiDuyetDot({ guiLuc: gui, duyetLuc: "2026-10-06T13:00:00Z" }, false)).toBe("da_duyet");
    // Duyệt TRƯỚC lần gửi lại → lại chờ duyệt.
    expect(trangThaiDuyetDot({ guiLuc: gui, duyetLuc: "2026-10-06T11:00:00Z" }, false)).toBe("cho_duyet");
  });

  it("nút gửi đợt: có ảnh; chờ duyệt/đã duyệt thì phải có tấm mới; bộ đang chọn ảnh thì không", () => {
    const v = { trangThaiBo: "approved", soAnh: 2 };
    expect(guiDuocDotMuaThem({ ...v, soChuaGui: 2, trangThai: "chua_gui" })).toBe(true);
    expect(guiDuocDotMuaThem({ ...v, soChuaGui: 0, trangThai: "cho_duyet" })).toBe(false);
    expect(guiDuocDotMuaThem({ ...v, soChuaGui: 1, trangThai: "da_duyet" })).toBe(true);
    expect(guiDuocDotMuaThem({ ...v, soChuaGui: 0, trangThai: "dang_sua" })).toBe(true);
    expect(guiDuocDotMuaThem({ ...v, soAnh: 0, soChuaGui: 0, trangThai: "chua_gui" })).toBe(false);
    expect(guiDuocDotMuaThem({ trangThaiBo: "ready", soAnh: 2, soChuaGui: 2, trangThai: "chua_gui" })).toBe(false);
  });
});

describe("BB-377 · đếm lần sửa theo BỘ", () => {
  it("vòng mua thêm nối tiếp số lần của cả bộ → Lark 'Sửa lần N' trên dòng Hậu Kỳ của bộ", () => {
    // Bộ đã có 1 vòng trong gói; xin sửa đợt mua thêm là lần 2 — không phải lần 1 của đợt.
    const lan = lanSuaKeTiep([{ round: 1 }]);
    expect(lan).toBe(2);
    expect(trangThaiLarkTheoLanSua(lan)).toEqual({ ma: "optW0pvHGd", nhan: "Sửa lần 2" });
    expect(lanSuaKeTiep([])).toBe(1);
    expect(lanSuaKeTiep([{ round: 3 }, { round: 1 }, { round: null }])).toBe(4);
  });
});
