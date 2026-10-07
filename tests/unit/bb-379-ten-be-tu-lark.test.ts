/**
 * BB-379 — chọn tên bé từ Lark khi tên thư mục không có. Hàm thuần, dữ liệu bịa theo đúng tên
 * cột thật đọc từ Lark ngày 06/10/2026 (Lịch Chụp: "HD Tổng"/"Tên Bé"; Khách Hàng: "Mã Khách Hàng"/
 * "Tên Bé 1"/"Tên bé 2"; Hậu Kỳ: "HĐ Tổng"/"Mã KH").
 *
 * Kiểm ngược: bỏ `if (lich && lich.size === 1) return …` → ca "lịch chụp một tên" đỏ; bỏ điều kiện
 * `kh.length === 1` → ca "nhà hai bé" đỏ (đoán tên bé 1 cho bộ của bé 2).
 */
import { describe, it, expect } from "vitest";
import { taoBoTraCuuTenBe, docChuoiO } from "@/lib/lark/ten-be-tu-lark";

const o = (text: string) => [{ text, type: "text" }];
const khach = (ma: string, be1: string, be2 = "") => ({
  fields: { "Mã Khách Hàng": o(ma), "Tên Bé 1": be1, "Tên bé 2": be2 },
});
const lich = (hd: string, be: string) => ({ fields: { "HD Tổng": hd, "Tên Bé": o(be) } });
const hauKy = (hd: string, ma: string) => ({ "HĐ Tổng": hd, "Mã KH": o(ma) });

describe("BB-379: tên bé từ Lark", () => {
  it("docChuoiO đọc đủ các hình dạng ô", () => {
    expect(docChuoiO(null)).toBe("");
    expect(docChuoiO("  Mít ")).toBe("Mít");
    expect(docChuoiO(o("Mít"))).toBe("Mít");
    expect(docChuoiO([{ text: "Bảo " }, { text: "An" }])).toBe("Bảo An");
  });

  it("tên trong ngoặc của thư mục thắng mọi nguồn khác", () => {
    const b = taoBoTraCuuTenBe({ khachHang: [khach("K1", "Bé Khác")], lichChup: [lich("HD1", "Bé Khác")] });
    expect(b.tra(hauKy("HD1", "K1"), "Bảo An")).toEqual({ ten: "Bảo An", nguon: "thu_muc", moHo: false });
  });

  it("lịch chụp có đúng một tên cho hợp đồng → dùng", () => {
    const b = taoBoTraCuuTenBe({ khachHang: [khach("K1", "Bé A", "Bé B")], lichChup: [lich("HD1", "Bé B"), lich("HD1", "Bé B")] });
    expect(b.tra(hauKy("HD1", "K1"))).toEqual({ ten: "Bé B", nguon: "lich_chup", moHo: false });
  });

  it("lịch chụp có hai tên khác nhau cho một hợp đồng → để trống (mơ hồ), KHÔNG rơi xuống Khách Hàng", () => {
    const b = taoBoTraCuuTenBe({ khachHang: [khach("K1", "Bé A")], lichChup: [lich("HD1", "Bé A"), lich("HD1", "Bé B")] });
    expect(b.tra(hauKy("HD1", "K1"))).toEqual({ ten: null, nguon: null, moHo: true });
  });

  it("không có lịch chụp: nhà MỘT bé → dùng; nhà HAI bé → để trống (không biết bộ của bé nào)", () => {
    const b = taoBoTraCuuTenBe({ khachHang: [khach("K1", "Bé A"), khach("K2", "Bé A", "Bé B")], lichChup: [] });
    expect(b.tra(hauKy("HDx", "K1"))).toEqual({ ten: "Bé A", nguon: "khach_hang", moHo: false });
    expect(b.tra(hauKy("HDx", "K2"))).toEqual({ ten: null, nguon: null, moHo: true });
  });

  it("không có gì trên Lark → trống, không mơ hồ; khoảng trắng thừa được gọn", () => {
    const b = taoBoTraCuuTenBe({ khachHang: [khach("K1", "  Bảo   An ")], lichChup: [] });
    expect(b.tra(hauKy("HDx", "K9"))).toEqual({ ten: null, nguon: null, moHo: false });
    expect(b.tra(hauKy("HDx", "K1")).ten).toBe("Bảo An");
  });
});
