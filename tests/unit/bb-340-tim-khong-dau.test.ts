/**
 * BB-340 — ô chọn có tìm kiếm: gõ chữ, bỏ dấu, không phân biệt hoa thường.
 *
 * Canh hành vi của hàm lọc: nếu ai đó bỏ bước bỏ dấu (hoặc bước đổi hoa
 * thường, hoặc chữ đ) thì các ca dưới đây phải đỏ.
 */
import { describe, it, expect } from "vitest";
import { boDauVaHoa, locTheoChu } from "@/lib/utils/tim-khong-dau";

const nhan = (cacMuc: { label: string }[]) => cacMuc.map((m) => m.label);

describe("boDauVaHoa", () => {
  it("bỏ dấu và hạ chữ hoa", () => {
    expect(boDauVaHoa("Gỗ")).toBe("go");
    expect(boDauVaHoa("Nguyễn Thị Mai")).toBe("nguyen thi mai");
  });

  it("đổi cả đ và Đ thành d (NFD không tách được hai chữ này)", () => {
    expect(boDauVaHoa("Đã giao")).toBe("da giao");
    expect(boDauVaHoa("đồng bộ")).toBe("dong bo");
  });
});

describe("locTheoChu", () => {
  const sanPham = [
    { label: "Khung Gỗ 20x30" },
    { label: "Khung Nhôm 20x30" },
    { label: "Album Da 25x25" },
    { label: "Ảnh in Giấy Mỹ Thuật" },
    { label: "Đã giao" },
    { label: "Nguyễn Văn An" },
  ];

  it('gõ "go" ra "Gỗ" dù không gõ dấu', () => {
    expect(nhan(locTheoChu(sanPham, "go"))).toEqual(["Khung Gỗ 20x30"]);
  });

  it('gõ "nguyen" ra "Nguyễn", gõ hoa hay thường đều ra', () => {
    expect(nhan(locTheoChu(sanPham, "nguyen"))).toEqual(["Nguyễn Văn An"]);
    expect(nhan(locTheoChu(sanPham, "NGUYỄN"))).toEqual(["Nguyễn Văn An"]);
  });

  it('gõ "da" ra cả "Đã giao" lẫn "Album Da" (chữ đ khớp d)', () => {
    expect(nhan(locTheoChu(sanPham, "da"))).toEqual(["Album Da 25x25", "Đã giao"]);
  });

  it("nhiều từ: khớp đủ mọi từ, không cần đúng thứ tự", () => {
    expect(nhan(locTheoChu(sanPham, "30 khung"))).toEqual(["Khung Gỗ 20x30", "Khung Nhôm 20x30"]);
    expect(nhan(locTheoChu(sanPham, "30 go"))).toEqual(["Khung Gỗ 20x30"]);
  });

  it("gõ rỗng hoặc toàn khoảng trắng thì trả đủ danh sách theo thứ tự cũ", () => {
    expect(locTheoChu(sanPham, "")).toEqual(sanPham);
    expect(locTheoChu(sanPham, "   ")).toEqual(sanPham);
  });

  it("không có gì khớp thì trả mảng rỗng", () => {
    expect(locTheoChu(sanPham, "kim cuong")).toEqual([]);
  });
});
