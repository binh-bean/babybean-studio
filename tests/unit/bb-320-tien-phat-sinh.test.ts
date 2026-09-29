/**
 * BB-320 — công thức tiền phát sinh dùng chung giữa màn hình và route.
 *
 * Các hàm thuần, thử bằng số cụ thể; "kiểm ngược" (đổi công thức thì phải đỏ)
 * đã chạy tay và dán ở bàn giao.
 */
import { describe, it, expect } from "vitest";
import {
  HINH_THUC_GIAM_GIA,
  lamTronNghin,
  tinhGiamGia,
  tinhPhatSinhTheoHanMuc,
  cauBaoSauDoiHanMuc,
} from "@/lib/gallery/tien-phat-sinh";

const tien = (n: number) => `${new Intl.NumberFormat("vi-VN").format(n)} ₫`;

describe("BB-320: giảm giá % trên số còn thiếu", () => {
  it("làm tròn nghìn đồng: nửa nghìn lên, dưới nửa nghìn xuống", () => {
    expect(lamTronNghin(449_500)).toBe(450_000);
    expect(lamTronNghin(449_499)).toBe(449_000);
    expect(lamTronNghin(0)).toBe(0);
  });

  it("còn thiếu 500.000, giảm 10% → khách trả 450.000, giảm 50.000", () => {
    expect(tinhGiamGia(500_000, 10)).toEqual({ soTienGoiY: 450_000, soTienGiam: 50_000 });
  });

  it("gợi ý + giảm LUÔN đúng bằng số còn thiếu (không lệch một đồng khi làm tròn)", () => {
    for (const [thieu, pt] of [
      [333_000, 7],
      [100_000, 33],
      [1_234_000, 12.5],
      [50_000, 99],
    ] as const) {
      const r = tinhGiamGia(thieu, pt)!;
      expect(r.soTienGoiY + r.soTienGiam).toBe(thieu);
      expect(r.soTienGoiY % 1000).toBe(0);
    }
  });

  it("100% → khách không phải trả gì, giảm hết", () => {
    expect(tinhGiamGia(250_000, 100)).toEqual({ soTienGoiY: 0, soTienGiam: 250_000 });
  });

  it("không tính được: hết nợ, % ngoài (0,100], không phải số", () => {
    expect(tinhGiamGia(0, 10)).toBeNull();
    expect(tinhGiamGia(-5_000, 10)).toBeNull();
    expect(tinhGiamGia(100_000, 0)).toBeNull();
    expect(tinhGiamGia(100_000, -1)).toBeNull();
    expect(tinhGiamGia(100_000, 101)).toBeNull();
    expect(tinhGiamGia(100_000, Number.NaN)).toBeNull();
  });

  it("dòng giảm giá có tên loại cố định (route và báo cáo cùng đọc chuỗi này)", () => {
    expect(HINH_THUC_GIAM_GIA).toBe("giam_gia");
  });
});

describe("BB-320: tiền phát sinh theo hạn mức hiện tại", () => {
  it("chọn 17, hạn mức 15, 50.000/ảnh → vượt 2 = 100.000", () => {
    expect(tinhPhatSinhTheoHanMuc({ soAnhDaChon: 17, hanMuc: 15, giaAnhVuot: 50_000 })).toEqual({
      anhVuot: 2,
      tien: 100_000,
    });
  });

  it("tăng hạn mức lên 17 thì hết vượt", () => {
    expect(tinhPhatSinhTheoHanMuc({ soAnhDaChon: 17, hanMuc: 17, giaAnhVuot: 50_000 })).toEqual({ anhVuot: 0, tien: 0 });
  });

  it("ảnh khách đã mua thêm được trừ khỏi số ảnh vượt", () => {
    expect(
      tinhPhatSinhTheoHanMuc({ soAnhDaChon: 17, hanMuc: 15, giaAnhVuot: 50_000, anhDaMuaThem: 1 }),
    ).toEqual({ anhVuot: 1, tien: 50_000 });
  });

  it("chưa biết hạn mức thì không kết luận", () => {
    expect(tinhPhatSinhTheoHanMuc({ soAnhDaChon: 17, hanMuc: null, giaAnhVuot: 50_000 })).toBeNull();
  });
});

describe("BB-320: câu báo sau khi CSKH đổi hạn mức của bộ ĐÃ CHỐT", () => {
  const goc = { soAnhDaChon: 17, giaAnhVuot: 50_000, soTienLucChot: 100_000, dinhDangTien: tien };

  it("15 → 17: nói hết vượt VÀ nhắc số lúc chốt giữ nguyên", () => {
    const cau = cauBaoSauDoiHanMuc({ ...goc, hanMucTruoc: 15, hanMucSau: 17 })!;
    expect(cau).toContain("15 → 17 ảnh");
    expect(cau).toContain("không còn vượt hạn mức");
    expect(cau).toContain("giữ nguyên");
    expect(cau).toContain(tien(100_000));
  });

  it("15 → 16: còn vượt 1 ảnh = 50.000 theo hạn mức mới", () => {
    const cau = cauBaoSauDoiHanMuc({ ...goc, hanMucTruoc: 15, hanMucSau: 16 })!;
    expect(cau).toContain("vượt 1 ảnh");
    expect(cau).toContain(tien(50_000));
  });

  it("hạn mức không đổi thì không báo gì", () => {
    expect(cauBaoSauDoiHanMuc({ ...goc, hanMucTruoc: 15, hanMucSau: 15 })).toBeNull();
  });
});
