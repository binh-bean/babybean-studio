/**
 * BB-279 — phép thử đơn vị cho bộ dựng cấu hình cửa hàng (nhóm → kích thước
 * → chất liệu → sản phẩm). Dữ liệu hoàn toàn giả (`Fixture BB-279 …`), không
 * đọc mã nguồn, không giả lập hook React — chỉ gọi thẳng hàm thuần với mảng
 * giả lập `gallery.addons.catalogue`.
 *
 * Thước đo (AGENTS.md §5a): mỗi test ở đây phải đỏ nếu hoàn nguyên bản vá.
 * Đã tự hoàn nguyên `chonSanPham` về "lấy phần tử đầu tiên khớp" (bỏ sắp giá)
 * và test "khớp nhiều sản phẩm" đỏ đúng như dự kiến trước khi vá lại.
 */

import { describe, it, expect } from "vitest";
import {
  nhomCoHang,
  kichThuocCuaNhom,
  chatLieuTheoKichThuoc,
  chatLieuCuaNhom,
  kichThuocTheoChatLieu,
  chonSanPham,
  type SanPhamCuaHang,
} from "@/lib/products/cau-hinh-cua-hang";

function sp(overrides: Partial<SanPhamCuaHang> & { productId: string }): SanPhamCuaHang {
  return {
    name: "Fixture BB-279 sản phẩm",
    material: null,
    size: null,
    unitPrice: 100000,
    nhom: "anh_in",
    canGanAnh: true,
    ...overrides,
  };
}

describe("BB-279: nhomCoHang", () => {
  it("chỉ trả nhóm đang có hàng, đúng thứ tự anh_in → album → khung", () => {
    const danhMuc = [
      sp({ productId: "1", nhom: "khung" }),
      sp({ productId: "2", nhom: "anh_in" }),
    ];
    expect(nhomCoHang(danhMuc)).toEqual(["anh_in", "khung"]);
  });

  it("danh mục rỗng thì không nhóm nào cả", () => {
    expect(nhomCoHang([])).toEqual([]);
  });
});

describe("BB-279: kichThuocCuaNhom", () => {
  it("gom kích thước không trùng lặp, đúng nhóm", () => {
    const danhMuc = [
      sp({ productId: "1", nhom: "anh_in", size: "30x40" }),
      sp({ productId: "2", nhom: "anh_in", size: "40x60" }),
      sp({ productId: "3", nhom: "anh_in", size: "30x40" }), // trùng
      sp({ productId: "4", nhom: "khung", size: "50x70" }), // khác nhóm
    ];
    expect(kichThuocCuaNhom(danhMuc, "anh_in")).toEqual(["30x40", "40x60"]);
  });

  it("nhóm mà mọi sản phẩm đều không khai size -> mảng rỗng (ẩn bước kích thước)", () => {
    const danhMuc = [
      sp({ productId: "1", nhom: "album", size: null }),
      sp({ productId: "2", nhom: "album", size: "" }),
    ];
    expect(kichThuocCuaNhom(danhMuc, "album")).toEqual([]);
  });
});

describe("BB-279: chatLieuTheoKichThuoc", () => {
  const danhMuc = [
    sp({ productId: "1", nhom: "anh_in", size: "30x40", material: "UV" }),
    sp({ productId: "2", nhom: "anh_in", size: "30x40", material: "Gỗ" }),
    sp({ productId: "3", nhom: "anh_in", size: "40x60", material: "Mica HD" }),
  ];

  it("lọc chất liệu theo đúng kích thước đã chọn", () => {
    expect(chatLieuTheoKichThuoc(danhMuc, "anh_in", "30x40")).toEqual(["UV", "Gỗ"]);
    expect(chatLieuTheoKichThuoc(danhMuc, "anh_in", "40x60")).toEqual(["Mica HD"]);
  });

  it("size = null (nhóm không có bước kích thước) thì lấy mọi chất liệu của nhóm", () => {
    const albumDanhMuc = [
      sp({ productId: "1", nhom: "album", size: null, material: "Ultra HD" }),
      sp({ productId: "2", nhom: "album", size: null, material: "Thường" }),
    ];
    expect(chatLieuTheoKichThuoc(albumDanhMuc, "album", null)).toEqual(["Ultra HD", "Thường"]);
  });
});

describe("BB-279: chonSanPham — tổ hợp → đúng một sản phẩm", () => {
  it("khớp đúng một sản phẩm thì trả sản phẩm đó", () => {
    const danhMuc = [
      sp({ productId: "1", nhom: "anh_in", size: "30x40", material: "UV", unitPrice: 150000 }),
      sp({ productId: "2", nhom: "anh_in", size: "40x60", material: "Gỗ", unitPrice: 300000 }),
    ];
    const ket = chonSanPham(danhMuc, "anh_in", "30x40", "UV");
    expect(ket?.productId).toBe("1");
  });

  it("tổ hợp chưa từng bán -> null", () => {
    const danhMuc = [sp({ productId: "1", nhom: "anh_in", size: "30x40", material: "UV" })];
    expect(chonSanPham(danhMuc, "anh_in", "50x70", "UV")).toBeNull();
  });

  it("khớp NHIỀU sản phẩm (dữ liệu Lark trùng) -> chọn giá thấp nhất", () => {
    const danhMuc = [
      sp({ productId: "gia-cao", nhom: "anh_in", size: "30x40", material: "UV", unitPrice: 200000 }),
      sp({ productId: "gia-thap", nhom: "anh_in", size: "30x40", material: "UV", unitPrice: 120000 }),
    ];
    const ket = chonSanPham(danhMuc, "anh_in", "30x40", "UV");
    expect(ket?.productId).toBe("gia-thap");
    expect(ket?.unitPrice).toBe(120000);
  });

  it("khớp nhiều sản phẩm CÙNG giá -> productId nhỏ hơn thắng, ổn định qua nhiều lần gọi", () => {
    const danhMuc = [
      sp({ productId: "b-san-pham", nhom: "anh_in", size: "30x40", material: "UV", unitPrice: 150000 }),
      sp({ productId: "a-san-pham", nhom: "anh_in", size: "30x40", material: "UV", unitPrice: 150000 }),
    ];
    expect(chonSanPham(danhMuc, "anh_in", "30x40", "UV")?.productId).toBe("a-san-pham");
    // Gọi lại nhiều lần vẫn ra cùng kết quả (không phụ thuộc thứ tự mảng đầu vào).
    expect(chonSanPham(danhMuc.slice().reverse(), "anh_in", "30x40", "UV")?.productId).toBe(
      "a-san-pham",
    );
  });

  it("nhóm không có bước kích thước (size=null): chỉ khớp sản phẩm không khai size", () => {
    const danhMuc = [
      sp({ productId: "1", nhom: "album", size: null, material: "Ultra HD" }),
      sp({ productId: "2", nhom: "album", size: "20x20", material: "Ultra HD" }),
    ];
    expect(chonSanPham(danhMuc, "album", null, "Ultra HD")?.productId).toBe("1");
  });
});

// BB-329 mục 4 — chất liệu TRƯỚC, kích thước lọc theo chất liệu. Danh mục giả
// dựng theo đúng HÌNH DẠNG danh mục đang bán (khổ nhỏ nhất chỉ có một chất
// liệu), giá sắp tăng dần như máy chủ trả về.
describe("BB-329: chất liệu trước, kích thước theo chất liệu", () => {
  const danhMuc = [
    sp({ productId: "a", material: "Fixture UV", size: "10x15", unitPrice: 20000 }),
    sp({ productId: "b", material: "Fixture UV", size: "20x30", unitPrice: 60000 }),
    sp({ productId: "c", material: "Fixture Gương", size: "20x30", unitPrice: 150000 }),
    sp({ productId: "d", material: "Fixture Gỗ", size: "30x45", unitPrice: 300000 }),
    sp({ productId: "e", material: "Fixture Gương", size: "40x60", unitPrice: 500000 }),
    sp({ productId: "k", nhom: "khung", material: "Fixture Khung", size: "30x45", unitPrice: 400000 }),
  ];

  it("mọi chất liệu của nhóm đều hiện, không phụ thuộc khổ mặc định", () => {
    expect(chatLieuCuaNhom(danhMuc, "anh_in")).toEqual(["Fixture UV", "Fixture Gương", "Fixture Gỗ"]);
    // Bậc cũ: khổ mặc định 10x15 → chỉ còn một chất liệu, ba mẹ không có gì để chọn.
    expect(chatLieuTheoKichThuoc(danhMuc, "anh_in", "10x15")).toEqual(["Fixture UV"]);
  });

  it("kích thước lọc đúng theo chất liệu đã chọn", () => {
    expect(kichThuocTheoChatLieu(danhMuc, "anh_in", "Fixture Gương")).toEqual(["20x30", "40x60"]);
    expect(kichThuocTheoChatLieu(danhMuc, "anh_in", "Fixture UV")).toEqual(["10x15", "20x30"]);
    expect(kichThuocTheoChatLieu(danhMuc, "khung", "Fixture Khung")).toEqual(["30x45"]);
  });

  it("chất liệu + kích thước → đúng một sản phẩm", () => {
    expect(chonSanPham(danhMuc, "anh_in", "40x60", "Fixture Gương")?.productId).toBe("e");
  });
});
