import { describe, it, expect } from "vitest";
import { tinhTongKhach } from "@/lib/khach-hang/tong-gia-tri";

describe("BB-354 — Tổng giá trị đã mua của khách", () => {
  it("khách đã trả tiền trong app, không mua thêm: KHÔNG được hiện 0", () => {
    const t = tinhTongKhach([], [{ soTien: 500_000, laGiamGia: false }]);
    expect(t.tongGiaTri).toBe(500_000);
    expect(t.tongDaThu).toBe(500_000);
  });

  it("có mua thêm và có đã thu: cộng cả hai", () => {
    const t = tinhTongKhach(
      [{ thanhTien: 40_000 }, { thanhTien: 120_000 }],
      [{ soTien: 300_000, laGiamGia: false }, { soTien: 100_000, laGiamGia: false }],
    );
    expect(t.tongMuaThem).toBe(160_000);
    expect(t.tongDaThu).toBe(400_000);
    expect(t.tongGiaTri).toBe(560_000);
  });

  it("giảm giá không phải tiền thu, không làm tăng giá trị đã mua", () => {
    const t = tinhTongKhach([], [{ soTien: 200_000, laGiamGia: false }, { soTien: 50_000, laGiamGia: true }]);
    expect(t.tongGiamGia).toBe(50_000);
    expect(t.tongDaThu).toBe(200_000);
    expect(t.tongGiaTri).toBe(200_000);
  });

  it("dòng âm (hoàn tiền / ghi nhầm) tự trừ", () => {
    const t = tinhTongKhach([], [{ soTien: 300_000, laGiamGia: false }, { soTien: -100_000, laGiamGia: false }]);
    expect(t.tongGiaTri).toBe(200_000);
  });

  it("khách chưa có gì: 0", () => {
    expect(tinhTongKhach([], []).tongGiaTri).toBe(0);
  });
});
