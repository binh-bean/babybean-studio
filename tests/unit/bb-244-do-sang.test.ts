/**
 * BB-244 — đo độ sáng vùng đặt chữ trên ảnh bìa để chọn màu chữ đọc được.
 * Ảnh giả dựng bằng mảng điểm ảnh: nửa trên TRẮNG, nửa dưới ĐEN.
 */
import { describe, it, expect } from "vitest";
import { tinhDoSang, chonMauChu } from "@/lib/utils/do-sang";

function anhNuaTrangNuaDen(w: number, h: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = y < h / 2 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  return d;
}

describe("tinhDoSang / chonMauChu", () => {
  const w = 10, h = 20;
  const anh = anhNuaTrangNuaDen(w, h);

  it("đo đúng VÙNG: nửa trên sáng, nửa dưới tối", () => {
    expect(tinhDoSang(anh, w, h, 0, h / 2)).toBeCloseTo(255, 0);
    expect(tinhDoSang(anh, w, h, h / 2, h)).toBeCloseTo(0, 0);
  });

  it("vùng sáng → chữ TỐI; vùng tối → chữ SÁNG (kiểu Tạp chí chữ trên, Tối giản chữ dưới)", () => {
    expect(chonMauChu(tinhDoSang(anh, w, h, 0, h * 0.45))).toBe("toi");
    expect(chonMauChu(tinhDoSang(anh, w, h, h * 0.6, h))).toBe("sang");
  });

  it("điểm trong suốt không tính; vùng rỗng ra 0 (không chia cho 0)", () => {
    const trong = new Uint8ClampedArray(w * h * 4);
    expect(tinhDoSang(trong, w, h, 0, h)).toBe(0);
    expect(tinhDoSang(anh, w, h, 5, 5)).toBe(0);
  });
});
