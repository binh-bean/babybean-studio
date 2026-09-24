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
import { tinhKhungTrenTuong, cacCoTuDanhMuc, tachCoKhung, type CoKhungCm } from "@/lib/gallery/khung-tren-tuong";

/** Đủ 13 cỡ đang có trong bảng products (đọc 24/09/2026), cố ý xáo thứ tự. */
const CO_DANH_MUC = ["60x90", "15x21", "100x150", "20x30", "30x45", "35x50", "40x60", "50x75",
  "70x110", "80x120", "120x180", "20x20", "25x25"];
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
        for (const co of CO_DANH_MUC) {
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

  it("cỡ nhỏ trong gói (30x45, 20x30) vẫn treo được — không khoá cứng ba cỡ", () => {
    const phong = PHONG_TREO["phong-khach"].doc;
    expect(tinhKhungTrenTuong(phong, "30x45", "doc", false).vua).toBe(true);
    expect(tinhKhungTrenTuong(phong, "20x30", "ngang", true).vua).toBe(true);
  });

  it("cỡ sai dạng thì không vẽ, không ném lỗi", () => {
    const kq = tinhKhungTrenTuong(PHONG_TREO["phong-khach"].doc, "Album", "doc", false);
    expect(kq).toEqual({ vua: false, lyDo: "co_khong_doc_duoc" });
  });
});

describe("cacCoTuDanhMuc", () => {
  it("bỏ trùng, bỏ ô trống/sai dạng, xếp nhỏ trước lớn sau", () => {
    expect(cacCoTuDanhMuc(["60x90", null, "30x45", "60x90", "abc", "40x60", ""])).toEqual([
      "30x45",
      "40x60",
      "60x90",
    ]);
  });

  it("viết ngược cạnh vẫn hiểu là cùng kích thước", () => {
    expect(tachCoKhung("60x40")).toEqual({ canhNgan: 40, canhDai: 60 });
    expect(tachCoKhung("40 × 60")).toEqual({ canhNgan: 40, canhDai: 60 });
  });
});
