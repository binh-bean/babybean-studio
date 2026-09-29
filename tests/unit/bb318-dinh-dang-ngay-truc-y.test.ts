/**
 * BB-318 — Q-c (một hàm ngày dùng chung) và Q-d (trục Y chỉ số nguyên).
 * Hàm thuần, không giả lập gì.
 */
import { describe, it, expect } from "vitest";
import { formatNgayGioVN, formatKhoangNgayVN, formatGioVN, formatNgayVN } from "@/lib/utils/dinh-dang";
import { mocTrucY } from "@/lib/bao-cao/truc-y";

describe("BB-318 Q-c — định dạng ngày dùng chung", () => {
  it("ngày: dd/mm/yyyy có số 0 đệm", () => {
    expect(formatNgayVN(new Date(2026, 8, 9))).toBe("09/09/2026");
  });

  it("ngày kèm giờ: dd/mm/yyyy HH:mm (không giây, không dấu phẩy)", () => {
    expect(formatNgayGioVN(new Date(2026, 8, 28, 9, 43, 12))).toBe("28/09/2026 09:43");
    expect(formatGioVN(new Date(2026, 8, 28, 7, 5))).toBe("07:05");
  });

  it("khoảng cùng năm: dd/mm – dd/mm/yyyy; khác năm: đủ năm hai đầu", () => {
    expect(formatKhoangNgayVN("2026-09-23", "2026-09-29")).toBe("23/09 – 29/09/2026");
    expect(formatKhoangNgayVN("2025-12-28", "2026-01-03")).toBe("28/12/2025 – 03/01/2026");
  });

  it("'yyyy-mm-dd' trần là ngày lịch, không lệch ngày theo múi giờ", () => {
    expect(formatNgayVN("2026-09-09")).toBe("09/09/2026");
    expect(formatKhoangNgayVN(new Date(2026, 8, 1), "2026-09-07")).toBe("01/09 – 07/09/2026");
  });

  it("đầu vào rỗng hoặc hỏng thì trả chuỗi rỗng, không bịa ngày", () => {
    expect(formatNgayGioVN(null)).toBe("");
    expect(formatNgayGioVN("không phải ngày")).toBe("");
    expect(formatKhoangNgayVN("2026-09-23", null)).toBe("");
  });
});

describe("BB-318 Q-d — vạch trục Y chỉ số nguyên, không lặp", () => {
  it.each([1, 2, 3, 4, 5, 7, 10, 13, 17, 40, 100, 250, 1234])("max=%i: toàn số nguyên, tăng ngặt, từ 0, phủ hết max", (max) => {
    const moc = mocTrucY(max);
    expect(moc[0]).toBe(0);
    expect(moc.every((v) => Number.isInteger(v))).toBe(true);
    expect(new Set(moc).size).toBe(moc.length);
    expect(moc.slice(1).every((v, i) => v > moc[i]!)).toBe(true);
    expect(moc[moc.length - 1]).toBeGreaterThanOrEqual(max);
    expect(moc.length).toBeLessThanOrEqual(6);
  });

  it("ca lỗi gốc: max=1 và max=2 không còn '0, 0, 1, 1, 1'", () => {
    expect(mocTrucY(1)).toEqual([0, 1]);
    expect(mocTrucY(2)).toEqual([0, 1, 2]);
  });

  it("số lẻ và giá trị hỏng vẫn ra số nguyên", () => {
    expect(mocTrucY(0.4)).toEqual([0, 1]);
    expect(mocTrucY(Number.NaN)).toEqual([0, 1]);
  });
});
