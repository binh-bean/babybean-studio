/**
 * Lưới so le của màn khách — xếp đủ, không chồng, giữ đúng khung.
 *
 * Chủ studio duyệt 23/09/2026 hướng "cuốn album kỷ niệm": bỏ lưới vuông cắt
 * mất đầu/chân bé. Vị trí từng tấm nay do `xepSoLe` tính, và lưới chỉ dựng
 * những tấm `oTrongTamNhin` trả về. Hai hàm này sai thì hỏng theo hai kiểu
 * KHÔNG báo lỗi gì cả: ảnh đè lên nhau, hoặc một tấm biến mất khỏi lưới —
 * đúng loại lỗi BB-128 (khách trả tiền mà chỉ thấy một phần ảnh).
 */

import { describe, it, expect } from "vitest";
import {
  xepSoLe,
  oTrongTamNhin,
  tiLeCuaAnh,
  soCotSoLe,
  TI_LE_MAC_DINH,
} from "@/lib/gallery/xep-so-le";

/** Bộ ảnh giống thật: phần lớn dọc 2:3, xen vài tấm ngang 3:2. */
function boAnh(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i % 7 === 3 ? 2 / 3 : 1.5));
}

const chong = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

describe("Lưới so le", () => {
  it("1. Mỗi tấm có đúng một chỗ, và không tấm nào đè lên tấm nào", () => {
    const { o } = xepSoLe(boAnh(60), 363, 2, 6);
    expect(o).toHaveLength(60);
    for (let i = 0; i < o.length; i++) {
      for (let j = i + 1; j < o.length; j++) {
        expect(chong(o[i]!, o[j]!), `tấm ${i} đè lên tấm ${j}`).toBe(false);
      }
    }
  });

  it("2. Giữ ĐÚNG khung của ảnh — không cắt vuông nữa", () => {
    const { o } = xepSoLe([1.5, 2 / 3], 400, 2, 0);
    // Ảnh dọc 2:3 cao gấp rưỡi bề ngang; ảnh ngang 3:2 thấp hơn bề ngang.
    expect(o[0]!.h / o[0]!.w).toBeCloseTo(1.5, 1);
    expect(o[1]!.h / o[1]!.w).toBeCloseTo(2 / 3, 1);
  });

  it("3. Không tràn ra ngoài khung lưới theo bề ngang", () => {
    for (const cot of [2, 3, 4, 5]) {
      const { o } = xepSoLe(boAnh(40), 1180, cot, 10);
      for (const a of o) expect(a.x + a.w).toBeLessThanOrEqual(1180 + 0.01);
    }
  });

  it("4. Chiều cao lưới đủ chứa tấm thấp nhất — không cắt đáy lưới", () => {
    const { o, cao } = xepSoLe(boAnh(33), 363, 2, 6);
    const dayThapNhat = Math.max(...o.map((a) => a.y + a.h));
    expect(cao).toBe(dayThapNhat);
  });

  it("5. Cửa sổ dựng: mọi tấm đều được dựng khi cuộn từ đầu tới cuối", () => {
    // Đây là chốt cho lỗi kiểu BB-128: cuộn hết lưới theo từng nửa màn hình,
    // gom mọi tấm từng được dựng — phải đủ cả bộ, không sót tấm nào.
    const caoMan = 812;
    const { o, cao } = xepSoLe(boAnh(300), 363, 2, 6);
    const daDung = new Set<number>();
    for (let bac = -2; bac * (caoMan / 2) <= cao + caoMan; bac++) {
      const tu = bac * (caoMan / 2) - caoMan;
      const den = bac * (caoMan / 2) + caoMan * 2;
      for (const i of oTrongTamNhin(o, tu, den)) daDung.add(i);
    }
    expect(daDung.size).toBe(300);
  });

  it("5b. Tấm VẮT NGANG mép trên cửa sổ vẫn phải được dựng", () => {
    /*
      Ca 5 không bắt được lỗi này. Kiểm ngược 23/09/2026: đổi điều kiện thành
      `a.y >= tu` (chỉ lấy tấm BẮT ĐẦU trong cửa sổ) thì ca 5 vẫn xanh — vì
      cuộn qua nhiều bậc, sớm muộn tấm nào cũng rơi vào một cửa sổ nào đó.
      Nhưng trên màn hình thật, tấm đang vắt ngang mép trên sẽ biến mất: một
      lỗ trống ngay đầu màn mỗi lần cuộn.

      Nên đối chiếu với định nghĩa: mọi tấm CHẠM vào đoạn [tu, den] đều phải
      có mặt, và chỉ những tấm đó.
    */
    const { o } = xepSoLe(boAnh(200), 363, 2, 6);
    for (const [tu, den] of [[1000, 2600], [4321, 5000], [0, 812]] as const) {
      const ky = new Set(oTrongTamNhin(o, tu, den));
      o.forEach((a, i) => {
        const cham = a.y + a.h >= tu && a.y <= den;
        expect(ky.has(i), `tấm ${i} (y ${Math.round(a.y)}–${Math.round(a.y + a.h)}) ở cửa sổ ${tu}–${den}`).toBe(cham);
      });
    }
  });

  it("6. …nhưng mỗi lúc chỉ dựng một phần nhỏ — luật hiệu năng của BB-131", () => {
    const caoMan = 812;
    const { o } = xepSoLe(boAnh(1235), 363, 2, 6);
    const giua = oTrongTamNhin(o, 20_000 - caoMan, 20_000 + caoMan * 2);
    // Ba màn hình, ô cao ~270px, hai cột: cỡ 20 tấm. Vượt 40 là có gì đó sai.
    expect(giua.length).toBeGreaterThan(0);
    expect(giua.length).toBeLessThan(40);
  });

  it("7. Ảnh thiếu kích thước lấy khung 2:3, tỉ lệ quá đà bị chặn", () => {
    expect(tiLeCuaAnh(null, null)).toBe(TI_LE_MAC_DINH);
    expect(tiLeCuaAnh(0, 100)).toBe(TI_LE_MAC_DINH);
    expect(tiLeCuaAnh(4480, 6720)).toBeCloseTo(1.5);
    // Toàn cảnh 1:5 không thành một sợi chỉ, dọc 1:5 không dài hết màn hình.
    expect(tiLeCuaAnh(5000, 1000)).toBeGreaterThanOrEqual(0.4);
    expect(tiLeCuaAnh(1000, 5000)).toBeLessThanOrEqual(2.2);
  });

  it("8. Điện thoại 2 cột, máy tính rộng 5 cột", () => {
    expect(soCotSoLe(375)).toBe(2);
    expect(soCotSoLe(768)).toBe(3);
    expect(soCotSoLe(1100)).toBe(4);
    expect(soCotSoLe(1440)).toBe(5);
  });

  it("9. Chưa đo được bề ngang thì không bịa vị trí", () => {
    // Lưới rơi về nhánh dự phòng (dựng đủ cả bộ theo dòng chảy CSS) — hàm
    // này không được trả về toạ độ giả để lưới tưởng mình đã xếp xong.
    expect(xepSoLe(boAnh(10), 0, 2, 6)).toEqual({ o: [], cao: 0 });
  });

  // ---------------------------------------------------------------------
  // BB-210: chú thích tên tệp ngay dưới mỗi ô ảnh.
  // ---------------------------------------------------------------------

  it("10. Không truyền caoChuThich thì y hệt bản cũ (mặc định 0)", () => {
    const cu = xepSoLe(boAnh(40), 400, 2, 6);
    const moi = xepSoLe(boAnh(40), 400, 2, 6, 0);
    expect(moi).toEqual(cu);
  });

  it("11. Có chú thích thì ảnh vẫn giữ đúng tỉ lệ, chỉ khoảng cách dồn cột giãn thêm", () => {
    const caoChuThich = 16;
    const khongChu = xepSoLe([1.5, 1.5], 400, 1, 6, 0);
    const coChu = xepSoLe([1.5, 1.5], 400, 1, 6, caoChuThich);

    // Kích thước ô ảnh (w, h) không đổi — chú thích không bóp méo ảnh.
    expect(coChu.o[0]!.w).toBe(khongChu.o[0]!.w);
    expect(coChu.o[0]!.h).toBe(khongChu.o[0]!.h);

    // Tấm thứ hai (cùng cột) bị đẩy xuống thêm đúng caoChuThich, vì chỗ cho
    // dòng chú thích của tấm thứ nhất chen vào giữa.
    expect(coChu.o[1]!.y).toBe(khongChu.o[1]!.y + caoChuThich);
  });

  it("12. Chú thích không chồng lên ô dưới nó, và chiều cao lưới đủ chỗ cho chú thích của tấm cuối", () => {
    const caoChuThich = 16;
    const { o, cao } = xepSoLe(boAnh(9), 400, 3, 6, caoChuThich);

    // Trong từng cột, đáy chú thích của một tấm (y + h + caoChuThich) không
    // được vượt quá đỉnh tấm kế tiếp CÙNG CỘT.
    const theoCot = new Map<number, typeof o>();
    for (const a of o) {
      const ds = theoCot.get(a.x) ?? [];
      ds.push(a);
      theoCot.set(a.x, ds);
    }
    for (const ds of theoCot.values()) {
      const xepTheoY = [...ds].sort((a, b) => a.y - b.y);
      for (let i = 0; i + 1 < xepTheoY.length; i++) {
        const day = xepTheoY[i]!.y + xepTheoY[i]!.h + caoChuThich;
        expect(day).toBeLessThanOrEqual(xepTheoY[i + 1]!.y + 0.01);
      }
    }

    // Chiều cao lưới phải chứa cả dòng chú thích của tấm thấp nhất mỗi cột
    // (đáy tấm CUỐI trong cột không cần chừa khe dưới nó, nên không cộng khe).
    const dayThapNhat = Math.max(...o.map((a) => a.y + a.h + caoChuThich));
    expect(cao).toBe(dayThapNhat);
  });
});
