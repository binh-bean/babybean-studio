/**
 * BB-303 — SĐT dạng nhóm 4-3-3 ("0901 000 001") theo bản vẽ BB-301
 * (bo-anh-danh-sach.png, khach-hang.png). Canh `formatSdt`
 * (src/lib/utils/dinh-dang.ts).
 */

import { describe, it, expect } from "vitest";
import { formatSdt } from "@/lib/utils/dinh-dang";

describe("BB-303: formatSdt", () => {
  it("số 10 chữ số liền -> nhóm 4-3-3", () => {
    expect(formatSdt("0901000001")).toBe("0901 000 001");
  });

  it("số đã có khoảng trắng/dấu chấm -> chuẩn hoá lại đúng nhóm", () => {
    expect(formatSdt("0912.345.678")).toBe("0912 345 678");
    expect(formatSdt("0912 345 678")).toBe("0912 345 678");
  });

  it("không phải 10 chữ số (số bàn, dữ liệu bẩn) -> trả nguyên văn, KHÔNG bịa nhóm", () => {
    expect(formatSdt("02838123456")).toBe("02838123456"); // 11 số
    expect(formatSdt("0901")).toBe("0901"); // quá ngắn
  });

  it("rỗng/null -> chuỗi rỗng", () => {
    expect(formatSdt(null)).toBe("");
    expect(formatSdt(undefined)).toBe("");
    expect(formatSdt("")).toBe("");
  });
});
