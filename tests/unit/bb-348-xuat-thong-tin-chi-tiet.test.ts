/**
 * BB-348 mục 2 — dạng xuất "Thông tin chi tiết": mỗi ảnh MỘT dòng.
 * Hàm thuần `dongAnhChiTiet`; phép thử qua route thật nằm ở bb-214b-xuat-chi-tiet.test.ts.
 */
import { describe, it, expect } from "vitest";
import { dongAnhChiTiet, nhanBiaAlbum } from "@/lib/gallery/xuat-danh-sach";

describe("BB-348: một dòng cho một ảnh trong 'Thông tin chi tiết'", () => {
  it("có cả dùng cho và ghi chú → đúng mẫu anh đưa", () => {
    expect(
      dongAnhChiTiet({
        tenFile: "R01_0008.JPG",
        dungCho: [nhanBiaAlbum("Album 20x20")],
        ghiChu: "xóa mụn cho bé dùm chị",
      }),
    ).toBe('R01_0008.JPG (Dùng cho: BÌA Album 20x20 · "xóa mụn cho bé dùm chị")');
  });

  it("chỉ có ghi chú → ngoặc chỉ chứa ghi chú", () => {
    expect(dongAnhChiTiet({ tenFile: "R01_0010.JPG", dungCho: [], ghiChu: "làm sáng da" })).toBe(
      'R01_0010.JPG ("làm sáng da")',
    );
  });

  it("chỉ dùng cho sản phẩm in → nhiều sản phẩm nối dấu phẩy, không có phần ghi chú", () => {
    expect(
      dongAnhChiTiet({ tenFile: "R01_0011.JPG", dungCho: ["Gỗ 15x21", "Album 20x20"], ghiChu: null }),
    ).toBe("R01_0011.JPG (Dùng cho: Gỗ 15x21, Album 20x20)");
  });

  it("không ghi chú, không dùng cho gì → CHỈ tên file", () => {
    expect(dongAnhChiTiet({ tenFile: "R01_0012.JPG", dungCho: [], ghiChu: null })).toBe("R01_0012.JPG");
    expect(dongAnhChiTiet({ tenFile: "R01_0012.JPG", dungCho: [" "], ghiChu: "   " })).toBe("R01_0012.JPG");
  });

  it("ghi chú nhiều dòng gộp về một dòng — mỗi ảnh vẫn đúng một dòng", () => {
    const dong = dongAnhChiTiet({ tenFile: "A.JPG", dungCho: [], ghiChu: "dòng 1\r\ndòng 2\n  dòng 3" });
    expect(dong).toBe('A.JPG ("dòng 1 dòng 2 dòng 3")');
    expect(dong).not.toMatch(/[\r\n]/);
  });
});
