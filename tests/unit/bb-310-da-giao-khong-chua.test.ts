/**
 * BB-310 mục 3 — báo cáo chấm độc lập vòng 4: dòng "Chưa có tấm nào trong
 * cuốn này" ("chưa" = còn chờ) vẫn hiện nguyên văn trên màn ĐÃ GIAO, dù màu
 * đã bớt đỏ từ BB-296. Sau khi giao, không còn gì "còn chờ" — khoá
 * (`khoa=true`, dùng chung cho "đã chốt chờ CSKH" lẫn "đã giao") đổi hẳn
 * sang câu quá khứ/trung tính, không còn chữ "chưa".
 *
 * Canh hàm THUẦN `loiTrangThai` (không dựng DOM — AGENTS.md §5a).
 */
import { describe, it, expect } from "vitest";
import { loiTrangThai, type DongSanPhamIn } from "@/components/features/gallery/tom-tat-san-pham-in";

function dongAlbum(anh: { id: string; fileName: string }[]): DongSanPhamIn {
  return { galleryItemId: "gi-1", name: "Album (Ultra HD) 15x21", quantity: 1, nhom: "album", anh };
}

function dongAnhIn(quantity: number, anh: { id: string; fileName: string }[]): DongSanPhamIn {
  return { galleryItemId: "gi-2", name: "Ảnh in UV 10x15", quantity, nhom: "anh_in", anh };
}

describe("BB-310 mục 3: loiTrangThai — album rỗng KHÔNG còn chữ 'Chưa' khi đã khoá", () => {
  it("chưa khoá, album rỗng → giữ nguyên câu cũ 'Chưa có tấm nào trong cuốn này'", () => {
    const r = loiTrangThai(dongAlbum([]), false);
    expect(r).toEqual({ chu: "Chưa có tấm nào trong cuốn này", thieu: true });
  });

  it("ĐÃ KHOÁ (đã giao), album rỗng → câu trung tính, không còn chữ 'Chưa'", () => {
    const r = loiTrangThai(dongAlbum([]), true);
    expect(r.thieu).toBe(true);
    expect(r.chu).toBe("Không có tấm nào trong cuốn");
    expect(r.chu).not.toMatch(/^Chưa/);
  });

  it("album đã có tấm → câu 'Đang có N tấm' giữ nguyên dù khoá hay không", () => {
    const anh = [{ id: "p1", fileName: "a.jpg" }];
    expect(loiTrangThai(dongAlbum(anh), false).chu).toBe("Đang có 1 tấm trong cuốn");
    expect(loiTrangThai(dongAlbum(anh), true).chu).toBe("Đang có 1 tấm trong cuốn");
  });

  it("ảnh in thiếu suất, ĐÃ KHOÁ → bỏ chữ 'Còn'/'chọn ảnh' (đã qua lúc chọn), vẫn nói đúng số liệu", () => {
    const r = loiTrangThai(dongAnhIn(2, [{ id: "p1", fileName: "a.jpg" }]), true);
    expect(r.thieu).toBe(true);
    // BB-319 (luật 4): "suất" là chữ nội bộ — nói bằng số tấm của khách.
    expect(r.chu).toBe("Có 1/2 tấm");
  });

  it("ảnh in thiếu, CHƯA khoá → 'Còn thiếu N tấm' (BB-319: không dùng chữ nội bộ 'suất')", () => {
    const r = loiTrangThai(dongAnhIn(2, [{ id: "p1", fileName: "a.jpg" }]), false);
    expect(r.chu).toBe("Còn thiếu 1 tấm");
  });

  it("ảnh in đủ suất → 'Đủ N tấm' giữ nguyên dù khoá hay không", () => {
    const anh = [{ id: "p1", fileName: "a.jpg" }, { id: "p2", fileName: "b.jpg" }];
    expect(loiTrangThai(dongAnhIn(2, anh), false).chu).toBe("Đủ 2 tấm");
    expect(loiTrangThai(dongAnhIn(2, anh), true).chu).toBe("Đủ 2 tấm");
  });
});
