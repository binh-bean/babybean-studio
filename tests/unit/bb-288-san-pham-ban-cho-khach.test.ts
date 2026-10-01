/**
 * BB-288 — phép thử đơn vị cho `sanPhamBanChoKhach()` (chỉ 3 nhóm ảnh
 * in/album/khung ĐANG BÁN, loại thêm canvas so với `nhomSanPham()`).
 *
 * BB-339 — thêm hai luật mới của anh (01/10/2026):
 *   · "Cavas/Kim tuyến" là ảnh in KIM TUYẾN đang bán, không phải canvas.
 *   · "App ẩn theo bảng giá": hàng in phải có trong bảng giá 01/10
 *     (`bang-gia-01-10.ts`) theo cặp chất liệu + kích thước.
 *
 * Dữ liệu hoàn toàn giả, gọi thẳng hàm thuần — không đọc mã nguồn, không giả
 * lập hook React (AGENTS.md §5a).
 */

import { describe, it, expect } from "vitest";
import {
  sanPhamBanChoKhach,
  sanPhamThuocNhomBan,
  laSanPhamThu,
  tenChatLieuChoKhach,
  tenCoChatLieuChoKhach,
} from "@/lib/products/nhom-san-pham";
import { BANG_GIA_01_10, chatLieuTheoBangGia, coTrongBangGia } from "@/lib/products/bang-gia-01-10";

const ban = (material: string | null, size: string | null, kind = "print", isActive = true) =>
  sanPhamBanChoKhach({ isActive, kind, material, size });

describe("BB-288: sanPhamBanChoKhach — danh mục BÁN cho khách", () => {
  it("Ảnh in (Gỗ, UV, Thủy tinh, Tráng gương, Mica HD) đang kinh doanh, có trong bảng giá -> bán", () => {
    expect(ban("Gỗ", "40x60")).toBe(true);
    expect(ban("UV", "10x15")).toBe(true);
    expect(ban("Thủy tinh", "35x50")).toBe(true);
    expect(ban("Tráng gương", "20x30")).toBe(true);
    expect(ban("Mica HD", "40x60")).toBe(true);
  });

  it("Album (Ultra HD) và tờ Album đang kinh doanh -> bán", () => {
    expect(ban("Album (Ultra HD)", "20x20")).toBe(true);
    expect(ban("tờ Album (Ultra HD)", "15x21")).toBe(true);
  });

  it("Khung HQ đang kinh doanh, có trong bảng giá -> bán", () => {
    expect(ban("Khung HQ", "40x60")).toBe(true);
  });

  it("Edit file (edited_photo) -> vẫn bán (thuộc nhóm ảnh in, không xét bảng giá hàng in)", () => {
    expect(ban(null, null, "edited_photo")).toBe(true);
  });

  // BB-339 — luật mới (bảng giá anh gửi 01/10/2026): "Cavas/Kim tuyến" trên
  // Lark là ảnh in KIM TUYẾN đang bán, không phải canvas. Ca cũ BB-288 (mong
  // `false`) đã đổi chiều.
  it("Kim Tuyến ('Cavas/Kim tuyến' — tên thật trên Lark) -> BÁN, không còn bị coi là canvas", () => {
    expect(ban("Cavas/Kim tuyến", "40x60")).toBe(true);
    expect(ban("Kim Tuyến", "80x120")).toBe(true);
    expect(ban("Cavas/Kim tuyến", "40x60", "print", false)).toBe(false);
  });

  it("Canvas THẬT (không có chữ kim tuyến) -> vẫn bị loại", () => {
    expect(sanPhamThuocNhomBan({ isActive: true, kind: "print", material: "Canvas" })).toBe(false);
    expect(sanPhamThuocNhomBan({ isActive: true, kind: "print", material: "CAVAS" })).toBe(false);
    expect(ban("Canvas", "40x60")).toBe(false);
  });

  it("BB-339 — tên hiện cho khách: 'Cavas/Kim tuyến' -> 'Kim Tuyến', không lộ chữ Cavas/Canvas", () => {
    expect(tenChatLieuChoKhach("Cavas/Kim tuyến")).toBe("Kim Tuyến");
    expect(tenChatLieuChoKhach("Gỗ")).toBe("Gỗ");
    expect(tenChatLieuChoKhach(null)).toBe(null);
    expect(tenCoChatLieuChoKhach("Cavas/Kim tuyến 40x60")).toBe("Kim Tuyến 40x60");
    expect(tenCoChatLieuChoKhach("Canvas/Kim Tuyến 30x45")).toBe("Kim Tuyến 30x45");
    expect(tenCoChatLieuChoKhach("Gỗ 40x60")).toBe("Gỗ 40x60");
  });

  it("Ngừng kinh doanh (is_active = false) -> loại dù đúng 1 trong 3 nhóm", () => {
    expect(ban("Gỗ", "40x60", "print", false)).toBe(false);
    expect(ban("Khung HQ", "40x60", "print", false)).toBe(false);
  });

  it("Dịch vụ kèm buổi chụp (shoot_package, addon, service) -> loại, không phải 1 trong 3 nhóm", () => {
    expect(ban(null, null, "shoot_package")).toBe(false);
    expect(ban(null, null, "addon")).toBe(false);
    expect(ban(null, null, "service")).toBe(false);
  });
});

describe("BB-339: App ẩn theo bảng giá 01/10", () => {
  it("Món Lark còn bán mà KHÔNG có trong bảng giá -> ẩn (Gỗ 120×180, Tráng gương 15×21, Khung kim loại)", () => {
    // Cùng nhóm/không canvas -> qua lớp lọc nhóm…
    expect(sanPhamThuocNhomBan({ isActive: true, kind: "print", material: "Gỗ" })).toBe(true);
    // …nhưng không có trong bảng giá -> không bán.
    expect(ban("Gỗ", "120x180")).toBe(false);
    expect(ban("Tráng gương", "15x21")).toBe(false);
    for (const size of ["30x45", "35x50", "40x60", "50x75", "60x90", "70x110", "80x120"]) {
      expect(ban("Khung kim loại", size)).toBe(false);
    }
  });

  it("Thiếu kích thước thì không đoán là có trong bảng", () => {
    expect(ban("Gỗ", null)).toBe(false);
  });

  it("Tên bảng giá ↔ tên Lark/DB khớp đúng (Kim Tuyến, Khung Hàn Quốc, Tờ, hoa/thường)", () => {
    expect(chatLieuTheoBangGia("Cavas/Kim tuyến")).toBe("Kim Tuyến");
    expect(chatLieuTheoBangGia("Khung HQ")).toBe("Khung Hàn Quốc");
    expect(chatLieuTheoBangGia("tờ Album (Ultra HD)")).toBe("Tờ (Ultra HD)");
    expect(chatLieuTheoBangGia("Album (Ultra HD)")).toBe("Album (Ultra HD)");
    expect(chatLieuTheoBangGia("Thủy tinh")).toBe("Thủy Tinh");
    expect(chatLieuTheoBangGia("Tráng gương")).toBe("Tráng Gương");
    expect(chatLieuTheoBangGia("Khung kim loại")).toBe(null);
    expect(coTrongBangGia("Gỗ", "40 x 60")).toBe(true);
    expect(coTrongBangGia("Gỗ", "40×60")).toBe(true);
  });

  it("Mọi cặp trong bảng giá đều được bán (nếu Lark đang kinh doanh)", () => {
    const tenDb: Record<string, string> = {
      "Kim Tuyến": "Cavas/Kim tuyến",
      "Khung Hàn Quốc": "Khung HQ",
      "Tờ (Ultra HD)": "tờ Album (Ultra HD)",
      "Tráng Gương": "Tráng gương",
      "Thủy Tinh": "Thủy tinh",
    };
    let dem = 0;
    for (const [ten, sizes] of Object.entries(BANG_GIA_01_10)) {
      for (const size of sizes) {
        expect(ban(tenDb[ten] ?? ten, size), `${ten} ${size}`).toBe(true);
        dem += 1;
      }
    }
    expect(dem).toBe(62);
  });
});

describe("BB-339: sản phẩm thử (Fixture/TEST) không vào danh mục khách", () => {
  it("nhận ra tên Fixture …/TEST …, không bắt nhầm tên thật", () => {
    expect(laSanPhamThu("Fixture Khung kính đa giác")).toBe(true);
    expect(laSanPhamThu("TEST In ảnh")).toBe(true);
    expect(laSanPhamThu("Gỗ 40x60")).toBe(false);
    expect(laSanPhamThu("Testimonial 20x30")).toBe(false);
    expect(laSanPhamThu(null)).toBe(false);
  });
});
