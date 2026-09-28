/**
 * BB-296 mục #6 — báo cáo chấm độc lập lần 3: màn chi tiết bộ ảnh quản trị
 * chỉ có một con số "Mua thêm X ₫", không thấy TỪNG món cụ thể. Thêm khối
 * "Mua thêm" liệt kê từng dòng, dùng `tenThanThienMuaThem`
 * (`components/features/admin/gallery-detail.tsx`) để suy tên thân thiện từ
 * nhóm + chất liệu + cỡ — CÙNG LUẬT với `tenThanThienSanPham` màn khách
 * (không lặp chữ khi chất liệu đã tự nói tên nhóm, vd "Khung HQ").
 *
 * Thước đo AGENTS.md §5a: hoàn nguyên nhánh kiểm trùng tiền tố trong
 * `tenThanThienMuaThem` về `` `${tienTo} ${chatLieu}` `` không điều kiện thì
 * test "Khung HQ" đỏ đúng dự kiến (đã tự kiểm tay), vá lại thì xanh.
 */

import { describe, it, expect } from "vitest";
import { tenThanThienMuaThem } from "@/components/features/admin/gallery-detail";

describe("BB-296 mục #6: tenThanThienMuaThem", () => {
  it("nhóm khung + chất liệu 'Khung HQ' + cỡ -> không lặp tiền tố, có cỡ", () => {
    expect(tenThanThienMuaThem("print", "Khung HQ", "40x60")).toBe("Khung HQ · 40×60");
  });

  it("nhóm ảnh in + chất liệu 'UV' -> ghép tiền tố bình thường", () => {
    expect(tenThanThienMuaThem("print", "UV", "10x15")).toBe("Ảnh in UV · 10×15");
  });

  it("album -> tiền tố Album, không có cỡ thì bỏ hẳn dấu chấm giữa", () => {
    expect(tenThanThienMuaThem("print", "Album (Ultra HD)", null)).toBe("Album (Ultra HD)");
  });

  it("không có chất liệu -> chỉ còn tên nhóm", () => {
    expect(tenThanThienMuaThem("print", null, null)).toBe("Ảnh in");
  });
});
