/**
 * BB-361 (người chấm vòng 9, mục 4) — tên sản phẩm cho khách luôn viết hoa chữ đầu:
 * "tờ Album (Ultra HD) 20x20" (tên Lark) từng đứng đầu dòng viết thường, cạnh "Ảnh in UV".
 * Dữ liệu gốc không đổi — chỉ bản hiển thị qua `formatKichThuoc`/`tenChatLieuChoKhach`.
 *
 * Kiểm ngược: bỏ `vietHoaChuDau` khỏi `formatKichThuoc` → ca 1, 2 ĐỎ; bỏ khỏi
 * `tenChatLieuChoKhach` → ca 3 ĐỎ; trả `includes` về `startsWith` trong `tenSanPhamChoKhach`
 * → ca 4 ĐỎ ("Album Tờ Album …").
 */
import { describe, it, expect } from "vitest";
import { formatKichThuoc, tenKemSoLuong, tenSanPhamChoKhach } from "@/lib/utils/dinh-dang";
import { tenChatLieuChoKhach, vietHoaChuDau } from "@/lib/products/nhom-san-pham";

describe("BB-361 — tên hiển thị viết hoa chữ đầu", () => {
  it("formatKichThuoc: 'tờ Album (Ultra HD) 20x20' → 'Tờ Album (Ultra HD) 20×20'", () => {
    expect(formatKichThuoc("tờ Album (Ultra HD) 20x20")).toBe("Tờ Album (Ultra HD) 20×20");
  });

  it("tenKemSoLuong (dòng giỏ, hộp chốt) cũng viết hoa", () => {
    expect(tenKemSoLuong("tờ Album (Ultra HD) 20x20", 3)).toBe("Tờ Album (Ultra HD) 20×20 ×3");
  });

  it("tenChatLieuChoKhach: chip chất liệu 'tờ Album (Ultra HD)' → 'Tờ Album (Ultra HD)'", () => {
    expect(tenChatLieuChoKhach("tờ Album (Ultra HD)")).toBe("Tờ Album (Ultra HD)");
    // Không đổi những tên đã đúng.
    expect(tenChatLieuChoKhach("UV bóng")).toBe("UV");
    expect(tenChatLieuChoKhach("Gỗ")).toBe("Gỗ");
  });

  it("tenSanPhamChoKhach: chất liệu đã chứa 'Album' thì không ghép 'Album' lần nữa", () => {
    expect(
      tenSanPhamChoKhach({ name: "tờ Album (Ultra HD) 20x20", nhom: "album", material: "tờ Album (Ultra HD)", size: "20x20" }),
    ).toBe("Tờ Album (Ultra HD) 20×20");
    expect(tenSanPhamChoKhach({ name: "UV 10x15", nhom: "anh_in", material: "UV", size: "10x15" })).toBe("Ảnh in UV 10×15");
  });

  it("vietHoaChuDau: chỉ chữ cái đầu, phần sau giữ nguyên; số/ký hiệu đầu không đổi", () => {
    expect(vietHoaChuDau("ảnh in")).toBe("Ảnh in");
    expect(vietHoaChuDau("đế gỗ")).toBe("Đế gỗ");
    expect(vietHoaChuDau("10×15")).toBe("10×15");
    expect(vietHoaChuDau("Kim Tuyến 40×60")).toBe("Kim Tuyến 40×60");
  });
});
