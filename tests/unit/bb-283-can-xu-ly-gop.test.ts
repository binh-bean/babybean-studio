/**
 * BB-283 (soát bởi giám đốc 27/09/2026): huy hiệu "Việc cần xử lý" ở sidebar
 * và khối "Cần xử lý ngay" ở Bảng điều khiển từng đọc hai nguồn khác nhau —
 * ảnh chụp thật cho huy hiệu "127" trong lúc khối kia nói "không có gì cần
 * xử lý gấp". `src/lib/utils/can-xu-ly.ts` là công thức DUY NHẤT cho cả hai.
 *
 * Phép thử này canh đúng điều đó: TỔNG các dòng `dongCanXuLy()` trả về (thứ
 * dashboard.tsx vẽ ra) phải LUÔN khớp `demSoCanXuLy()` (thứ admin-layout-shell
 * dùng cho huy hiệu) — với MỌI tổ hợp dữ liệu, không chỉ một trường hợp may
 * mắn khớp nhau.
 *
 * AGENTS.md §5a: hoàn nguyên thử — xoá dòng `overdue` khỏi phép cộng trong
 * `demSoCanXuLy()` (sửa tạm thành chỉ cộng `dueSoon`) thì bài "tổng dòng khớp
 * huy hiệu" đỏ ngay vì `dongCanXuLy()` vẫn cộng đủ cả hai vào dòng "Sắp hết
 * hạn chọn" — kiểm bằng tay, đã thấy đỏ rồi trả lại như cũ.
 */
import { describe, it, expect } from "vitest";
import { demSoCanXuLy, dongCanXuLy, type CanXuLyTongHop } from "@/lib/utils/can-xu-ly";

function tongDong(d: CanXuLyTongHop | null | undefined): number {
  return dongCanXuLy(d).reduce((tong, dong) => tong + dong.soLuong, 0);
}

describe("BB-283: demSoCanXuLy/dongCanXuLy — MỘT công thức cho huy hiệu + khối bảng điều khiển", () => {
  it("tổng các dòng hiển thị LUÔN bằng số trên huy hiệu — đủ cả ba loại", () => {
    const d: CanXuLyTongHop = {
      driveChuaChiaSe: [{ id: "a" }, { id: "b" }],
      chuaCoAnh: [{ id: "c" }],
      dueSoon: 4,
      overdue: 2,
    };
    expect(tongDong(d)).toBe(demSoCanXuLy(d));
    expect(demSoCanXuLy(d)).toBe(9);
  });

  it("tổng các dòng LUÔN bằng huy hiệu khi chỉ có một loại khác 0", () => {
    expect(tongDong({ dueSoon: 5 })).toBe(demSoCanXuLy({ dueSoon: 5 }));
    expect(tongDong({ driveChuaChiaSe: [{ id: "x" }] })).toBe(
      demSoCanXuLy({ driveChuaChiaSe: [{ id: "x" }] })
    );
  });

  it("tổng các dòng LUÔN bằng huy hiệu khi tất cả = 0 hoặc thiếu dữ liệu", () => {
    expect(tongDong(null)).toBe(demSoCanXuLy(null));
    expect(tongDong({})).toBe(demSoCanXuLy({}));
    expect(demSoCanXuLy(null)).toBe(0);
  });

  it("Bảng điều khiển rỗng CHỈ khi TẤT CẢ ba loại đều 0 — còn một loại > 0 vẫn phải hiện dòng", () => {
    expect(dongCanXuLy({ driveChuaChiaSe: [], chuaCoAnh: [], dueSoon: 0, overdue: 0 })).toHaveLength(0);
    expect(dongCanXuLy({ overdue: 1 })).toHaveLength(1);
  });

  it("gộp dueSoon + overdue vào MỘT dòng 'Sắp hết hạn chọn', không tách hai dòng", () => {
    const dong = dongCanXuLy({ dueSoon: 3, overdue: 1 });
    expect(dong).toHaveLength(1);
    expect(dong[0]!.key).toBe("sap-het-han-chon");
    expect(dong[0]!.soLuong).toBe(4);
  });
});
