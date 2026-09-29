/**
 * Dòng số tấm ở màn Cảm ơn (`cam-on-sau-chot.tsx`).
 *
 * BB-289 lượt 2 — gói 10 tấm, mới chọn 1 tấm mà màn Cảm ơn từng ghi "Đủ gói"
 * (bản cũ chỉ so `soTamDaChon > hanMuc`, ca THIẾU rơi vào "Đủ gói").
 * BB-319 (K9) — hai chỗ lặp số ("6 tấm ảnh chỉnh sửa" + "6/20 tấm") gộp thành MỘT
 * dòng nói rõ 20 là số tấm trong gói.
 *
 * Kiểm ngược (AGENTS.md §5a): đổi `<` thành `<=` ở nhánh thiếu trong
 * `dongSoTamCamOn` thì ca 9/10 ĐỎ; đổi nhánh thiếu về "Đủ gói" thì ca 1/10 ĐỎ.
 */
import { describe, it, expect } from "vitest";
import { dongSoTamCamOn } from "@/components/features/gallery/cam-on-sau-chot";

describe("dongSoTamCamOn — một dòng số tấm ở màn Cảm ơn", () => {
  it("thiếu (đã chọn < hạn mức): Đã chọn N / M tấm trong gói, KHÔNG phải đủ gói", () => {
    expect(dongSoTamCamOn(1, 10)).toBe("Đã chọn 1 / 10 tấm trong gói");
    expect(dongSoTamCamOn(6, 20)).toBe("Đã chọn 6 / 20 tấm trong gói");
    expect(dongSoTamCamOn(9, 10)).toBe("Đã chọn 9 / 10 tấm trong gói");
  });

  it("đúng (đã chọn = hạn mức): đủ gói", () => {
    expect(dongSoTamCamOn(10, 10)).toBe("Đã chọn 10 tấm, đủ gói");
  });

  it("vượt (đã chọn > hạn mức): nói số tấm thêm", () => {
    expect(dongSoTamCamOn(12, 10)).toBe("Đã chọn 12 / 10 tấm, thêm 2 tấm");
  });

  it("không biết hạn mức: chỉ nói số đã chọn, không bịa số gói", () => {
    expect(dongSoTamCamOn(5, null)).toBe("Đã chọn 5 tấm");
  });
});
