/**
 * Phép thử canh cho `src/lib/gallery/khung-tren-tuong.ts` (BB-217).
 *
 * Ba điều phải luôn đúng: tỷ lệ cm→px đúng theo pxMoiCm đo tay, khung không
 * bao giờ vẽ tràn ra ngoài mảng tường trống, và ảnh `hanh-lang-doc` (mảng
 * tường chỉ ~61cm — xem `_loi` trong tuong-do-lai.json) từ chối đúng cỡ quá
 * to.
 *
 * KIỂM NGƯỢC: đã tự đổi `khoangCachToiDaPx` thành `khoangCachMucTieuPx` cứng
 * (bỏ luật 3 — co khoảng cách lại khi tường chật) trong `khung-tren-tuong.ts`
 * để xem "luôn trong mảng tường" có đỏ đúng lý do không — nó đỏ ở đúng test
 * "luôn nằm trong mảng tường" cho hanh-lang-doc 40x60 (khung tràn lên trên
 * đỉnh tường, `y < tuong.y`). Trả lại bản đúng, phép thử xanh lại.
 */
import { describe, it, expect } from "vitest";
import { tinhKhungTrenTuong, DANH_SACH_CO_KHUNG, type CoKhungCm } from "@/lib/gallery/khung-tren-tuong";
import { PHONG_TREO, THU_TU_PHONG, type KhoAnhPhong } from "@/lib/gallery/phong-treo";

describe("tinhKhungTrenTuong", () => {
  it("tỷ lệ đúng: 40x60 dọc, không khung, ở phong-khach-doc cao đúng 60×pxMoiCm ±1px", () => {
    const phong = PHONG_TREO["phong-khach"].doc;
    const kq = tinhKhungTrenTuong(phong, "40x60", "doc", false);
    expect(kq.vua).toBe(true);
    if (!kq.vua) return;
    expect(kq.hinh.cao).toBeCloseTo(60 * phong.pxMoiCm, 0);
    expect(Math.abs(kq.hinh.cao - 60 * phong.pxMoiCm)).toBeLessThanOrEqual(1);
    expect(kq.hinh.rong).toBeCloseTo(40 * phong.pxMoiCm, 0);
  });

  it("luôn nằm trong mảng tường — quét mọi phòng, mọi khổ, mọi cỡ, có/không khung", () => {
    for (const ma of THU_TU_PHONG) {
      const phongTreo = PHONG_TREO[ma];
      for (const kho of ["doc", "ngang"] as KhoAnhPhong[]) {
        const phong = phongTreo[kho];
        for (const co of DANH_SACH_CO_KHUNG) {
          for (const huong of ["doc", "ngang"] as const) {
            for (const coKhung of [false, true]) {
              const kq = tinhKhungTrenTuong(phong, co, huong, coKhung);
              if (!kq.vua) continue; // cỡ "không vừa" là điều đúng phải xảy ra — kiểm ở test dưới.
              const { x, y, rong, cao } = kq.hinh;
              expect(x).toBeGreaterThanOrEqual(phong.tuong.x - 0.01);
              expect(y).toBeGreaterThanOrEqual(phong.tuong.y - 0.01);
              expect(x + rong).toBeLessThanOrEqual(phong.tuong.x + phong.tuong.rong + 0.01);
              expect(y + cao).toBeLessThanOrEqual(phong.tuong.y + phong.tuong.cao + 0.01);
            }
          }
        }
      }
    }
  });

  it("hanh-lang-doc từ chối 60x90 (mảng tường trên bàn console chỉ ~61cm)", () => {
    const phong = PHONG_TREO["hanh-lang"].doc;
    const kq: ReturnType<typeof tinhKhungTrenTuong> = tinhKhungTrenTuong(phong, "60x90", "doc", false);
    expect(kq.vua).toBe(false);
  });

  it("hanh-lang-doc vẫn nhận 40x60 (đúng ghi chú coLonNhatThamKhao trong dữ liệu)", () => {
    const phong = PHONG_TREO["hanh-lang"].doc;
    const kq = tinhKhungTrenTuong(phong, "40x60" as CoKhungCm, "doc", false);
    expect(kq.vua).toBe(true);
  });
});
