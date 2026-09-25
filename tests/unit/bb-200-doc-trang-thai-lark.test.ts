/**
 * BB-200 — dịch bản ghi Lark ra mã lựa chọn, và mốc "ở trạng thái này từ lúc nào".
 *
 * Dữ liệu cột bắt chước đúng hình dạng API trả (đo 25/09/2026): ô chọn-một trả
 * TÊN, ô trống thì khoá vắng hẳn.
 */
import { describe, it, expect } from "vitest";
import { dungBangMa, dichBanGhi, tinhMocTu, type CotLark } from "@/lib/lark/doc-trang-thai-lark";

const COT: CotLark[] = [
  { field_id: "f1", field_name: "Tên KH" },
  {
    // Cố ý đặt tên KHÁC "Trạng Thái": app phải tìm cột theo mã lựa chọn.
    field_id: "fTT",
    field_name: "Tình trạng hậu kỳ",
    property: {
      options: [
        { id: "optDAI9nFV", name: "Đã gửi file gốc" },
        { id: "optl5DyKLx", name: "Đã Chọn Hình" },
        { id: "optjJ9MNLL", name: "Đã Gửi Duyệt" },
      ],
    },
  },
  {
    field_id: "fNhac",
    field_name: "Trạng thái nhắc duyệt",
    property: { options: [{ id: "optX", name: "Đã nhắc" }] },
  },
  {
    field_id: "fCB",
    field_name: "Cảnh Báo",
    property: { options: [{ id: "optSj1R6PM", name: "An Toàn" }, { id: "optQEfwHOy", name: "Phải Xong Trong Ngày" }] },
  },
  { field_id: "fN", field_name: "Ngày chọn ảnh" },
];

describe("dungBangMa", () => {
  it("tìm cột trạng thái theo mã lựa chọn, không theo tên cột", () => {
    const b = dungBangMa(COT);
    expect(b.cotTrangThai).toBe("Tình trạng hậu kỳ");
    expect(b.cotCanhBao).toBe("Cảnh Báo");
    expect(b.cotNgay.get(2)).toBe("Ngày chọn ảnh");
  });
  it("không có cột trạng thái thì ném — không lặng lẽ coi mọi bộ là trống", () => {
    expect(() => dungBangMa(COT.filter((c) => c.field_id !== "fTT"))).toThrow(/optDAI9nFV/);
  });
});

describe("dichBanGhi", () => {
  const b = dungBangMa(COT);
  it("tên → mã, đọc cột ngày của đúng giai đoạn", () => {
    const d = dichBanGhi(
      { "Tình trạng hậu kỳ": "Đã Chọn Hình", "Cảnh Báo": "Phải Xong Trong Ngày", "Ngày chọn ảnh": 1790000000000 },
      1790300000000,
      b,
    );
    expect(d.maTrangThai).toBe("optl5DyKLx");
    expect(d.maCanhBao).toBe("optQEfwHOy");
    expect(d.ngayVaoGiaiDoan?.getTime()).toBe(1790000000000);
    expect(d.suaLuc?.getTime()).toBe(1790300000000);
  });
  it("ô trống (khoá vắng) → null, không vỡ", () => {
    const d = dichBanGhi({}, undefined, b);
    expect(d).toEqual({ maTrangThai: null, maCanhBao: null, ngayVaoGiaiDoan: null, suaLuc: null });
  });
  it("tên lạ không có trong danh sách lựa chọn → null (không đoán)", () => {
    expect(dichBanGhi({ "Tình trạng hậu kỳ": "Trạng thái mới toanh" }, undefined, b).maTrangThai).toBeNull();
  });
});

describe("tinhMocTu", () => {
  const bayGio = new Date("2026-09-25T01:00:00Z");
  const ngayCot = new Date("2026-09-01T00:00:00Z");
  const sua = new Date("2026-09-20T00:00:00Z");
  const moi = (ma: string | null) => ({ maTrangThai: ma, maCanhBao: null, ngayVaoGiaiDoan: ngayCot, suaLuc: sua });

  it("lần đầu thấy: lấy cột ngày của Lark, KHÔNG lấy bây giờ (không thì nhắc trễ cả chục ngày)", () => {
    expect(tinhMocTu({ lark_trang_thai: null, lark_trang_thai_tu: null }, moi("optl5DyKLx"), bayGio)).toEqual(ngayCot);
  });
  it("lần đầu thấy, không có cột ngày: lúc bản ghi sửa gần nhất", () => {
    const m = { ...moi("optmhzW4sL"), ngayVaoGiaiDoan: null };
    expect(tinhMocTu({ lark_trang_thai: null, lark_trang_thai_tu: null }, m, bayGio)).toEqual(sua);
  });
  it("không đổi: giữ mốc cũ", () => {
    const cu = new Date("2026-09-10T00:00:00Z");
    expect(tinhMocTu({ lark_trang_thai: "optl5DyKLx", lark_trang_thai_tu: cu }, moi("optl5DyKLx"), bayGio)).toEqual(cu);
  });
  it("đổi từ giá trị đã biết: bây giờ", () => {
    expect(
      tinhMocTu({ lark_trang_thai: "optl5DyKLx", lark_trang_thai_tu: ngayCot }, moi("optmhzW4sL"), bayGio),
    ).toEqual(bayGio);
  });
  it("Lark để trống trạng thái: null", () => {
    expect(tinhMocTu({ lark_trang_thai: "optl5DyKLx", lark_trang_thai_tu: ngayCot }, moi(null), bayGio)).toBeNull();
  });
});
