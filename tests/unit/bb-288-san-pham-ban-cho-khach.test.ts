/**
 * BB-288 — phép thử đơn vị cho `sanPhamBanChoKhach()` (chỉ 3 nhóm ảnh
 * in/album/khung ĐANG BÁN, loại thêm canvas so với `nhomSanPham()`).
 *
 * Dữ liệu hoàn toàn giả, gọi thẳng hàm thuần — không đọc mã nguồn, không giả
 * lập hook React (AGENTS.md §5a).
 *
 * Thước đo: mỗi test phải đỏ nếu hoàn nguyên bản vá. Đã tự hoàn nguyên
 * `sanPhamBanChoKhach` về `nhomSanPham(...) !== null` (bỏ điều kiện canvas) —
 * test "canvas bị loại" đỏ đúng như dự kiến, rồi vá lại xanh.
 */

import { describe, it, expect } from "vitest";
import { sanPhamBanChoKhach } from "@/lib/products/nhom-san-pham";

describe("BB-288: sanPhamBanChoKhach — danh mục BÁN cho khách", () => {
  it("Ảnh in (Gỗ, UV, Thủy tinh, Tráng gương, Mica HD) đang kinh doanh -> bán", () => {
    for (const material of ["Gỗ", "UV", "Thủy tinh", "Tráng gương", "Mica HD"]) {
      expect(
        sanPhamBanChoKhach({ isActive: true, kind: "print", material }),
      ).toBe(true);
    }
  });

  it("Album (Ultra HD) và tờ Album đang kinh doanh -> bán", () => {
    expect(
      sanPhamBanChoKhach({ isActive: true, kind: "print", material: "Album (Ultra HD)" }),
    ).toBe(true);
    expect(
      sanPhamBanChoKhach({ isActive: true, kind: "print", material: "tờ Album (Ultra HD)" }),
    ).toBe(true);
  });

  it("Khung HQ và Khung kim loại đang kinh doanh -> bán", () => {
    expect(
      sanPhamBanChoKhach({ isActive: true, kind: "print", material: "Khung HQ" }),
    ).toBe(true);
    expect(
      sanPhamBanChoKhach({ isActive: true, kind: "print", material: "Khung kim loại" }),
    ).toBe(true);
  });

  it("Edit file (edited_photo) -> vẫn bán (thuộc nhóm ảnh in)", () => {
    expect(
      sanPhamBanChoKhach({ isActive: true, kind: "edited_photo", material: null }),
    ).toBe(true);
  });

  it("Canvas ('Cavas/Kim tuyến' — tên thật trên Lark) -> KHÔNG bán dù đang kinh doanh", () => {
    expect(
      sanPhamBanChoKhach({ isActive: true, kind: "print", material: "Cavas/Kim tuyến" }),
    ).toBe(false);
  });

  it("Canvas viết đúng chính tả hoặc chỉ viết hoa/thường khác -> vẫn bị loại", () => {
    expect(
      sanPhamBanChoKhach({ isActive: true, kind: "print", material: "Canvas" }),
    ).toBe(false);
    expect(
      sanPhamBanChoKhach({ isActive: true, kind: "print", material: "CAVAS" }),
    ).toBe(false);
  });

  it("Ngừng kinh doanh (is_active = false) -> loại dù đúng 1 trong 3 nhóm", () => {
    expect(
      sanPhamBanChoKhach({ isActive: false, kind: "print", material: "Gỗ" }),
    ).toBe(false);
    expect(
      sanPhamBanChoKhach({ isActive: false, kind: "print", material: "Khung HQ" }),
    ).toBe(false);
  });

  it("Dịch vụ kèm buổi chụp (shoot_package, addon, service) -> loại, không phải 1 trong 3 nhóm", () => {
    expect(
      sanPhamBanChoKhach({ isActive: true, kind: "shoot_package", material: null }),
    ).toBe(false);
    expect(
      sanPhamBanChoKhach({ isActive: true, kind: "addon", material: null }),
    ).toBe(false);
    expect(
      sanPhamBanChoKhach({ isActive: true, kind: "service", material: null }),
    ).toBe(false);
  });
});
