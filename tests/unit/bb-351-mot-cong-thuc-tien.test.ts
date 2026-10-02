/**
 * BB-351 — "Phải thu" là MỘT con số: `tongPhaiThuCuaBo` (vượt hạn mức qua mọi lần chốt + hạn mức đã
 * quy đổi trước lần chốt mới nhất + đợt mua thêm đã xác nhận). Kịch bản đúng như người chấm B vòng 7:
 * hạn mức 15, giá 50.000; khách chọn 17 → trả 100.000 (hạn mức 17) → mở lại, chốt lại 18
 * (snapshot 50.000, 2 ảnh đã quy đổi trước lần chốt) → trả 50.000 → đợt 2 (2 ảnh, 100.000) → trả 100.000.
 *
 * Bản cũ của màn chi tiết / phản hồi /payments lấy `dueAmount = snapshot_extra_amount` → 50.000 − 250.000
 * = −200.000 ("khách trả DƯ"). Kiểm ngược: thay `tongPhaiThuCuaBo` bằng `p.tienLucChot` thì ca cuối đỏ.
 */
import { describe, it, expect } from "vitest";
import { tienCanThuCuaBo, tongPhaiThuCuaBo } from "@/lib/gallery/tien-phat-sinh";

const GIA = 50_000;

describe("BB-351 tổng phải thu — kịch bản B vòng 7", () => {
  it("chốt lần đầu 17/15: phải thu 100.000", () => {
    const p = { tienTheoAnh: 2 * GIA, tienLucChot: 2 * GIA, tienDotMuaThem: 0, quyDoi: { tatCa: 0, truocChot: 0 } };
    expect(tongPhaiThuCuaBo(p)).toBe(100_000);
    expect(tienCanThuCuaBo({ ...p, daGhiCo: 0 })).toBe(100_000);
  });

  it("chốt lại 18 sau khi đã trả 100.000 (hạn mức 17): phải thu 150.000, còn thiếu 50.000", () => {
    const p = { tienTheoAnh: GIA, tienLucChot: GIA, tienDotMuaThem: 0, quyDoi: { tatCa: 2 * GIA, truocChot: 2 * GIA } };
    expect(tongPhaiThuCuaBo(p)).toBe(150_000);
    expect(tongPhaiThuCuaBo(p) - 100_000).toBe(50_000);
  });

  it("đợt 2 (2 ảnh) đã xác nhận, đã trả 150.000: phải thu 250.000, còn thiếu 100.000", () => {
    const p = { tienTheoAnh: 2 * GIA, tienLucChot: GIA, tienDotMuaThem: 2 * GIA, quyDoi: { tatCa: 3 * GIA, truocChot: 2 * GIA } };
    expect(tongPhaiThuCuaBo(p)).toBe(250_000);
    expect(tienCanThuCuaBo({ ...p, daGhiCo: 150_000 })).toBe(100_000);
  });

  it("trả đủ 250.000 cho 5 ảnh: phải thu 250.000, còn thiếu 0 — KHÔNG âm, không 'trả DƯ'", () => {
    const p = { tienTheoAnh: 0, tienLucChot: GIA, tienDotMuaThem: 2 * GIA, quyDoi: { tatCa: 5 * GIA, truocChot: 2 * GIA } };
    const tong = tongPhaiThuCuaBo(p);
    expect(tong).toBe(250_000);
    expect(tong - 250_000).toBe(0);
    expect(tienCanThuCuaBo({ ...p, daGhiCo: 250_000 })).toBe(0);
  });
});
