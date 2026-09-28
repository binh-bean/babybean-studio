/**
 * BB-298 — câu dự phòng BA BẬC cho bìa máy khách (bản vẽ
 * `bia-khong-ten-dien-thoai.html`, admin duyệt 28/09/2026 mục 2):
 *   1. Có tên bé → "Bộ ảnh của" / Tên bé / loại buổi chụp (nghiêng).
 *   2. Không tên bé, CÓ loại buổi chụp → "Bộ ảnh" / Loại buổi chụp / "của con".
 *   3. Không có cả hai → "Bộ ảnh" / "Ngày {d} tháng {m}" / "của gia đình mình".
 *
 * Canh hàm THUẦN `tinhBiaMacDinh` (không dựng DOM, không đọc mã nguồn làm dữ
 * liệu thử — AGENTS.md §5a).
 */
import { describe, it, expect } from "vitest";
import { tinhBiaMacDinh } from "@/components/features/gallery/bia-bo-anh";

describe("BB-298: tinhBiaMacDinh — câu dự phòng ba bậc", () => {
  it("1. Có tên bé và loại buổi chụp → eyebrow 'Bộ ảnh của', title = tên bé, phụ đề = loại buổi chụp", () => {
    const r = tinhBiaMacDinh("Bé Na", "Thôi nôi", "2026-09-12");
    expect(r).toEqual({ eyebrow: "Bộ ảnh của", title: "Bé Na", phuDe: "Thôi nôi" });
  });

  it("2. Có tên bé, KHÔNG loại buổi chụp → phụ đề null (không bịa)", () => {
    const r = tinhBiaMacDinh("Bé Na", null, "2026-09-12");
    expect(r).toEqual({ eyebrow: "Bộ ảnh của", title: "Bé Na", phuDe: null });
  });

  it("3. KHÔNG tên bé, CÓ loại buổi chụp → eyebrow 'Bộ ảnh', title = loại buổi chụp, phụ đề = 'của con'", () => {
    const r = tinhBiaMacDinh(null, "Newborn", "2026-09-12");
    expect(r).toEqual({ eyebrow: "Bộ ảnh", title: "Newborn", phuDe: "của con" });
  });

  it("4. Không có cả tên bé lẫn loại buổi chụp, CÓ ngày chụp → title = 'Ngày d tháng m', phụ đề = 'của gia đình mình'", () => {
    const r = tinhBiaMacDinh(null, null, "2026-09-12");
    expect(r).toEqual({ eyebrow: "Bộ ảnh", title: "Ngày 12 tháng 9", phuDe: "của gia đình mình" });
  });

  it("5. Không có gì cả (kể cả ngày chụp) → không ném lỗi, có tiêu đề dự phòng cuối cùng", () => {
    const r = tinhBiaMacDinh(null, null, null);
    expect(r.title).toBe("Khoảnh khắc");
    expect(r.phuDe).toBe("của gia đình mình");
  });

  it("6. Chuỗi toàn khoảng trắng coi như không có (không hiện 'Bộ ảnh của' rỗng)", () => {
    const r = tinhBiaMacDinh("   ", "   ", "2026-09-12");
    expect(r.eyebrow).toBe("Bộ ảnh");
    expect(r.title).toBe("Ngày 12 tháng 9");
  });
});
