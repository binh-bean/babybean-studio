/**
 * BB-303 — khối "Việc hôm nay" của Bảng điều khiển (bản vẽ BB-301).
 *
 * Canh đúng luật xếp nhóm (nhomViecHomNay/xepViecHomNay ở
 * src/lib/utils/bang-dieu-khien.ts): quá hạn / hôm nay / ngày mai, việc "đã
 * chốt" (submitted) luôn vào "Hôm nay", việc hạn xa hơn ngày mai bị loại.
 *
 * Nếu hoàn nguyên bản vá (hàm này không tồn tại / luôn trả về một nhóm cố
 * định), các ca dưới đây phải ĐỎ.
 */

import { describe, it, expect } from "vitest";
import { nhomViecHomNay, xepViecHomNay } from "@/lib/utils/bang-dieu-khien";

// Mốc cố định để phép thử không phụ thuộc đồng hồ máy chạy test:
// 28/09/2026 10:00 giờ máy (UTC nội bộ của môi trường test — không quan trọng
// múi giờ thật, chỉ cần nhất quán trong nội bộ phép thử này).
const NOW = new Date(2026, 8, 28, 10, 0, 0);

function ngayGioTrongNgay(offsetNgay: number, gio: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offsetNgay);
  d.setHours(gio, 0, 0, 0);
  return d.toISOString();
}

describe("BB-303: nhomViecHomNay", () => {
  it("due_at trong quá khứ -> quá hạn", () => {
    expect(nhomViecHomNay({ dueAt: ngayGioTrongNgay(-1, 9), status: "in_review" }, NOW)).toBe("qua_han");
  });

  it("due_at còn lại trong hôm nay -> hôm nay", () => {
    expect(nhomViecHomNay({ dueAt: ngayGioTrongNgay(0, 18), status: "ready" }, NOW)).toBe("hom_nay");
  });

  it("due_at rơi vào ngày mai -> ngày mai", () => {
    expect(nhomViecHomNay({ dueAt: ngayGioTrongNgay(1, 9), status: "in_review" }, NOW)).toBe("ngay_mai");
  });

  it("due_at xa hơn ngày mai (vd 3 ngày sau) -> không thuộc khối này (null)", () => {
    expect(nhomViecHomNay({ dueAt: ngayGioTrongNgay(3, 9), status: "in_review" }, NOW)).toBeNull();
  });

  it("không có due_at nhưng đã chốt (submitted) -> luôn hôm nay, bất kể giờ", () => {
    expect(nhomViecHomNay({ dueAt: null, status: "submitted" }, NOW)).toBe("hom_nay");
  });

  it("không có due_at và chưa chốt -> null (không xếp được)", () => {
    expect(nhomViecHomNay({ dueAt: null, status: "in_review" }, NOW)).toBeNull();
  });
});

describe("BB-303: xepViecHomNay", () => {
  it("xếp đúng ba nhóm và loại việc hạn xa", () => {
    const items = [
      { id: "qua-han-1", dueAt: ngayGioTrongNgay(-2, 9), status: "in_review" },
      { id: "qua-han-2", dueAt: ngayGioTrongNgay(0, 5), status: "in_review" }, // đã qua 10h sáng nay
      { id: "hom-nay-1", dueAt: ngayGioTrongNgay(0, 20), status: "ready" },
      { id: "hom-nay-chot", dueAt: null, status: "submitted" },
      { id: "ngay-mai-1", dueAt: ngayGioTrongNgay(1, 8), status: "ready" },
      { id: "xa-qua", dueAt: ngayGioTrongNgay(5, 8), status: "ready" },
    ];
    const ket = xepViecHomNay(items, NOW);
    expect(ket.quaHan.map((i) => i.id)).toEqual(["qua-han-1", "qua-han-2"]);
    expect(ket.homNay.map((i) => i.id).sort()).toEqual(["hom-nay-1", "hom-nay-chot"].sort());
    expect(ket.ngayMai.map((i) => i.id)).toEqual(["ngay-mai-1"]);
    // "xa-qua" không rơi vào nhóm nào cả.
    const tongSoDaXep = ket.quaHan.length + ket.homNay.length + ket.ngayMai.length;
    expect(tongSoDaXep).toBe(5);
  });

  it("trong nhóm quá hạn, việc trễ LÂU HƠN (hạn xa xưa hơn) đứng trước", () => {
    const items = [
      { id: "tre-it", dueAt: ngayGioTrongNgay(0, 5), status: "in_review" }, // trễ vài giờ
      { id: "tre-nhieu", dueAt: ngayGioTrongNgay(-3, 9), status: "in_review" }, // trễ 3 ngày
    ];
    const ket = xepViecHomNay(items, NOW);
    expect(ket.quaHan.map((i) => i.id)).toEqual(["tre-nhieu", "tre-it"]);
  });
});
