/**
 * BB-303 — lời chào đầu trang Bảng điều khiển (bản vẽ BB-301: "Chào buổi
 * sáng, Admin" + "Thứ Hai, 28/09/2026"). Canh `chaoTheoBuoi`/`ngayDayDuVN`
 * (src/lib/utils/bang-dieu-khien.ts).
 */

import { describe, it, expect } from "vitest";
import { chaoTheoBuoi, ngayDayDuVN } from "@/lib/utils/bang-dieu-khien";

describe("BB-303: chaoTheoBuoi", () => {
  it("trước 11h -> buổi sáng", () => {
    expect(chaoTheoBuoi(9)).toBe("Chào buổi sáng");
    expect(chaoTheoBuoi(0)).toBe("Chào buổi sáng");
  });
  it("11h-17h -> buổi chiều", () => {
    expect(chaoTheoBuoi(11)).toBe("Chào buổi chiều");
    expect(chaoTheoBuoi(17)).toBe("Chào buổi chiều");
  });
  it("từ 18h -> buổi tối", () => {
    expect(chaoTheoBuoi(18)).toBe("Chào buổi tối");
    expect(chaoTheoBuoi(23)).toBe("Chào buổi tối");
  });
});

describe("BB-303: ngayDayDuVN", () => {
  it("28/09/2026 là Thứ Hai", () => {
    expect(ngayDayDuVN(new Date(2026, 8, 28))).toBe("Thứ Hai, 28/09/2026");
  });
  it("đệm số 0 cho ngày/tháng một chữ số", () => {
    expect(ngayDayDuVN(new Date(2026, 0, 5))).toBe("Thứ Hai, 05/01/2026");
  });
});
