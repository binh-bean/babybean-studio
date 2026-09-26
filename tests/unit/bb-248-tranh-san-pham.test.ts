/**
 * BB-248 — tranhCuaSanPham(): tên tranh minh hoạ theo nhóm/chất liệu sản phẩm.
 *
 * Hàm thuần, không I/O — không cần mock gì. Xem
 * `src/lib/products/tranh-san-pham.ts` để rõ vì sao exception "canvas" chỉ
 * áp dụng cho nhánh `khung`.
 */
import { describe, it, expect } from "vitest";
import { tranhCuaSanPham } from "@/lib/products/tranh-san-pham";

describe("BB-248: tranhCuaSanPham", () => {
  it("nhóm ảnh in và ảnh phóng → sp-anh-in", () => {
    expect(tranhCuaSanPham("anh_in", "UV", "UV 40x60")).toBe("sp-anh-in");
    expect(tranhCuaSanPham("anh_in", null, "Ảnh phóng")).toBe("sp-anh-in");
  });

  it("nhóm album → sp-album-dat-mua (BB-202: album mua thêm chỉ đặt mua)", () => {
    expect(tranhCuaSanPham("album", "Album (Ultra HD)", "Album 15x21")).toBe("sp-album-dat-mua");
  });

  it("nhóm khung, chất liệu thường → sp-khung-anh", () => {
    expect(tranhCuaSanPham("khung", "Khung HQ", "Khung HQ 40x60")).toBe("sp-khung-anh");
    expect(tranhCuaSanPham("khung", "Khung kim loại", "Khung kim loại 30x40")).toBe(
      "sp-khung-anh",
    );
  });

  it('nhóm khung, material/name chứa "canvas" (không phân biệt hoa thường) → sp-tranh-canvas', () => {
    expect(tranhCuaSanPham("khung", "Canvas", "Khung Canvas 40x60")).toBe("sp-tranh-canvas");
    expect(tranhCuaSanPham("khung", "Khung gỗ", "Khung tranh canvas 50x70")).toBe(
      "sp-tranh-canvas",
    );
    expect(tranhCuaSanPham("khung", "CANVAS 40x60", "Khung CANVAS 40x60")).toBe(
      "sp-tranh-canvas",
    );
  });

  it('nhóm khung, "canvas" bỏ dấu vẫn khớp (tên có dấu tiếng Việt)', () => {
    expect(tranhCuaSanPham("khung", "Khung Cánvas", "Khung tranh cạnvas 40x60")).toBe(
      "sp-tranh-canvas",
    );
    expect(tranhCuaSanPham("khung", null, "Khung Tráng Canvas cao cấp")).toBe("sp-tranh-canvas");
  });

  it("nhóm khung không có chữ canvas thì vẫn ra sp-khung-anh dù tên có dấu", () => {
    expect(tranhCuaSanPham("khung", "Khung gỗ sồi", "Khung gỗ sồi 40x60 — cao cấp")).toBe(
      "sp-khung-anh",
    );
  });
});

// Opus soát: canvas thật nằm ở nhóm ảnh in (kind = print).
describe("BB-248: canvas ở nhóm ảnh in", () => {
  it("ảnh in chất liệu Canvas → tranh canvas", () => {
    expect(tranhCuaSanPham("anh_in", "Canvas", "Tranh canvas 40x60")).toBe("sp-tranh-canvas");
  });
  it("ảnh in giấy thường vẫn là ảnh in", () => {
    expect(tranhCuaSanPham("anh_in", "Giấy lụa", "Ảnh 13x18")).toBe("sp-anh-in");
  });
});
