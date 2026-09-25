import { describe, it, expect } from "vitest";
import { tinhDoSang, chonMauChu } from "../../src/lib/utils/do-sang";

describe("tinhDoSang", () => {
  it("trả về 0 cho ảnh rỗng", () => {
    const data = new Uint8ClampedArray(4);
    expect(tinhDoSang(data, 1, 1, 0, 1)).toBe(0);
  });

  it("tính đúng độ sáng của ảnh toàn trắng", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255]);
    expect(tinhDoSang(data, 1, 1, 0, 1)).toBeCloseTo(255);
  });

  it("tính đúng độ sáng của ảnh đen", () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255]);
    expect(tinhDoSang(data, 1, 1, 0, 1)).toBeCloseTo(0);
  });

  it("chọn màu chữ đúng", () => {
    expect(chonMauChu(255)).toBe("toi");
    expect(chonMauChu(0)).toBe("sang");
  });
});
