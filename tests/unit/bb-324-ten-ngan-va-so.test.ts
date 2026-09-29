/**
 * BB-324 — hai hàm dùng chung mới trong `src/lib/utils/dinh-dang.ts`:
 *
 *  1. `tenNganManHinhChinh` — tên dưới biểu tượng khi ba mẹ "Thêm vào màn hình
 *     chính". Trước bản vá: `tenBe.slice(0, 12)` → "Nguyễn Ngọc " (cắt ngang
 *     chữ), và "BabyBean" viết liền khi không có tên bé.
 *  2. `formatSo` / `formatTien` — dấu chấm hàng nghìn kiểu Việt Nam cho MỌI
 *     số trên màn quản trị và màn khách ("1.234", "12.500.000 ₫").
 */
import { describe, it, expect } from "vitest";
import {
  formatSo,
  formatTien,
  nhanTienDoChon,
  tenNganManHinhChinh,
  tinhTenBiaTuDuLieu,
} from "@/lib/utils/dinh-dang";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { formatVnd, formatQuotaSummary } from "@/lib/selection/quota";

const doDai = (s: string) => [...s.normalize("NFC")].length;

describe("BB-324: tenNganManHinhChinh", () => {
  it("có biệt danh → 'Bé Xoài'; biệt danh đã có 'Bé' thì không lặp", () => {
    expect(tenNganManHinhChinh("Xoài", "Nguyễn Ngọc Bảo An")).toBe("Bé Xoài");
    expect(tenNganManHinhChinh("Bé Mít", null)).toBe("Bé Mít");
  });

  it("chỉ có họ tên → 'Bé' + 1–2 chữ cuối, ≤ 12 ký tự", () => {
    expect(tenNganManHinhChinh(null, "Nguyễn Ngọc Bảo An")).toBe("Bé Bảo An");
    expect(tenNganManHinhChinh("", "Lê An")).toBe("Bé Lê An");
    expect(tenNganManHinhChinh(null, "An")).toBe("Bé An");
    // "Bé Khánh Linh" = 13 ký tự > 12 → chỉ giữ chữ cuối.
    expect(tenNganManHinhChinh(null, "Trần Thị Khánh Linh")).toBe("Bé Linh");
  });

  it("không có tên → 'Baby Bean' (có dấu cách, không phải 'BabyBean')", () => {
    expect(tenNganManHinhChinh(null, null)).toBe("Baby Bean");
    expect(tenNganManHinhChinh("  ", "   ")).toBe("Baby Bean");
  });

  it("tên dài: không bao giờ cắt giữa chữ, không vượt 12 ký tự khi còn cách", () => {
    // Biệt danh dài: giữ chữ ĐẦU của biệt danh.
    expect(tenNganManHinhChinh("Bin Béo Ú Nu", null)).toBe("Bé Bin Béo");
    // Một chữ quá dài: giữ trọn chữ, để hệ điều hành tự cắt hiển thị.
    expect(tenNganManHinhChinh(null, "Nguyễn Maximilianus")).toBe("Bé Maximilianus");
    // Dữ liệu dạng NFD (dấu tách rời) vẫn đếm đúng số ký tự hiển thị.
    expect(tenNganManHinhChinh(null, "Nguyễn Ngọc Bảo An".normalize("NFD"))).toBe("Bé Bảo An");
  });

  it("KIỂM NGƯỢC — công thức cũ `slice(0, 12)` cắt ngang chữ; hàm mới thì không", () => {
    const ds: Array<[string | null, string | null]> = [
      [null, "Nguyễn Ngọc Bảo An"],
      [null, "Trần Thị Khánh Linh"],
      [null, "Phạm Hoàng Minh Khôi"],
      ["Su Su Bông Bông", null],
    ];
    for (const [nick, hoTen] of ds) {
      const tenBe = tinhTenBiaTuDuLieu(nick, hoTen);
      const cu = tenBe.slice(0, 12);
      const moi = tenNganManHinhChinh(nick, hoTen);
      const chuGoc = new Set(tenBe.normalize("NFC").split(/\s+/));
      // Công thức cũ có ít nhất một chữ không trọn (hoặc dấu cách thừa cuối).
      const cuCoChuVo = cu !== cu.trim() || cu.split(/\s+/).some((c) => c && !chuGoc.has(c));
      expect(cuCoChuVo, `slice cũ "${cu}"`).toBe(true);
      // Hàm mới: mọi chữ sau "Bé" là chữ TRỌN của tên gốc, và ≤ 12 ký tự.
      const [dau, ...con] = moi.split(" ");
      expect(dau).toBe("Bé");
      for (const c of con) expect(chuGoc.has(c), `"${c}" trong "${moi}"`).toBe(true);
      expect(doDai(moi)).toBeLessThanOrEqual(12);
    }
  });
});

describe("BB-324: formatSo / formatTien — dấu chấm hàng nghìn", () => {
  it("số đếm", () => {
    expect(formatSo(0)).toBe("0");
    expect(formatSo(999)).toBe("999");
    expect(formatSo(1000)).toBe("1.000");
    expect(formatSo(1234)).toBe("1.234");
    expect(formatSo(1234567)).toBe("1.234.567");
    expect(formatSo(-45000)).toBe("-45.000");
  });

  it("phần lẻ dùng dấu phẩy, bỏ số 0 thừa", () => {
    expect(formatSo(12.5, 1)).toBe("12,5");
    expect(formatSo(12, 1)).toBe("12");
    expect(formatSo(1234.56, 1)).toBe("1.234,6");
    expect(formatSo(1234.4)).toBe("1.234");
  });

  it("không phải số → chuỗi rỗng", () => {
    expect(formatSo(null)).toBe("");
    expect(formatSo(undefined)).toBe("");
    expect(formatSo(Number.NaN)).toBe("");
    expect(formatTien(null)).toBe("");
  });

  it("tiền: '12.500.000 ₫', làm tròn tới đồng, dấu cách không ngắt dòng", () => {
    expect(formatTien(12_500_000)).toBe("12.500.000 ₫");
    expect(formatTien(999.6)).toBe("1.000 ₫");
    expect(formatTien(0)).toBe("0 ₫");
  });

  it("mọi hàm tiền cũ đi qua CÙNG một hàm", () => {
    for (const n of [0, 5000, 12_500_000, 1_234_567]) {
      expect(formatCurrencyVND(n)).toBe(formatTien(n));
      expect(formatVnd(n)).toBe(formatTien(n));
    }
  });

  it("nhãn tiến độ chọn và thanh chọn có dấu chấm khi ≥ 1.000", () => {
    expect(nhanTienDoChon({ selectedCount: 1234, includedQuota: 2000 }).ngan).toBe("1.234/2.000 tấm");
    expect(
      formatQuotaSummary({
        selectedCount: 1500,
        includedQuota: 1000,
        extraCount: 500,
        extraAmount: 25_000_000,
      } as Parameters<typeof formatQuotaSummary>[0]),
    ).toBe("Đã chọn 1.500/1.000 · thêm 500 ảnh = 25.000.000 ₫");
  });
});
