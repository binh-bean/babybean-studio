/**
 * BB-341 — URL ảnh thẳng lh3 (src/lib/utils/anh-lh3.ts, src/lib/utils/lightbox.ts).
 *
 * Canh: (1) có mã tệp hợp lệ thì đi THẲNG lh3 với ĐÚNG tham số `=w<cỡ>` mà
 * `/api/img` vẫn điều hướng tới — cùng tấm, cùng độ nét, không hạ chất lượng;
 * (2) không có / mã lạ thì quay về `/api/img` như cũ — không bao giờ ghép một
 * chuỗi lạ vào URL; (3) đường lùi luôn ép qua proxy (`qua=1`).
 */
import { describe, it, expect } from "vitest";
import { urlAnh, urlAnhDuPhong, maTepHopLe } from "@/lib/utils/anh-lh3";
import { buildLightboxImageUrl, buildLightboxSrcSet } from "@/lib/utils/lightbox";

const MA = "1AbC_dEf-GhIjKlMnOpQrStUvWxYz0123";

describe("BB-341 — URL ảnh thẳng lh3", () => {
  it("có mã tệp → lh3 với đúng cỡ đã xin (không đổi độ phân giải)", () => {
    expect(urlAnh({ id: "p1", maTepDrive: MA }, 400)).toBe(`https://lh3.googleusercontent.com/d/${MA}=w400`);
    expect(buildLightboxImageUrl("p1", 1600, MA)).toBe(`https://lh3.googleusercontent.com/d/${MA}=w1600`);
    expect(buildLightboxImageUrl("p1", 2048, MA)).toBe(`https://lh3.googleusercontent.com/d/${MA}=w2048`);
    expect(buildLightboxSrcSet("p1", MA)).toBe(
      `https://lh3.googleusercontent.com/d/${MA}=w800 800w, https://lh3.googleusercontent.com/d/${MA}=w1600 1600w`,
    );
  });

  it("không có mã tệp → route cũ /api/img (hành vi trước BB-341)", () => {
    expect(urlAnh({ id: "p1" }, 400)).toBe("/api/img/p1?w=400");
    expect(urlAnh({ id: "p1", maTepDrive: null }, 400)).toBe("/api/img/p1?w=400");
    expect(buildLightboxImageUrl("p1", 1600)).toBe("/api/img/p1?w=1600");
  });

  it("mã tệp lạ (ký tự chèn URL) → không ghép, quay về /api/img", () => {
    for (const la of ["abc/../../x", "a?b=c&d", "x".repeat(5), "id with space 0123456", "<script>xxxxxxxx"]) {
      expect(maTepHopLe(la)).toBe(false);
      expect(urlAnh({ id: "p1", maTepDrive: la }, 400)).toBe("/api/img/p1?w=400");
    }
  });

  it("đường lùi khi lh3 lỗi → /api/img ép qua proxy", () => {
    expect(urlAnhDuPhong("p1", 400)).toBe("/api/img/p1?w=400&qua=1");
  });
});
