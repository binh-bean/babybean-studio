/**
 * BB-313 mục 1 (ảnh chụp app thật, Đợt 9) — "Lỗi phông tiêu đề": bộ ảnh thật
 * có tiêu đề là mã hợp đồng dạng "HD_20260911#5087", hiện in bằng Playfair
 * (số 0 trông như O) và lặp lại ở dòng phụ ngay dưới. Chỉ đạo sửa: tiêu đề
 * lớn phải là TÊN (họ tên bé đầy đủ hoặc tên gọi, `tinhTenBiaTuDuLieu`),
 * không có tên bé thì lấy tên khách, và CHỈ khi không còn tên nào mới lùi về
 * mã hợp đồng — lúc đó `laMaHopDong` báo cho chỗ gọi biết để đổi phông (Be
 * Vietnam Pro tabular, không Playfair).
 *
 * Canh hàm THUẦN `tinhTieuDeBoAnhQuanTri` trong `dinh-dang.ts` — không dựng
 * DOM, không đọc mã nguồn làm dữ liệu thử (AGENTS.md §5a).
 */
import { describe, it, expect } from "vitest";
import { tinhTieuDeBoAnhQuanTri } from "@/lib/utils/dinh-dang";

describe("BB-313 mục 1: tinhTieuDeBoAnhQuanTri — tên đứng trước, mã hợp đồng chỉ khi hết tên", () => {
  // BB-325 (chỉ đạo "tên hiển thị" 29/09/2026) THAY luật "tên bé làm tiêu đề":
  // tiêu đề quản trị là TÊN MẸ; tên bé/gói xuống dòng thông tin. Ba ca đầu sửa theo.
  it("có tên mẹ → tiêu đề là TÊN MẸ, không ghép gói chụp, không phải mã hợp đồng", () => {
    const r = tinhTieuDeBoAnhQuanTri({
      packageName: "Newborn",
      babyNickname: "Bin",
      babyFullName: "Nguyễn Văn Bin",
      customerName: "Nguyễn Thị Mai",
      duPhong: "HD_20260911#5087",
    });
    expect(r).toEqual({ tieuDe: "Nguyễn Thị Mai", laMaHopDong: false });
  });

  it("có tên bé và tên mẹ, không có gói → vẫn là tên mẹ", () => {
    const r = tinhTieuDeBoAnhQuanTri({
      packageName: null,
      babyNickname: "Bin",
      babyFullName: "Nguyễn Văn Bin",
      customerName: "Nguyễn Thị Mai",
      duPhong: "HD_20260911#5087",
    });
    expect(r).toEqual({ tieuDe: "Nguyễn Thị Mai", laMaHopDong: false });
  });

  it("không có tên mẹ, mất nickname → HỌ TÊN BÉ ĐẦY ĐỦ NGUYÊN VẸN, không thêm 'Bé '", () => {
    const r = tinhTieuDeBoAnhQuanTri({
      packageName: null,
      babyNickname: null,
      babyFullName: "Nguyễn Văn An",
      customerName: null,
      duPhong: "HD_20260911#5087",
    });
    expect(r).toEqual({ tieuDe: "Nguyễn Văn An", laMaHopDong: false });
  });

  it("không có tên bé (cả nickname lẫn họ tên đầy đủ) → TÊN KHÁCH, không phải mã hợp đồng", () => {
    const r = tinhTieuDeBoAnhQuanTri({
      packageName: null,
      babyNickname: null,
      babyFullName: null,
      customerName: "Nguyễn Thị Mai",
      duPhong: "HD_20260911#5087",
    });
    expect(r).toEqual({ tieuDe: "Nguyễn Thị Mai", laMaHopDong: false });
  });

  it("không có tên bé lẫn tên khách → CHỈ LÚC ĐÓ mới lùi về mã hợp đồng, laMaHopDong=true", () => {
    const r = tinhTieuDeBoAnhQuanTri({
      packageName: null,
      babyNickname: null,
      babyFullName: null,
      customerName: null,
      duPhong: "HD_20260911#5087",
    });
    expect(r).toEqual({ tieuDe: "HD_20260911#5087", laMaHopDong: true });
  });

  it("có loại buổi nhưng không có tên bé lẫn tên khách → dùng tên khách nếu có, KHÔNG ghép loại buổi với mã hợp đồng", () => {
    const r = tinhTieuDeBoAnhQuanTri({
      packageName: "Newborn",
      babyNickname: null,
      babyFullName: null,
      customerName: null,
      duPhong: "HD_20260911#5087",
    });
    // Không có tên nào để ghép với "Newborn" — tieuDe phải là mã hợp đồng
    // TRẦN, không phải "Newborn · HD_20260911#5087" (không bịa ghép nối).
    expect(r).toEqual({ tieuDe: "HD_20260911#5087", laMaHopDong: true });
  });

  it("tên khách kèm khoảng trắng thừa được cắt trước khi dùng", () => {
    const r = tinhTieuDeBoAnhQuanTri({
      babyNickname: null,
      babyFullName: null,
      customerName: "  Trần Văn Bình  ",
      duPhong: "HD_20260911#5087",
    });
    expect(r.tieuDe).toBe("Trần Văn Bình");
  });
});
