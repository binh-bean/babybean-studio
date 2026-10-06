/**
 * BB-371 — luật màn quản trị: hộp hỏi lại "Gửi khách duyệt" và việc ẩn khối link Drive cũ.
 */
import { describe, it, expect } from "vitest";
import { cauHoiGuiKhach, hienKhoiVongDuyetCu, CAU_XAC_NHAN_VA_KHOA, ghiChuChungCuaVong } from "@/lib/anh-chinh-sua/quan-tri";
import { ghepGhiChu } from "@/lib/anh-chinh-sua/nhan-dien";

describe("BB-371 · hộp hỏi lại trước khi Gửi khách duyệt", () => {
  it("bộ còn Chờ xác nhận (submitted) → nói rõ danh sách chọn sẽ được xác nhận và khoá", () => {
    const c = cauHoiGuiKhach("submitted", 15);
    expect(c.seXacNhanVaKhoa).toBe(true);
    expect(c.chiTiet[0]).toContain(CAU_XAC_NHAN_VA_KHOA);
    expect(CAU_XAC_NHAN_VA_KHOA).toBe("Danh sách chọn của khách sẽ được xác nhận và khoá");
  });
  it("bộ đã xác nhận (in_retouch / awaiting_approval) → không nói chuyện khoá", () => {
    for (const s of ["in_retouch", "awaiting_approval"]) {
      const c = cauHoiGuiKhach(s, 2);
      expect(c.seXacNhanVaKhoa).toBe(false);
      expect(c.chiTiet.join(" ")).not.toContain(CAU_XAC_NHAN_VA_KHOA);
      expect(c.chiTiet.join(" ")).toContain("2 ảnh chỉnh");
    }
  });
});

describe("BB-371 · khối cũ 'Vòng duyệt ảnh đã chỉnh' (link Drive)", () => {
  it("bộ CÓ ảnh chỉnh trong app → ẩn khối cũ (ghi chú xin sửa không hiện hai lần)", () => {
    for (const status of ["in_retouch", "awaiting_approval", "approved"]) {
      expect(hienKhoiVongDuyetCu({ status, soVongSua: 2, coAnhChinhTrongApp: true })).toBe(false);
    }
  });
  it("bộ KHÔNG có thư mục ảnh chỉnh (luồng Drive cũ) → giữ khối cũ như trước", () => {
    expect(hienKhoiVongDuyetCu({ status: "in_retouch", soVongSua: 0, coAnhChinhTrongApp: false })).toBe(true);
    expect(hienKhoiVongDuyetCu({ status: "approved", soVongSua: 1, coAnhChinhTrongApp: false })).toBe(true);
    expect(hienKhoiVongDuyetCu({ status: "ready", soVongSua: 0, coAnhChinhTrongApp: false })).toBe(false);
  });
  it("chưa biết (đang tải / tải hỏng) → giữ khối cũ, không mất đường gửi link Drive", () => {
    expect(hienKhoiVongDuyetCu({ status: "in_retouch", soVongSua: 0, coAnhChinhTrongApp: null })).toBe(true);
  });
});

describe("BB-375 · ghi chú xin sửa không hiện hai lần trong khối quản trị", () => {
  const muc = (tenAnh: string, ghiChu: string) => ({ photoId: tenAnh, tenAnh, ghiChu, vung: [], anhMau: [] });
  const note = ghepGhiChu("Cảm ơn Bean", [muc("IMG_0001-Edit.jpg", "da bé sáng hơn"), muc("IMG_0002-Edit.jpg", "bỏ vết")]);

  it("có chi tiết từng tấm → chỉ còn ghi chú chung, không lặp ghi chú của tấm", () => {
    const chung = ghiChuChungCuaVong(note, ["IMG_0001-Edit.jpg", "IMG_0002-Edit.jpg"]);
    expect(chung).toBe("Cảm ơn Bean");
    expect(chung).not.toContain("da bé sáng hơn");
  });
  it("tấm KHÔNG có trong chi tiết (ghi hụt) → giữ dòng của tấm đó, không mất chữ khách viết", () => {
    expect(ghiChuChungCuaVong(note, ["IMG_0001-Edit.jpg"])).toBe("Cảm ơn Bean\n• IMG_0002-Edit.jpg: bỏ vết");
  });
  it("chưa có bảng chi tiết (0091 chưa áp) → hiện nguyên bản ghép", () => {
    expect(ghiChuChungCuaVong(note, [])).toBe(note);
  });
});
