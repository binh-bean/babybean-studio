/**
 * BB-395 — phép thử THUẦN: đối chiếu hoá đơn, khách, gợi ý bộ, và SỐ TIỀN/HẠN MỨC sau khi
 * xác nhận bằng hoá đơn (khớp / thừa / thiếu / hoá đơn bổ sung / đồng bộ lại cùng mã).
 * Không mạng, không cơ sở dữ liệu.
 */
import { describe, expect, it } from "vitest";
import {
  HOA_DON_FIXTURE,
  KHOA_KHACH_FIXTURE,
  KHOA_KHACH_FIXTURE_KHAC,
  chuanHoaMaHoaDon,
  type HoaDonChuan,
} from "@/lib/hoa-don/nguon-hoa-don";
import {
  chiaTienTheoPhieuThu,
  doiChieuHoaDon,
  dotTinhVaoPhaiThu,
  ghiChuDongSo,
  type DotApp,
  goiYBoAnhChoHoaDon,
  hauKyLechBo,
  kiemDieuKienHoaDon,
  kiemKhachHoaDon,
  tienGhiSoChoHoaDon,
  type PhatSinhApp,
} from "@/lib/hoa-don/doi-chieu-hoa-don";
import { tinhTienHoaDon } from "@/lib/hoa-don/han-muc-hoa-don";
import { demAnhDot1 } from "@/lib/gallery/dot-chon";
import {
  soAnhHanMucTheoThanhToan,
  tienVuotHanMucConPhaiThu,
  tongPhaiThuCuaBo,
} from "@/lib/gallery/tien-phat-sinh";

const hd = (so: string): HoaDonChuan => {
  const h = HOA_DON_FIXTURE[`HD_20990101#${so}`];
  if (!h) throw new Error(`Thiếu hoá đơn giả ${so}`);
  return structuredClone(h);
};
const app = (p: Partial<PhatSinhApp>): PhatSinhApp => ({ fileVuot: 0, fileMuaThem: 0, giaMotFile: 50_000, sanPham: [], ...p });

describe("BB-395 mã hoá đơn", () => {
  it("chuẩn hoá chữ thường/khoảng trắng, từ chối sai dạng", () => {
    expect(chuanHoaMaHoaDon(" hd_20260910#5071 ")).toBe("HD_20260910#5071");
    expect(chuanHoaMaHoaDon("HD_20260910#5071_12648")).toBeNull();
    expect(chuanHoaMaHoaDon("THU-20261002#10691")).toBeNull();
  });
});

describe("BB-395 điều kiện hoá đơn", () => {
  it("đủ: có phiếu thu + Còn Lại = 0", () => {
    expect(kiemDieuKienHoaDon(hd("9001"))).toEqual({ duDieuKien: true, lyDo: [], canhBao: [] });
  });
  it("chưa có phiếu thu → không đủ, nói rõ", () => {
    const k = kiemDieuKienHoaDon(hd("9005"));
    expect(k.duDieuKien).toBe(false);
    expect(k.lyDo.join(" ")).toMatch(/chưa có phiếu thu/);
  });
  it("còn nợ → không đủ, nói số tiền còn phải thu", () => {
    const k = kiemDieuKienHoaDon(hd("9006"));
    expect(k.duDieuKien).toBe(false);
    expect(k.lyDo.join(" ")).toContain("còn phải thu 100.000 ₫");
  });
  it("thu dư → vẫn đủ, kèm cảnh báo", () => {
    const k = kiemDieuKienHoaDon(hd("9008"));
    expect(k.duDieuKien).toBe(true);
    expect(k.canhBao.join(" ")).toContain("thu dư 50.000 ₫");
  });
});

describe("BB-395 khách của hoá đơn (điều kiện cứng)", () => {
  it("cùng khoá khách → khớp", () => {
    expect(kiemKhachHoaDon(hd("9001"), KHOA_KHACH_FIXTURE)).toBe("khop");
  });
  it("khách khác → chặn", () => {
    expect(kiemKhachHoaDon(hd("9007"), KHOA_KHACH_FIXTURE)).toBe("khac_khach");
  });
  it("khách của bộ không có khoá Lark (tạo tay) → không tự xác nhận", () => {
    expect(kiemKhachHoaDon(hd("9001"), null)).toBe("bo_chua_co_khoa");
    expect(kiemKhachHoaDon(hd("9001"), "  ")).toBe("bo_chua_co_khoa");
  });
  it("link Hậu Kỳ trỏ bộ khác → cảnh báo; trỏ đúng / không có link → không", () => {
    const h = hd("9001");
    h.maHauKyNguon = ["recA", "recB"];
    expect(hauKyLechBo(h, "recC")).toBe(true);
    expect(hauKyLechBo(h, "recB")).toBe(false);
    expect(hauKyLechBo({ ...h, maHauKyNguon: [] }, "recC")).toBe(false);
  });
});

describe("BB-395 đối chiếu từng mục", () => {
  it("khớp: hoá đơn 26 file, khách vượt 26", () => {
    const kq = doiChieuHoaDon([hd("9001")], app({ fileVuot: 26 }));
    expect(kq.trangThai).toBe("khop");
    expect(kq.muc).toHaveLength(1); // dòng "Dịch vụ Hậu Kỳ" 0 đồng KHÔNG đối chiếu
    expect(kq.muc[0]).toMatchObject({ trenHoaDon: 26, khachChon: 26, chenh: 0, trangThai: "khop" });
    expect(kq.fileNangHanMuc).toBe(26);
  });
  it("thừa: HĐ 5 file, khách chọn 3 → còn 2 ảnh đã trả", () => {
    const kq = doiChieuHoaDon([hd("9003")], app({ fileVuot: 3 }));
    expect(kq.trangThai).toBe("thua");
    expect(kq.fileDaTraConLai).toBe(2);
    expect(kq.tienThieu).toBe(0);
  });
  it("thiếu: HĐ 2 file, khách chọn 3 → chờ 1 file = 50.000", () => {
    const kq = doiChieuHoaDon([hd("9002")], app({ fileVuot: 3 }));
    expect(kq.trangThai).toBe("thieu");
    expect(kq.muc[0]).toMatchObject({ chenh: -1, tienThieu: 50_000 });
    expect(kq.tienThieu).toBe(50_000);
  });
  it("nhiều hoá đơn cộng dồn: 2 + 1 file = 3 → khớp", () => {
    const kq = doiChieuHoaDon([hd("9002"), hd("9004")], app({ fileVuot: 3 }));
    expect(kq.trangThai).toBe("khop");
    expect(kq.fileHoaDon).toBe(3);
  });
  it("file hoá đơn trả trước cho 'Edit file' đã mua trên app, phần còn lại mới nâng hạn mức", () => {
    const kq = doiChieuHoaDon([hd("9003")], app({ fileVuot: 3, fileMuaThem: 2 }));
    expect(kq.trangThai).toBe("khop");
    expect(kq.fileChoMuaThem).toBe(2);
    expect(kq.fileNangHanMuc).toBe(3);
  });
  it("sản phẩm có trên HĐ mà app chưa có → 'them' (app tự thêm), không tính thiếu", () => {
    const h = hd("9002");
    h.dong.push({ maDong: `${h.ma}_777`, loai: "san_pham", idSanPhamNguon: "recAlbum", tenSanPham: "Album 20x30", soLuong: 1, thanhTien: 900_000 });
    const kq = doiChieuHoaDon([h], app({ fileVuot: 2 }));
    expect(kq.trangThai).toBe("khop");
    expect(kq.sanPhamThemVao).toEqual([{ idSanPhamNguon: "recAlbum", ten: "Album 20x30", soLuong: 1 }]);
    expect(kq.muc.find((m) => m.loai === "san_pham")?.trangThai).toBe("them");
  });
  it("app có sản phẩm mà HĐ không có → thiếu, kèm tiền và id để 'Bỏ'", () => {
    const kq = doiChieuHoaDon(
      [hd("9002")],
      app({ fileVuot: 2, sanPham: [{ productId: "p-khung", idSanPhamNguon: "recKhung", ten: "Khung", soLuong: 2, donGia: 300_000 }] }),
    );
    expect(kq.trangThai).toBe("thieu");
    const m = kq.muc.find((x) => x.loai === "san_pham");
    expect(m).toMatchObject({ productId: "p-khung", chenh: -2, tienThieu: 600_000 });
  });
  it("thừa file + thiếu sản phẩm → hỗn hợp", () => {
    const kq = doiChieuHoaDon(
      [hd("9003")],
      app({ fileVuot: 1, sanPham: [{ productId: "p", idSanPhamNguon: "recX", ten: "UV", soLuong: 1, donGia: 100_000 }] }),
    );
    expect(kq.trangThai).toBe("hon_hop");
  });
});

describe("BB-395 tiền ghi sổ và chia theo phiếu thu", () => {
  it("chỉ tiền 'Edit file' khi cờ sản phẩm tắt; chia đúng phiếu, đúng phương thức", () => {
    const h = hd("9001");
    h.dong.push({ maDong: `${h.ma}_9`, loai: "san_pham", idSanPhamNguon: "recA", tenSanPham: "Album", soLuong: 1, thanhTien: 500_000 });
    expect(tienGhiSoChoHoaDon(h, false)).toEqual({ tienFile: 1_300_000, tienSanPham: 0, tong: 1_300_000 });
    expect(tienGhiSoChoHoaDon(h, true).tong).toBe(1_800_000);
    const h2: HoaDonChuan = { ...h, phieuThu: [
      { ma: "THU-1", soTien: 1_000_000, phuongThuc: "tien_mat", phuongThucGoc: "Tiền Mặt", ngay: null },
      { ma: "THU-2", soTien: 800_000, phuongThuc: "chuyen_khoan", phuongThucGoc: "Chuyển Khoản", ngay: null },
    ] };
    expect(chiaTienTheoPhieuThu(h2, 1_300_000)).toEqual([
      { maPhieuThu: "THU-1", soTien: 1_000_000, phuongThuc: "tien_mat" },
      { maPhieuThu: "THU-2", soTien: 300_000, phuongThuc: "chuyen_khoan" },
    ]);
  });
});

describe("BB-395 gợi ý bộ ảnh (một khách nhiều bộ)", () => {
  const bo = (id: string, p: { hauKy?: string; file?: number; khach?: string }) => ({
    galleryId: id,
    tieuDe: id,
    khoaKhach: p.khach ?? KHOA_KHACH_FIXTURE,
    maHauKy: p.hauKy ?? null,
    fileCho: p.file ?? 0,
    sanPhamCho: {},
  });
  it("ưu tiên bộ có dòng Hậu Kỳ mà hoá đơn trỏ tới", () => {
    const h = { ...hd("9002"), maHauKyNguon: ["recHK2"] };
    const kq = goiYBoAnhChoHoaDon(h, [bo("g1", { hauKy: "recHK1", file: 2 }), bo("g2", { hauKy: "recHK2", file: 7 })]);
    expect(kq.goiY).toBe("g2");
    expect(kq.ds).toHaveLength(2);
  });
  it("không có Hậu Kỳ → bộ có số file chờ bằng số file hoá đơn", () => {
    const kq = goiYBoAnhChoHoaDon(hd("9003"), [bo("g1", { file: 2 }), bo("g2", { file: 5 })]);
    expect(kq.goiY).toBe("g2");
  });
  it("bộ của khách khác bị loại khỏi danh sách", () => {
    const kq = goiYBoAnhChoHoaDon(hd("9002"), [bo("g1", { file: 2, khach: KHOA_KHACH_FIXTURE_KHAC })]);
    expect(kq.ds).toEqual([]);
    expect(kq.goiY).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Số tiền + hạn mức sau xác nhận: mô phỏng đúng các công thức app đang dùng.
// ---------------------------------------------------------------------------

const CHOT = "2099-01-01T08:00:00.000Z";
const SAU_CHOT = "2099-01-02T08:00:00.000Z";

/**
 * Bộ ảnh: hạn mức gốc Q0, khách chọn S, giá ảnh `gia`. `chot` = khách đã chốt TRƯỚC khi xác nhận
 * hoá đơn (có `snapshot_extra_amount`). `hoaDon` = các dòng "Edit file" app đã thêm từ hoá đơn
 * + tiền đã ghi sổ của hoá đơn. Trả đúng các số mà `layTienCanThu` + BB-348 tính ra.
 */
function moPhong(p: { Q0: number; S: number; gia: number; chot: boolean; hoaDon: { file: number; tien: number }[] }) {
  const H = p.hoaDon.reduce((s, h) => s + h.file, 0);
  const ghiCo = p.hoaDon.reduce((s, h) => s + h.tien, 0);
  const hanMuc = p.Q0 + H;
  const anhVuotChuaThu = Math.max(0, p.S - hanMuc); // v_over_quota_unbilled.unbilled_count
  const tienTheoAnh = anhVuotChuaThu * p.gia;
  const soAnhLucChot = p.chot ? Math.max(0, p.S - p.Q0) : 0;
  const tienLucChot = soAnhLucChot * p.gia;
  const hd = tinhTienHoaDon(
    p.hoaDon.map((h) => ({ quantity: h.file, lineTotal: h.tien, createdAt: SAU_CHOT, laAnhChinh: true })),
    { chotLuc: p.chot ? CHOT : null, soAnhLucChot, tienLucChot },
    ghiCo,
  );
  const quyDoi = { tatCa: 0, truocChot: 0, hoaDon: hd };
  const tong = tongPhaiThuCuaBo({ tienTheoAnh, tienLucChot, tienDotMuaThem: 0, quyDoi });
  const conThieuVuot = tienVuotHanMucConPhaiThu({ tienTheoAnh, tienLucChot, daGhiCo: ghiCo, quyDoi });
  // BB-348 chạy ở lần ghi sổ TAY kế tiếp: nó phải KHÔNG thêm hạn mức cho phần hoá đơn đã nâng.
  const hanMucThemBoiBB348 = soAnhHanMucTheoThanhToan({
    anhVuotGoc: anhVuotChuaThu,
    conThieuVuot,
    giaMotAnh: tienLucChot > 0 && soAnhLucChot > 0 ? tienLucChot / soAnhLucChot : p.gia,
  });
  return { hanMuc, conLaiDeChon: Math.max(0, hanMuc - p.S), conThieu: tong - ghiCo, conThieuVuot, hanMucThemBoiBB348 };
}

describe("BB-395 tiền + hạn mức sau xác nhận bằng hoá đơn (không cộng hai lần)", () => {
  for (const chot of [false, true]) {
    const nhan = chot ? "khách đã chốt trước" : "chưa chốt";
    it(`khớp (${nhan}): HĐ 10 file, khách vượt 10 → hạn mức +10, còn phải thu 0`, () => {
      const r = moPhong({ Q0: 30, S: 40, gia: 50_000, chot, hoaDon: [{ file: 10, tien: 500_000 }] });
      expect(r).toMatchObject({ hanMuc: 40, conThieu: 0, conThieuVuot: 0, hanMucThemBoiBB348: 0 });
    });
    it(`thừa (${nhan}): HĐ 10, khách vượt 7 → hạn mức +10, còn 3 ảnh đã trả, KHÔNG báo trả dư`, () => {
      const r = moPhong({ Q0: 30, S: 37, gia: 50_000, chot, hoaDon: [{ file: 10, tien: 500_000 }] });
      expect(r).toMatchObject({ hanMuc: 40, conLaiDeChon: 3, conThieu: 0, conThieuVuot: 0, hanMucThemBoiBB348: 0 });
    });
    it(`thiếu (${nhan}): HĐ 10, khách vượt 12 → hạn mức +10, còn phải thu đúng 2 ảnh`, () => {
      const r = moPhong({ Q0: 30, S: 42, gia: 50_000, chot, hoaDon: [{ file: 10, tien: 500_000 }] });
      expect(r).toMatchObject({ hanMuc: 40, conThieu: 100_000, conThieuVuot: 100_000, hanMucThemBoiBB348: 0 });
    });
    it(`gán HĐ bổ sung (${nhan}): 10 + 2 file → khớp, còn phải thu 0`, () => {
      const r = moPhong({ Q0: 30, S: 42, gia: 50_000, chot, hoaDon: [{ file: 10, tien: 500_000 }, { file: 2, tien: 100_000 }] });
      expect(r).toMatchObject({ hanMuc: 42, conThieu: 0, conThieuVuot: 0, hanMucThemBoiBB348: 0 });
    });
    it(`giá trên hoá đơn khác giá ảnh (giảm giá) (${nhan}) → vẫn 0, không lệch`, () => {
      const r = moPhong({ Q0: 30, S: 40, gia: 50_000, chot, hoaDon: [{ file: 10, tien: 450_000 }] });
      expect(r.conThieu).toBe(0);
      expect(r.conThieuVuot).toBe(0);
    });
  }
  it("đồng bộ lại lần 2 cùng mã: cùng dòng (unique), cùng sổ → cùng số", () => {
    const lan1 = moPhong({ Q0: 30, S: 40, gia: 50_000, chot: true, hoaDon: [{ file: 10, tien: 500_000 }] });
    const lan2 = moPhong({ Q0: 30, S: 40, gia: 50_000, chot: true, hoaDon: [{ file: 10, tien: 500_000 }] });
    expect(lan2).toEqual(lan1);
  });
  it("vòng 2: 'Edit file' mua thêm được hoá đơn phủ (dòng giỏ đánh dấu, bỏ khỏi Phải thu) → còn phải thu 0", () => {
    // Giỏ đợt 1 có Edit file × 2 (app 2 × 50.000); hoá đơn trả 2 file giá 45.000 = 90.000.
    const hd = tinhTienHoaDon([], { chotLuc: null, soAnhLucChot: 0, tienLucChot: 0 }, 90_000);
    const quyDoi = { tatCa: 0, truocChot: 0, hoaDon: hd };
    // Dòng giỏ đã đánh dấu `ma_hoa_don` → `layTienCanThu` không cộng 100.000 vào tienDotMuaThem.
    const tong = tongPhaiThuCuaBo({ tienTheoAnh: 0, tienLucChot: 0, tienDotMuaThem: 0, quyDoi });
    expect(tong - 90_000).toBe(0);
  });
  it("tiền hoá đơn cho 'Edit file' mua thêm trên app không trừ vào phần vượt", () => {
    // 2 ảnh vượt chưa trả; hoá đơn 3 file chỉ dành cho "Edit file" khách mua thêm (không nâng hạn mức).
    const hd = tinhTienHoaDon([], { chotLuc: null, soAnhLucChot: 0, tienLucChot: 0 }, 150_000);
    const conThieuVuot = tienVuotHanMucConPhaiThu({ tienTheoAnh: 100_000, tienLucChot: 0, daGhiCo: 150_000, quyDoi: { tatCa: 0, truocChot: 0, hoaDon: hd } });
    expect(conThieuVuot).toBe(100_000);
  });
});

// ---------------------------------------------------------------------------
// Vòng 2 — đợt mua thêm (đợt ≥ 2): hoá đơn trả tien_anh (+ sản phẩm) của đợt, KHÔNG nâng hạn mức.
// ---------------------------------------------------------------------------

const dotApp = (soDot: number, soAnh: number, p: Partial<DotApp> = {}): DotApp => ({
  roundId: `r${soDot}`,
  soDot,
  soAnh,
  tienAnh: soAnh * 50_000,
  tienSanPham: 0,
  sanPham: [],
  daXacNhan: false,
  ...p,
});
const hdFile = (file: number, them: Partial<HoaDonChuan> = {}): HoaDonChuan => ({
  ...hd("9001"),
  dong: [{ maDong: "HD_20990101#9001_1", loai: "file_chinh", idSanPhamNguon: "FX", tenSanPham: "Edit file", soLuong: file, thanhTien: file * 45_000 }],
  ...them,
});

describe("BB-395 vòng 2: chia hoá đơn cho đợt 1 rồi các đợt (đợt cũ trước)", () => {
  it("một hoá đơn trả cả đợt 1 vượt 2 lẫn đợt 2 (3 ảnh) → khớp; chỉ 2 file nâng hạn mức", () => {
    const kq = doiChieuHoaDon([hdFile(5)], app({ fileVuot: 2, dot: [dotApp(2, 3)] }));
    expect(kq.trangThai).toBe("khop");
    expect(kq.dotDaTra).toEqual([{ roundId: "r2", soDot: 2 }]);
    expect(kq.fileNangHanMuc).toBe(2);
    expect(kq.fileChoDot).toBe(3);
  });
  it("thiếu 1 cho đợt 2 → đợt 2 CHƯA trả (đủ hoặc không), phần dư KHÔNG nâng hạn mức", () => {
    const kq = doiChieuHoaDon([hdFile(4)], app({ fileVuot: 2, dot: [dotApp(2, 3)] }));
    expect(kq.trangThai).toBe("thieu");
    expect(kq.dotDaTra).toEqual([]);
    expect(kq.dotThieu).toEqual([{ roundId: "r2", soDot: 2, anhThieu: 1 }]);
    expect(kq.fileNangHanMuc).toBe(2);
    expect(kq.muc.find((m) => m.khoa === "dot:2")).toMatchObject({ trenHoaDon: 2, khachChon: 3, tienThieu: 50_000 });
  });
  it("đợt sau không được trả trước đợt trước dù vừa đủ", () => {
    const kq = doiChieuHoaDon([hdFile(3)], app({ dot: [dotApp(3, 1), dotApp(2, 5)] }));
    expect(kq.dotDaTra).toEqual([]);
    expect(kq.dotThieu.map((d) => d.soDot)).toEqual([2, 3]);
  });
  it("mọi đợt đủ, còn dư → phần dư nâng hạn mức đợt 1 (Thừa)", () => {
    const kq = doiChieuHoaDon([hdFile(8)], app({ fileVuot: 2, dot: [dotApp(2, 3), dotApp(3, 2)] }));
    expect(kq.trangThai).toBe("thua");
    expect(kq.dotDaTra.map((d) => d.soDot)).toEqual([2, 3]);
    expect(kq.fileNangHanMuc).toBe(3);
    expect(kq.fileDaTraConLai).toBe(1);
  });
  it("đợt có sản phẩm mà hoá đơn không có sản phẩm đó → đợt thiếu", () => {
    const sp = { productId: "p-uv", idSanPhamNguon: "recUV", ten: "UV", soLuong: 1, donGia: 200_000 };
    const kq = doiChieuHoaDon([hdFile(3)], app({ dot: [dotApp(2, 3, { sanPham: [sp], tienSanPham: 200_000 })] }));
    expect(kq.dotDaTra).toEqual([]);
    expect(kq.muc.find((m) => m.khoa === "dot:2")?.tienThieu).toBe(200_000);
  });
  it("yêu cầu mua thêm (không đơn giá) → tiền thiếu theo giá niêm yết, có ghi chú", () => {
    const kq = doiChieuHoaDon(
      [hdFile(0)],
      app({ sanPham: [{ productId: "p", idSanPhamNguon: "recK", ten: "Khung", soLuong: 1, donGia: 350_000, ghiChuGia: "giá niêm yết" }] }),
    );
    expect(kq.muc.find((m) => m.loai === "san_pham")).toMatchObject({ tienThieu: 350_000, ghiChu: "giá niêm yết" });
  });
  it("phiếu thu phương thức lạ → ghi chuyen_khoan, ghi chú mang phương thức gốc", () => {
    const h = hdFile(2, { phieuThu: [{ ma: "THU-1", soTien: 90_000, phuongThuc: "khac", phuongThucGoc: "Quẹt thẻ", ngay: null }] });
    const [phan] = chiaTienTheoPhieuThu(h, 90_000);
    expect(phan).toMatchObject({ phuongThuc: "chuyen_khoan", phuongThucGoc: "Quẹt thẻ" });
    expect(ghiChuDongSo(h.ma, phan!)).toBe(`Xác nhận bằng hoá đơn ${h.ma} (phương thức gốc: Quẹt thẻ)`);
  });
});

describe("BB-395 vòng 3: vượt hạn mức chỉ đếm ảnh đợt 1", () => {
  it("bộ không vượt đợt 1 (10/10) + đợt 2 chọn 2 ảnh → ảnh đợt 1 = 10 → vượt 0; tiền đợt 2 = tien_anh một lần", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => ({ photo_id: `p${i}`, dot: 1 })),
      { photo_id: "q1", dot: 2 },
      { photo_id: "q2", dot: 2 },
    ];
    const soDot1 = demAnhDot1(rows);
    expect(soDot1).toBe(10);
    const vuot = Math.max(0, soDot1 - 10);
    expect(vuot).toBe(0);
    const tienDot = dotTinhVaoPhaiThu([{ trangThai: "da_xac_nhan", maHoaDon: null, tienAnh: 100_000 }]).reduce((s, d) => s + d.tienAnh, 0);
    expect(tongPhaiThuCuaBo({ tienTheoAnh: vuot * 50_000, tienLucChot: 0, tienDotMuaThem: tienDot })).toBe(100_000);
  });
  it("mỗi ảnh một lần (hai người cùng chọn); dòng thiếu cột dot = đợt 1", () => {
    expect(demAnhDot1([{ photo_id: "a", dot: 1 }, { photo_id: "a", dot: 1 }, { photo_id: "b" }, { photo_id: "c", dot: 3 }])).toBe(2);
  });
});

describe("BB-395 vòng 2: tien_anh của đợt KHÔNG bị đòi hai lần", () => {
  /** Mô phỏng `layTienCanThu` cho một bộ: đợt 1 vượt `vuot1` (đã chốt), các đợt, sổ hoá đơn. */
  function conThieu(p: {
    vuot1: number;
    dot: { trangThai: string; maHoaDon: string | null; tienAnh: number }[];
    quotaHoaDon: { file: number; tien: number }[];
    soHoaDon: number;
  }) {
    const tienLucChot = p.vuot1 * 50_000;
    const hdTien = tinhTienHoaDon(
      p.quotaHoaDon.map((h) => ({ quantity: h.file, lineTotal: h.tien, createdAt: SAU_CHOT, laAnhChinh: true })),
      { chotLuc: CHOT, soAnhLucChot: p.vuot1, tienLucChot },
      p.soHoaDon,
    );
    const tienDotMuaThem = dotTinhVaoPhaiThu(p.dot).reduce((s, d) => s + d.tienAnh, 0);
    const tong = tongPhaiThuCuaBo({ tienTheoAnh: 0, tienLucChot, tienDotMuaThem, quyDoi: { tatCa: 0, truocChot: 0, hoaDon: hdTien } });
    return tong - p.soHoaDon;
  }
  it("đợt 2 (3 ảnh × 50.000) trả bằng hoá đơn 135.000 → xác nhận → còn phải thu 0", () => {
    expect(conThieu({ vuot1: 0, dot: [{ trangThai: "da_xac_nhan", maHoaDon: "HD_X", tienAnh: 150_000 }], quotaHoaDon: [], soHoaDon: 135_000 })).toBe(0);
  });
  it("…rồi ai đó bấm 'Xác nhận đợt' theo đường cũ (đợt vẫn da_xac_nhan, dấu còn) → vẫn 0", () => {
    const sauDuongCu = [{ trangThai: "da_xac_nhan", maHoaDon: "HD_X", tienAnh: 150_000 }];
    expect(conThieu({ vuot1: 0, dot: sauDuongCu, quotaHoaDon: [], soHoaDon: 135_000 })).toBe(0);
  });
  it("một hoá đơn trả đợt 1 vượt 2 (nâng hạn mức) + đợt 2 → 0; đợt 3 chưa trả, đã xác nhận → còn đúng tiền đợt 3", () => {
    const dot = [
      { trangThai: "da_xac_nhan", maHoaDon: "HD_X", tienAnh: 150_000 },
      { trangThai: "da_xac_nhan", maHoaDon: null, tienAnh: 100_000 },
    ];
    expect(conThieu({ vuot1: 2, dot, quotaHoaDon: [{ file: 2, tien: 90_000 }], soHoaDon: 90_000 + 135_000 })).toBe(100_000);
  });
  it("gỡ gán (dòng đính chính âm, bỏ dấu đợt) → đợt quay lại Phải thu đúng tiền app", () => {
    expect(conThieu({ vuot1: 0, dot: [{ trangThai: "da_xac_nhan", maHoaDon: null, tienAnh: 150_000 }], quotaHoaDon: [], soHoaDon: 0 })).toBe(150_000);
  });
});
