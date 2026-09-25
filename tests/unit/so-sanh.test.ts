/**
 * Phép thử cho `lib/gallery/so-sanh.ts` (BB-218) — thêm/bớt danh sách so
 * sánh, giới hạn 4 tấm không trùng, và bố cục theo số tấm + hướng màn.
 */

import { describe, it, expect } from "vitest";
import {
  themVaoSoSanh,
  boKhoiSoSanh,
  daDuSoSanh,
  duSoSanh,
  boCucSoSanh,
  danhSachVuotGhim,
  chiSoBanDauVuot,
  chiSoVuotKeTiep,
  chiSoVuotTruoc,
  SO_SANH_TOI_THIEU,
  SO_SANH_TOI_DA,
} from "@/lib/gallery/so-sanh";

describe("themVaoSoSanh", () => {
  it("thêm tấm mới vào cuối danh sách", () => {
    expect(themVaoSoSanh(["a"], "b")).toEqual(["a", "b"]);
  });

  it("không thêm trùng một tấm đã có", () => {
    expect(themVaoSoSanh(["a", "b"], "a")).toEqual(["a", "b"]);
  });

  it("không vượt quá tối đa 4 tấm", () => {
    const day = ["a", "b", "c", "d"];
    expect(day.length).toBe(SO_SANH_TOI_DA);
    expect(themVaoSoSanh(day, "e")).toEqual(day);
  });
});

describe("boKhoiSoSanh", () => {
  it("bỏ đúng tấm khỏi danh sách", () => {
    expect(boKhoiSoSanh(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("bỏ một tấm không có trong danh sách thì không đổi gì", () => {
    expect(boKhoiSoSanh(["a", "b"], "z")).toEqual(["a", "b"]);
  });
});

describe("daDuSoSanh / duSoSanh", () => {
  it("chưa đủ tối thiểu 2 tấm thì duSoSanh false", () => {
    expect(duSoSanh([])).toBe(false);
    expect(duSoSanh(["a"])).toBe(false);
  });

  it("đủ 2 tấm trở lên thì duSoSanh true", () => {
    expect(duSoSanh(["a", "b"])).toBe(true);
  });

  it("chỉ đủ tối đa (4 tấm) mới báo daDuSoSanh true", () => {
    expect(daDuSoSanh(["a", "b", "c"])).toBe(false);
    expect(daDuSoSanh(["a", "b", "c", "d"])).toBe(true);
  });
});

describe("boCucSoSanh", () => {
  it("2 tấm, màn dọc (điện thoại cầm dọc) → xếp trên/dưới", () => {
    expect(boCucSoSanh(2, true)).toBe("doc");
  });

  it("2 tấm, màn ngang hoặc máy tính → xếp trái/phải", () => {
    expect(boCucSoSanh(2, false)).toBe("ngang");
  });

  it("3 tấm luôn lưới 2×2, dù màn dọc hay ngang", () => {
    expect(boCucSoSanh(3, true)).toBe("luoi");
    expect(boCucSoSanh(3, false)).toBe("luoi");
  });

  it("4 tấm (tối đa) luôn lưới 2×2", () => {
    expect(boCucSoSanh(4, true)).toBe("luoi");
    expect(boCucSoSanh(4, false)).toBe("luoi");
  });
});

describe("hằng số", () => {
  it("tối thiểu 2 tấm, tối đa 4 tấm", () => {
    expect(SO_SANH_TOI_THIEU).toBe(2);
    expect(SO_SANH_TOI_DA).toBe(4);
  });
});

describe("danhSachVuotGhim (BB-242)", () => {
  it("chỉ đánh dấu đúng 2 tấm (tối thiểu) → vuốt trong toàn bộ tấm đã thả tim", () => {
    expect(danhSachVuotGhim(["a", "b"], ["x", "y", "z"])).toEqual(["x", "y", "z"]);
  });

  it("đánh dấu 3 tấm trở lên → vuốt đúng trong nhóm đã đánh dấu, không lẫn tấm khác", () => {
    expect(danhSachVuotGhim(["a", "b", "c"], ["x", "y", "z", "w"])).toEqual(["a", "b", "c"]);
  });

  it("đánh dấu đủ 4 tấm (tối đa) → vẫn vuốt đúng nhóm đã đánh dấu", () => {
    expect(danhSachVuotGhim(["a", "b", "c", "d"], ["x"])).toEqual(["a", "b", "c", "d"]);
  });
});

describe("chiSoBanDauVuot", () => {
  it("đứng ngay tại tấm không-ghim trong danh sách vuốt", () => {
    expect(chiSoBanDauVuot(["x", "y", "z"], "y")).toBe(1);
  });

  it("tấm không-ghim không còn trong danh sách (ví dụ bị bỏ tim) → về 0", () => {
    expect(chiSoBanDauVuot(["x", "y", "z"], "khong-co")).toBe(0);
  });
});

describe("chiSoVuotKeTiep / chiSoVuotTruoc", () => {
  it("đi tới dừng lại ở cuối danh sách, không vòng lại đầu", () => {
    expect(chiSoVuotKeTiep(3, 0)).toBe(1);
    expect(chiSoVuotKeTiep(3, 1)).toBe(2);
    expect(chiSoVuotKeTiep(3, 2)).toBe(2);
  });

  it("danh sách rỗng thì luôn về 0", () => {
    expect(chiSoVuotKeTiep(0, 0)).toBe(0);
  });

  it("lùi dừng lại ở đầu danh sách, không vòng lại cuối", () => {
    expect(chiSoVuotTruoc(2)).toBe(1);
    expect(chiSoVuotTruoc(1)).toBe(0);
    expect(chiSoVuotTruoc(0)).toBe(0);
  });
});
