/**
 * BB-215 — mẫu chữ điền sẵn cho bìa bộ ảnh.
 *
 * Hai luật không được phá (xem src/lib/gallery/mau-chu-bia.ts): không lọt
 * "{...}" ra màn hình khi dữ liệu thiếu, và không bao giờ bắt đầu bằng "HD_"
 * (mã hợp đồng — 234/488 bộ ảnh đo 23/09/2026 chưa gắn tên bé và mang tiêu đề
 * kiểu "HD_20260828#4924").
 */

import { describe, it, expect } from "vitest";
import {
  MAU_CHU_BIA,
  dienMau,
  chonMauMacDinh,
  mauDungDuoc,
  type DuLieuBia,
} from "@/lib/gallery/mau-chu-bia";

const CO_TEN_BE: DuLieuBia = { tenBe: "Bống", ngayChup: "2026-08-28", chiNhanh: "Pasteur" };
const KHONG_TEN_BE: DuLieuBia = { tenBe: null, ngayChup: null, chiNhanh: null };
/** Tình huống xấu nhất: `tenBe` bị gán nhầm đúng mã hợp đồng. */
const TEN_BE_LA_MA_HOP_DONG: DuLieuBia = {
  tenBe: "HD_20260828#4924",
  ngayChup: null,
  chiNhanh: null,
};

describe("BB-215: mẫu chữ trên bìa", () => {
  it("có từ 6 đến 8 mẫu", () => {
    expect(MAU_CHU_BIA.length).toBeGreaterThanOrEqual(6);
    expect(MAU_CHU_BIA.length).toBeLessThanOrEqual(8);
  });

  it("mỗi mẫu có id duy nhất, nhãn không rỗng", () => {
    const ids = new Set(MAU_CHU_BIA.map((m) => m.id));
    expect(ids.size).toBe(MAU_CHU_BIA.length);
    for (const m of MAU_CHU_BIA) {
      expect(m.nhan.trim().length).toBeGreaterThan(0);
    }
  });

  it("ít nhất một mẫu dùng được khi KHÔNG có tên bé", () => {
    const dungDuoc = mauDungDuoc(KHONG_TEN_BE);
    expect(dungDuoc.length).toBeGreaterThan(0);
    for (const m of dungDuoc) {
      const dien = dienMau(m, KHONG_TEN_BE);
      expect(dien).not.toBeNull();
    }
  });

  it("không mẫu nào để lọt {...} khi thiếu dữ liệu (bộ ảnh trống trơn)", () => {
    for (const m of MAU_CHU_BIA) {
      const dien = dienMau(m, KHONG_TEN_BE);
      // Mẫu cần {tenBe} thì dienMau phải trả null khi không có — không được
      // trả một chuỗi còn nguyên dấu ngoặc.
      if (dien) {
        expect(dien.tieuDe).not.toMatch(/\{.*\}/);
        expect(dien.loi).not.toMatch(/\{.*\}/);
      }
    }
  });

  it("mọi mẫu điền đủ dữ liệu thì không còn dấu ngoặc nào", () => {
    for (const m of MAU_CHU_BIA) {
      const dien = dienMau(m, CO_TEN_BE, 128);
      expect(dien).not.toBeNull();
      expect(dien!.tieuDe).not.toMatch(/\{.*\}/);
      expect(dien!.loi).not.toMatch(/\{.*\}/);
    }
  });

  it("không bao giờ trả về chuỗi bắt đầu bằng HD_, kể cả khi tenBe bị gán nhầm mã hợp đồng", () => {
    for (const m of MAU_CHU_BIA) {
      const dien = dienMau(m, TEN_BE_LA_MA_HOP_DONG, 10);
      if (dien) {
        expect(dien.tieuDe.startsWith("HD_")).toBe(false);
        expect(dien.loi.startsWith("HD_")).toBe(false);
      }
    }
  });

  it("chonMauMacDinh trả một mẫu điền được với dữ liệu tương ứng", () => {
    const macDinhCoTen = chonMauMacDinh(CO_TEN_BE);
    expect(dienMau(macDinhCoTen, CO_TEN_BE)).not.toBeNull();

    const macDinhKhongTen = chonMauMacDinh(KHONG_TEN_BE);
    expect(macDinhKhongTen.canKhongTenBe).toBe(true);
    expect(dienMau(macDinhKhongTen, KHONG_TEN_BE)).not.toBeNull();
  });
});
