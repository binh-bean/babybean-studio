/**
 * BB-379 — hàm thuần của bộ lọc "Chưa có tên bé". Phần đi qua route + cơ sở dữ liệu nằm ở
 * bb-379-ten-be-bo-anh.test.ts.
 */
import { describe, it, expect } from "vitest";
import { chuaCoTenBe, catTrang, demTheoTrangThai } from "@/lib/gallery/loc-chua-ten-be";

describe("BB-379: lọc chưa có tên bé", () => {
  it("chỉ coi là CÓ tên bé khi nickname hoặc họ tên có chữ", () => {
    expect(chuaCoTenBe({ babyName: null, babyFullName: null })).toBe(true);
    expect(chuaCoTenBe({ babyName: "  ", babyFullName: "" })).toBe(true);
    expect(chuaCoTenBe({})).toBe(true);
    expect(chuaCoTenBe({ babyName: "Mít", babyFullName: null })).toBe(false);
    expect(chuaCoTenBe({ babyName: null, babyFullName: "Trần Minh Khôi" })).toBe(false);
  });

  it("cắt trang theo vị trí TRONG danh sách đã lọc", () => {
    const ds = [1, 2, 3, 4, 5];
    expect(catTrang(ds, 0, 2)).toEqual({ items: [1, 2], hasMore: true });
    expect(catTrang(ds, 4, 2)).toEqual({ items: [5], hasMore: false });
    expect(catTrang(ds, 2, 3)).toEqual({ items: [3, 4, 5], hasMore: false });
  });

  it("đếm theo trạng thái trên danh sách đã lọc", () => {
    expect(demTheoTrangThai([{ status: "ready" }, { status: "ready" }, { status: "draft" }, {}])).toEqual({
      all: 4,
      ready: 2,
      draft: 1,
    });
  });
});
