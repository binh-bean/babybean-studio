/**
 * BB-293 mục #16 — báo cáo chấm độc lập (`4-cham-lai-doc-lap.md` mục 3, dòng
 * #16): tiêu đề khối sản phẩm trong cửa hàng ghi "Khung Khung HQ" — lặp chữ.
 * Nhóm "khung" có tiền tố hiển thị "Khung", và chất liệu của nhóm này (đồng
 * bộ từ Lark, `nhom-san-pham.ts` dòng 61: `cl.startsWith("khung")`) LUÔN bắt
 * đầu bằng "Khung" ("Khung HQ", "Khung kim loại"…) — ghép thẳng tiền tố với
 * chất liệu luôn lặp chữ cho MỌI sản phẩm nhóm khung, không chỉ ca "Khung HQ".
 *
 * Thước đo AGENTS.md §5a: hoàn nguyên `tenThanThienSanPham` về
 * `` `${tienTo} ${chatLieu}` `` (bỏ nhánh kiểm trùng tiền tố) thì test đầu đỏ
 * đúng dự kiến (đã tự kiểm tay), rồi vá lại thì xanh.
 */

import { describe, it, expect } from "vitest";
import { tenThanThienSanPham } from "@/components/features/gallery/cua-hang";
import type { SanPhamCuaHang } from "@/lib/products/cau-hinh-cua-hang";

function sp(overrides: Partial<SanPhamCuaHang> & { productId: string }): SanPhamCuaHang {
  return {
    name: "Fixture BB-293 sản phẩm",
    material: null,
    size: null,
    unitPrice: 100000,
    nhom: "khung",
    canGanAnh: true,
    ...overrides,
  };
}

describe("BB-293 mục #16: tenThanThienSanPham — không lặp chữ", () => {
  it("nhóm khung + chất liệu 'Khung HQ' -> 'Khung HQ', không phải 'Khung Khung HQ'", () => {
    const san = sp({ productId: "1", nhom: "khung", material: "Khung HQ" });
    expect(tenThanThienSanPham("khung", san)).toBe("Khung HQ");
  });

  it("nhóm khung + chất liệu 'Khung kim loại' -> giữ nguyên, không lặp tiền tố", () => {
    const san = sp({ productId: "2", nhom: "khung", material: "Khung kim loại" });
    expect(tenThanThienSanPham("khung", san)).toBe("Khung kim loại");
  });

  it("nhóm ảnh in + chất liệu 'UV' -> vẫn ghép bình thường ('Ảnh in UV')", () => {
    const san = sp({ productId: "3", nhom: "anh_in", material: "UV" });
    expect(tenThanThienSanPham("anh_in", san)).toBe("Ảnh in UV");
  });

  it("chưa có sản phẩm khớp (null) -> chỉ hiện tên nhóm", () => {
    expect(tenThanThienSanPham("khung", null)).toBe("Khung");
  });
});
