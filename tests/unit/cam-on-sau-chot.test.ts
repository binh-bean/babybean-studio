/**
 * BB-289 lượt 2 — luật "Đủ gói" ở màn Cảm ơn (`cam-on-sau-chot.tsx`).
 *
 * Admin báo trên app thật: gói 10 tấm, mới chọn 1 tấm mà màn Cảm ơn ghi
 * "1 tấm ảnh chỉnh sửa · Đủ gói" — SAI, vì bản trước so `soTamDaChon >
 * hanMuc` (chỉ bắt ca VƯỢT), không bắt ca THIẾU (mặc định rơi vào "Đủ gói").
 *
 * Kiểm ngược (AGENTS.md §5a): hoàn nguyên `trangThaiSoTam` về
 * `soTamDaChon > hanMuc ? "+X ngoài gói" : "Đủ gói"` thì ca "thiếu" (1/10)
 * dưới đây ĐỎ (mong "1/10 tấm", nhận "Đủ gói") — đã tự chạy tay, dán ở báo
 * cáo bàn giao.
 */
import { describe, it, expect } from "vitest";
import { trangThaiSoTam } from "@/components/features/gallery/cam-on-sau-chot";

describe("BB-289: trangThaiSoTam — dòng trạng thái số tấm ở màn Cảm ơn", () => {
  it("thiếu (đã chọn < hạn mức): hiện N/hạn mức, KHÔNG phải Đủ gói", () => {
    expect(trangThaiSoTam(1, 10)).toBe("1/10 tấm");
    expect(trangThaiSoTam(9, 10)).toBe("9/10 tấm");
  });

  it("đúng (đã chọn = hạn mức): Đủ gói", () => {
    expect(trangThaiSoTam(10, 10)).toBe("Đủ gói");
  });

  it("vượt (đã chọn > hạn mức): N/hạn mức · thêm X tấm", () => {
    expect(trangThaiSoTam(12, 10)).toBe("12/10 · thêm 2 tấm");
  });

  it("không biết hạn mức (quotaKnown=false): không hiện dòng trạng thái", () => {
    expect(trangThaiSoTam(5, null)).toBeNull();
  });
});
