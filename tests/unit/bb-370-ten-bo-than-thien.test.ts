/**
 * BB-370 — tên bộ ảnh cho khách (ô chuyển bộ, trang gia đình, danh sách buổi
 * chụp) KHÔNG BAO GIỜ là mã hoá đơn. Anh khoanh đỏ "HD_20260909#5067" ở ô
 * chuyển bộ (06/10/2026).
 *
 * Canh hàm thuần `tenBoThanThien` + `tenBoHienThi` (chỗ màn khách gọi thật) —
 * không đọc mã nguồn, không dựng DOM (AGENTS.md §5a).
 */
import { describe, it, expect } from "vitest";
import { laMaHoaDon, tenBoThanThien, tieuDeChoKhach } from "@/lib/utils/ten-bo-than-thien";
import { tenBoHienThi } from "@/lib/utils/trang-gia-dinh";

/** Mọi dạng tiêu đề thật thấy trên bb-dev (đã thay số). */
const MA_HOA_DON = [
  "HD_20260909#5067",
  "HD_20260909#506",
  "HD_20260909#5067 + HD_20260910#5071",
  "Mai · HD_20260901#1234_12345,HD_20260901#1235_12346",
  "hd_20260909#5067",
  "HD-20260909",
];

describe("BB-370: laMaHoaDon", () => {
  it.each(MA_HOA_DON)("nhận ra mã hoá đơn: %s", (t) => {
    expect(laMaHoaDon(t)).toBe(true);
    expect(tieuDeChoKhach(t)).toBeNull();
  });

  it.each(["Thôi nôi", "Newborn ngày đầu", "Bé Mít thôi nôi", "Sinh nhật 1 tuổi", "Buổi chụp 2026"])(
    "không nhầm tên buổi thường là mã: %s",
    (t) => {
      expect(laMaHoaDon(t)).toBe(false);
      expect(tieuDeChoKhach(t)).toBe(t);
    },
  );
});

describe("BB-370: tenBoThanThien — không bao giờ ra mã hoá đơn", () => {
  it("có bé + tiêu đề là mã hoá đơn → 'Bé … · ngày chụp'", () => {
    expect(tenBoThanThien({ tenBe: "Bé Mít", tieuDe: "HD_20260909#5067", ngayChup: "2026-09-13" })).toBe(
      "Bé Mít · 13/09/2026",
    );
  });

  it("không bé + mã hoá đơn → 'Buổi chụp ngày'", () => {
    expect(tenBoThanThien({ tenBe: null, tieuDe: "HD_20260909#5067", ngayChup: "2026-09-13" })).toBe(
      "Buổi chụp 13/09/2026",
    );
  });

  it("không bé, không ngày, mã hoá đơn → 'Buổi chụp' (không lùi về mã)", () => {
    expect(tenBoThanThien({ tenBe: null, tieuDe: "HD_20260909#5067", ngayChup: null })).toBe("Buổi chụp");
  });

  it("có loại buổi → 'Bé … · loại buổi'", () => {
    expect(tenBoThanThien({ tenBe: "Bé Na", tieuDe: "HD_20260909#5067", loaiBuoi: "Thôi nôi", ngayChup: "2026-09-13" })).toBe(
      "Bé Na · Thôi nôi",
    );
  });

  it("tiêu đề thường (không phải mã) vẫn dùng như cũ", () => {
    expect(tenBoThanThien({ tenBe: "Bé Mít", tieuDe: "Thôi nôi" })).toBe("Bé Mít · Thôi nôi");
    expect(tenBoThanThien({ tenBe: "Bé Mít", tieuDe: "Bé Mít thôi nôi" })).toBe("Bé Mít thôi nôi");
  });

  it.each(MA_HOA_DON)("mọi dạng mã '%s' → kết quả không chứa 'HD_'/'#'", (t) => {
    for (const tenBe of [null, "Bé Mít"]) {
      for (const ngayChup of [null, "2026-09-13"]) {
        const ten = tenBoThanThien({ tenBe, tieuDe: t, ngayChup });
        expect(ten).not.toMatch(/HD[_-]?\d/i);
        expect(ten).not.toContain("#");
      }
    }
  });
});

describe("BB-370: tenBoHienThi (ô chuyển bộ màn khách)", () => {
  it("bộ có tiêu đề là mã hoá đơn → tên thân thiện từ bé + ngày chụp", () => {
    expect(tenBoHienThi({ tenBe: null, tieuDe: "HD_20260909#5067", ngayChup: "2026-09-13" })).toBe(
      "Buổi chụp 13/09/2026",
    );
    expect(tenBoHienThi({ tenBe: "Bé Xoài", tieuDe: "HD_20260909#5067", ngayChup: "2026-09-13" })).toBe(
      "Bé Xoài · 13/09/2026",
    );
  });
});
