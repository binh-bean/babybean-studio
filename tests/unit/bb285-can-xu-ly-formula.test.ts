/**
 * BB-285 — "Chưa có hạn mức" và "Lark báo đỏ/tím" phải cộng vào ĐÚNG MỘT công
 * thức (`demSoCanXuLy`) mà huy hiệu sidebar và khối "Cần xử lý ngay" dùng
 * chung (bất biến BB-283: tổng các dòng của `dongCanXuLy` == `demSoCanXuLy`).
 */

import { describe, it, expect } from "vitest";
import { demSoCanXuLy, dongCanXuLy, type CanXuLyTongHop } from "@/lib/utils/can-xu-ly";

describe("BB-285 — demSoCanXuLy cộng thêm chuaCoHanMuc + canhBaoLark", () => {
  it("cộng đủ sáu số hạng (hai loại cũ + hai loại BB-285 + hai số BB-270)", () => {
    const d: CanXuLyTongHop = {
      driveChuaChiaSe: [1, 2],
      chuaCoAnh: [1],
      chuaCoHanMuc: [1, 2, 3],
      dueSoon: 4,
      overdue: 5,
      canhBaoLark: 6,
    };
    expect(demSoCanXuLy(d)).toBe(2 + 1 + 3 + 4 + 5 + 6);
  });

  it("thiếu field mới (bản API cũ hơn) thì coi là 0, không throw", () => {
    expect(demSoCanXuLy({ driveChuaChiaSe: [1] })).toBe(1);
    expect(demSoCanXuLy(null)).toBe(0);
    expect(demSoCanXuLy(undefined)).toBe(0);
  });

  it("bất biến BB-283: tổng soLuong của dongCanXuLy() luôn khớp demSoCanXuLy()", () => {
    const cases: CanXuLyTongHop[] = [
      { driveChuaChiaSe: [1], chuaCoAnh: [1, 2], chuaCoHanMuc: [1, 2, 3], dueSoon: 1, overdue: 2, canhBaoLark: 3 },
      { chuaCoHanMuc: [1], canhBaoLark: 19 },
      {},
      { dueSoon: 0, overdue: 0, canhBaoLark: 0, chuaCoHanMuc: [] },
    ];
    for (const d of cases) {
      const tongDong = dongCanXuLy(d).reduce((t, r) => t + r.soLuong, 0);
      expect(tongDong).toBe(demSoCanXuLy(d));
    }
  });

  it("dòng 'Chưa có hạn mức' và 'Lark báo đỏ/tím' chỉ hiện khi > 0", () => {
    expect(dongCanXuLy({ chuaCoHanMuc: [], canhBaoLark: 0 })).toEqual([]);
    const dong = dongCanXuLy({ chuaCoHanMuc: [1], canhBaoLark: 5 });
    expect(dong.map((d) => d.key).sort()).toEqual(["canh-bao-lark", "chua-co-han-muc"]);
  });
});
