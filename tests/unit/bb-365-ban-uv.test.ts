/**
 * BB-365 — ướm ảnh UV (ảnh giấy) lên ảnh chụp thật mặt bàn: to nhỏ ĐÚNG theo
 * cỡ ba mẹ chọn (cm × pxMoiCm), đổi chiều theo ảnh dọc/ngang, luôn nằm trên mặt
 * bàn, không che bình hoa/hộp ảnh, và nằm trong phần ba mẹ nhìn thấy.
 *
 * Toán thuần trên số liệu thật của `BAN_UV` (không đọc mã nguồn, không giả lập
 * hook — AGENTS.md §5a). Phần giao diện canh ở e2e `bb-365-uv-tren-ban.spec.ts`.
 *
 * Kiểm ngược: cố định `rong`/`cao` trong `tinhAnhGiayTrenBan` về một cỡ (bỏ
 * nhân theo cm) → ca "4 cỡ tăng dần đúng tỉ lệ cm" đỏ (kết quả trong bàn giao).
 */
import { describe, it, expect } from "vitest";
import { BAN_UV, tinhAnhGiayTrenBan, vungNhinTrenAnh, type CanhBanUv } from "@/lib/gallery/ban-uv";
import { cacCoTuDanhMuc, tachCoKhung } from "@/lib/gallery/khung-tren-tuong";
import type { HinhChuNhatPx, KhoAnhPhong } from "@/lib/gallery/phong-treo";

// Đúng 4 cỡ UV đang bán trên bb-dev (04/10/2026), cố tình xáo thứ tự như danh mục.
const CO_UV = cacCoTuDanhMuc(["20x30", "10x15", "15x21", "13x18"]);
const KHO: KhoAnhPhong[] = ["doc", "ngang"];
const HUONG = ["doc", "ngang"] as const;
const SAI_SO = 0.5; // px ảnh gốc

function nam(trong: HinhChuNhatPx, h: HinhChuNhatPx): boolean {
  return (
    h.x >= trong.x - SAI_SO &&
    h.y >= trong.y - SAI_SO &&
    h.x + h.rong <= trong.x + trong.rong + SAI_SO &&
    h.y + h.cao <= trong.y + trong.cao + SAI_SO
  );
}

function giao(a: HinhChuNhatPx, b: HinhChuNhatPx): boolean {
  return a.x < b.x + b.rong && b.x < a.x + a.rong && a.y < b.y + b.cao && b.y < a.y + a.cao;
}

/** Phần nhìn thấy ở các khổ màn thật mà màn UV dùng (xem `anhGiay` trong man-treo-tuong.tsx). */
function vungNhinMau(canh: CanhBanUv, kho: KhoAnhPhong): Array<[string, HinhChuNhatPx]> {
  const ds: Array<[string, HinhChuNhatPx | null]> =
    kho === "doc"
      ? [
          // iPhone 390×844, bảng mở: khung ảnh bàn chừa đáy 30vh → 390×591, chữ UV phía trên ~128px.
          ["390x844 bảng mở", vungNhinTrenAnh(390, 591, canh.rongAnhPx, canh.caoAnhPx, { tren: 128 })],
          // Ẩn bảng: tràn màn hình.
          ["390x844 ẩn bảng", vungNhinTrenAnh(390, 844, canh.rongAnhPx, canh.caoAnhPx, { tren: 128 })],
          ["360x740 bảng mở", vungNhinTrenAnh(360, 518, canh.rongAnhPx, canh.caoAnhPx, { tren: 140 })],
        ]
      : [
          ["1440x900 bảng mở", vungNhinTrenAnh(1440, 900, canh.rongAnhPx, canh.caoAnhPx, { tren: 64, phai: 376 })],
          ["1280x800 bảng mở", vungNhinTrenAnh(1280, 800, canh.rongAnhPx, canh.caoAnhPx, { tren: 64, phai: 376 })],
          ["1440x900 ẩn bảng", vungNhinTrenAnh(1440, 900, canh.rongAnhPx, canh.caoAnhPx, { tren: 64 })],
        ];
  return ds.map(([ten, v]) => {
    if (!v) throw new Error(`không tính được vùng nhìn ${ten}`);
    return [ten, v];
  });
}

describe("BB-365 — số liệu cảnh bàn UV", () => {
  it("mặt bàn, vùng đặt nằm trong ảnh; vùng trống không đè bình hoa/hộp ảnh", () => {
    for (const kho of KHO) {
      const canh = BAN_UV[kho];
      const anh = { x: 0, y: 0, rong: canh.rongAnhPx, cao: canh.caoAnhPx };
      expect(nam(anh, canh.matBan), kho).toBe(true);
      expect(canh.pxMoiCm).toBeGreaterThan(10);
      expect(canh.huongSang).toBe("tren");
      expect(canh.gocXoayDo).toBeLessThanOrEqual(-4);
      expect(canh.gocXoayDo).toBeGreaterThanOrEqual(-7);
      for (const cho of canh.choDat) {
        expect(nam(canh.matBan, cho.tam), `${kho} tam`).toBe(true);
        for (const vat of canh.vatKhongChe) {
          expect(giao(cho.bao, vat), `${kho} bao đè vật`).toBe(false);
          expect(giao(cho.tam, vat), `${kho} tam đè vật`).toBe(false);
        }
      }
    }
  });
});

describe("BB-365 — tinhAnhGiayTrenBan", () => {
  it("4 cỡ cho 4 kích thước tăng dần, đúng cm × pxMoiCm (cả ảnh bàn dọc lẫn ngang)", () => {
    expect(CO_UV).toEqual(["10x15", "13x18", "15x21", "20x30"]);
    for (const kho of KHO) {
      const canh = BAN_UV[kho];
      for (const huong of HUONG) {
        let dienTichTruoc = 0;
        for (const co of CO_UV) {
          const kq = tinhAnhGiayTrenBan(canh, co, huong);
          expect(kq.vua, `${kho}/${huong}/${co}`).toBe(true);
          if (!kq.vua) continue;
          const { canhNgan, canhDai } = tachCoKhung(co)!;
          const rongCm = huong === "doc" ? canhNgan : canhDai;
          const caoCm = huong === "doc" ? canhDai : canhNgan;
          expect(kq.hinh.rong).toBeCloseTo(rongCm * canh.pxMoiCm, 6);
          expect(kq.hinh.cao).toBeCloseTo(caoCm * canh.pxMoiCm, 6);
          const dienTich = kq.hinh.rong * kq.hinh.cao;
          expect(dienTich, `${kho}/${huong}/${co} phải lớn hơn cỡ trước`).toBeGreaterThan(dienTichTruoc);
          dienTichTruoc = dienTich;
        }
        // 20×30 gấp đôi 10×15 theo mỗi chiều.
        const nho = tinhAnhGiayTrenBan(canh, "10x15", huong);
        const lon = tinhAnhGiayTrenBan(canh, "20x30", huong);
        if (!nho.vua || !lon.vua) throw new Error("không vừa");
        expect(lon.hinh.rong / nho.hinh.rong).toBeCloseTo(2, 6);
        expect(lon.hinh.cao / nho.hinh.cao).toBeCloseTo(2, 6);
      }
    }
  });

  it("ảnh dọc thì cao > rộng, ảnh ngang thì đổi chiều (rộng = cao của ảnh dọc)", () => {
    for (const kho of KHO) {
      for (const co of CO_UV) {
        const doc = tinhAnhGiayTrenBan(BAN_UV[kho], co, "doc");
        const ngang = tinhAnhGiayTrenBan(BAN_UV[kho], co, "ngang");
        if (!doc.vua || !ngang.vua) throw new Error(`${kho}/${co} không vừa`);
        expect(doc.hinh.cao).toBeGreaterThan(doc.hinh.rong);
        expect(ngang.hinh.rong).toBeGreaterThan(ngang.hinh.cao);
        expect(ngang.hinh.rong).toBeCloseTo(doc.hinh.cao, 6);
        expect(ngang.hinh.cao).toBeCloseTo(doc.hinh.rong, 6);
      }
    }
  });

  it("luôn nằm trong mặt bàn, không che bình hoa/hộp ảnh, tâm trong vùng trống — mọi cỡ, mọi khổ màn", () => {
    for (const kho of KHO) {
      const canh = BAN_UV[kho];
      const cacVung: Array<[string, HinhChuNhatPx | undefined]> = [["cả ảnh", undefined], ...vungNhinMau(canh, kho)];
      for (const [tenVung, vungNhin] of cacVung) {
        for (const huong of HUONG) {
          for (const co of CO_UV) {
            const nhan = `${kho}/${tenVung}/${huong}/${co}`;
            const kq = tinhAnhGiayTrenBan(canh, co, huong, vungNhin);
            expect(kq.vua, nhan).toBe(true);
            if (!kq.vua) continue;
            // Hộp bao SAU khi xoay lớn hơn tấm ảnh (xoay thật), và nằm trên mặt bàn.
            expect(kq.baoSauXoay.rong).toBeGreaterThan(kq.hinh.rong);
            expect(nam(canh.matBan, kq.baoSauXoay), `${nhan} ra khỏi mặt bàn`).toBe(true);
            for (const vat of canh.vatKhongChe) {
              expect(giao(kq.baoSauXoay, vat), `${nhan} che đồ vật`).toBe(false);
            }
            const tam = { x: kq.hinh.x + kq.hinh.rong / 2, y: kq.hinh.y + kq.hinh.cao / 2 };
            const trongVungTrong = canh.choDat.some(
              (c) =>
                tam.x >= c.tam.x - SAI_SO &&
                tam.x <= c.tam.x + c.tam.rong + SAI_SO &&
                tam.y >= c.tam.y - SAI_SO &&
                tam.y <= c.tam.y + c.tam.cao + SAI_SO
            );
            expect(trongVungTrong, `${nhan} tâm ngoài vùng trống`).toBe(true);
            // Ở các khổ màn thật: ba mẹ nhìn thấy trọn tấm ảnh (không nằm dưới bảng/chữ).
            if (vungNhin) expect(nam(vungNhin, kq.baoSauXoay), `${nhan} bị che`).toBe(true);
          }
        }
      }
    }
  });

  it("cỡ quá lớn so với mặt bàn thì không vừa; cỡ sai dạng thì báo lỗi", () => {
    expect(tinhAnhGiayTrenBan(BAN_UV.doc, "60x90", "doc")).toEqual({ vua: false, lyDo: "khong_con_cho" });
    expect(tinhAnhGiayTrenBan(BAN_UV.ngang, "60x90", "ngang")).toEqual({ vua: false, lyDo: "khong_con_cho" });
    expect(tinhAnhGiayTrenBan(BAN_UV.doc, "abc", "doc")).toEqual({ vua: false, lyDo: "co_khong_doc_duoc" });
  });
});

describe("BB-365 — vungNhinTrenAnh (phép object-fit: cover)", () => {
  it("khung cùng tỉ lệ ảnh thì thấy trọn ảnh; trừ dải che đúng theo scale", () => {
    const v = vungNhinTrenAnh(800, 993, 1600, 1986)!;
    expect(v.x).toBeCloseTo(0, 1);
    expect(v.rong).toBeCloseTo(1600, 0);
    const che = vungNhinTrenAnh(800, 993, 1600, 1986, { tren: 50, phai: 100 })!;
    expect(che.y).toBeCloseTo(100, 0); // 50px màn hình ÷ scale 0.5
    expect(che.rong).toBeCloseTo(1400, 0);
  });

  it("khung hẹp hơn ảnh thì cắt đối xứng hai bên", () => {
    // 390×844 trên ảnh 1600×1986: scale = 844/1986, hiện 680px rộng → cắt 145px mỗi bên.
    const v = vungNhinTrenAnh(390, 844, 1600, 1986)!;
    const scale = 844 / 1986;
    expect(v.x).toBeCloseTo((1600 * scale - 390) / 2 / scale, 3);
    expect(v.x + v.rong).toBeCloseTo(1600 - v.x, 3);
    expect(v.cao).toBeCloseTo(1986, 3);
  });
});
