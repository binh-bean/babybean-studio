/**
 * BB-319 — các hàm hiển thị DÙNG CHUNG của màn khách (`src/lib/utils/dinh-dang.ts`):
 * mỗi lớp lỗi một nguồn duy nhất, mọi chỗ hiện gọi cùng hàm.
 *
 *  - `tenKemSoLuong`       — "UV 10×15 ×3" (luật 1: một ký hiệu × cho kích thước và số lượng)
 *  - `tenSanPhamChoKhach`  — một tên cho một món ở cửa hàng, giỏ, xem lớn, hộp chốt (luật 1 + 5)
 *  - `nhanTrangThaiGio`    — "Trong giỏ" / "Đã đặt mua" theo đơn đã gửi chưa (luật 5)
 *  - `dongChiNhanh`        — không ghép "Chi nhánh … Chi nhánh"
 *  - `coChuTieuDeBia`      — mọi bậc cỡ chữ tiêu đề bìa nằm trên thang chữ (luật 3)
 *
 * Kiểm ngược (AGENTS.md §5a): cho `nhanTrangThaiGio` luôn trả "Đã đặt mua" → ca
 * "chưa gửi" ĐỎ; bỏ `formatKichThuoc` trong `tenKemSoLuong` → ca "10x15" ĐỎ;
 * trả lại bậc 27/38/46 cũ ở `coChuTieuDeBia` → ca thang chữ ĐỎ.
 */
import { describe, it, expect } from "vitest";
import {
  tenKemSoLuong,
  tenSanPhamChoKhach,
  nhanTrangThaiGio,
  dongChiNhanh,
  coChuTieuDeBia,
} from "@/lib/utils/dinh-dang";
import { THANG_CHU } from "../e2e/helpers/luat-khach";

describe("luật 1 — tên kèm số lượng, một ký hiệu ×", () => {
  it("chuẩn hoá kích thước và viết số lượng liền số, bỏ ×1", () => {
    expect(tenKemSoLuong("UV 10x15", 3)).toBe("UV 10×15 ×3");
    expect(tenKemSoLuong("Album (Ultra HD) 15x21", 1)).toBe("Album (Ultra HD) 15×21");
    expect(tenKemSoLuong("Gỗ 40 X 60")).toBe("Gỗ 40×60");
  });
});

describe("luật 1 + 5 — một tên cho một món", () => {
  it("nhóm + chất liệu + kích thước", () => {
    expect(tenSanPhamChoKhach({ name: "UV 10x15", nhom: "anh_in", material: "UV", size: "10x15" })).toBe("Ảnh in UV 10×15");
  });
  it("chất liệu đã tự mang tên nhóm thì không lặp ('Khung Khung HQ')", () => {
    expect(tenSanPhamChoKhach({ name: "Khung HQ 20x30", nhom: "khung", material: "Khung HQ", size: "20x30" })).toBe("Khung HQ 20×30");
  });
  it("món ngoài danh mục (thiếu nhóm) rơi về tên gốc đã chuẩn hoá", () => {
    expect(tenSanPhamChoKhach({ name: "UV 10x15" })).toBe("UV 10×15");
  });
});

describe("luật 5 — nhãn giỏ đúng trạng thái", () => {
  it("chưa gửi đơn = 'Trong giỏ'; đã gửi = 'Đã đặt mua'", () => {
    expect(nhanTrangThaiGio(false)).toBe("Trong giỏ");
    expect(nhanTrangThaiGio(true)).toBe("Đã đặt mua");
  });
});

describe("dòng chi nhánh", () => {
  it("thêm 'Chi nhánh' khi tên chưa có; không ghép hai lần", () => {
    expect(dongChiNhanh("Pasteur")).toBe("Chi nhánh Pasteur");
    expect(dongChiNhanh("Chi nhánh Quận 1")).toBe("Chi nhánh Quận 1");
    expect(dongChiNhanh("Fixture DANHGIA5-ab12 Chi nhánh")).toBe("Fixture DANHGIA5-ab12 Chi nhánh");
    expect(dongChiNhanh("")).toBe("");
  });
});

describe("luật 3 — cỡ chữ tiêu đề bìa nằm trên thang chữ", () => {
  it("mọi bậc của mọi độ dài tên đều thuộc THANG_CHU", () => {
    const thang = new Set<number>(THANG_CHU);
    for (const ten of ["Na", "Nguyễn An", "Nguyễn Minh An", "Nguyễn Ngọc Bảo An", "Nguyễn Thị Minh Ngọc Khánh Hân"]) {
      const c = coChuTieuDeBia(ten);
      for (const px of [c.mobile, c.sm, c.lg, c.xl]) expect(thang.has(px), `${ten}: ${px}px`).toBe(true);
    }
  });
});
