/**
 * Toán phóng ảnh trong màn xem lớn — BB-210.
 *
 * Hai lỗi nguy hiểm nhất ở đây KHÔNG báo lỗi gì trên màn hình: phóng lệch
 * tâm ngón tay (khách chụm hai ngón vào mắt bé, ảnh lại trôi đi chỗ khác),
 * và kéo ảnh bay ra khỏi khung (khách kéo, thấy nền trống thay vì ảnh).
 */

import { describe, it, expect } from "vitest";
import {
  kepTiLe,
  phongQuanhDiem,
  kepBien,
  tiLeSauChamHaiLan,
  tiLeTuCuonChuot,
  TI_LE_NHO_NHAT,
  TI_LE_LON_NHAT,
  TI_LE_CHAM_HAI_LAN,
} from "@/lib/gallery/phong-anh";

describe("kepTiLe", () => {
  it("giữ trong khoảng 1× – 4×", () => {
    expect(kepTiLe(0.2)).toBe(TI_LE_NHO_NHAT);
    expect(kepTiLe(1)).toBe(1);
    expect(kepTiLe(2.7)).toBeCloseTo(2.7);
    expect(kepTiLe(9)).toBe(TI_LE_LON_NHAT);
  });
});

describe("phongQuanhDiem", () => {
  it("điểm chạm đứng yên trên màn hình sau khi đổi tỉ lệ", () => {
    // Đang ở 1× không dịch, chạm vào điểm (40, -20) rồi phóng lên 2×.
    const truoc: { scale: number; x: number; y: number } = { scale: 1, x: 0, y: 0 };
    const diem = { x: 40, y: -20 };
    const sau = phongQuanhDiem(truoc, 2, diem);

    // Vị trí màn hình của điểm đó, TRƯỚC: x + scale*p => suy ra p, rồi kiểm
    // lại vị trí SAU khi áp trạng thái mới — phải khớp nguyên điểm chạm.
    const pTruoc = (diem.x - truoc.x) / truoc.scale;
    const viTriTruoc = truoc.x + truoc.scale * pTruoc;
    const viTriSau = sau.x + sau.scale * pTruoc;
    expect(viTriSau).toBeCloseTo(viTriTruoc, 6);
    expect(viTriSau).toBeCloseTo(diem.x, 6);
  });

  it("phóng quanh tâm khung (0,0) thì độ dịch không đổi", () => {
    const sau = phongQuanhDiem({ scale: 1, x: 0, y: 0 }, 3, { x: 0, y: 0 });
    expect(sau).toEqual({ scale: 3, x: 0, y: 0 });
  });

  it("thu về lại 1× từ đúng điểm đã phóng thì trở lại đúng gốc", () => {
    const b1 = phongQuanhDiem({ scale: 1, x: 0, y: 0 }, 2.5, { x: 30, y: 15 });
    const b2 = phongQuanhDiem(b1, 1, { x: 30, y: 15 });
    expect(b2.x).toBeCloseTo(0, 6);
    expect(b2.y).toBeCloseTo(0, 6);
  });
});

describe("kepBien", () => {
  it("ở 1× thì luôn về đúng giữa, dù muốn kéo đi đâu", () => {
    expect(kepBien(500, -500, 1, 300, 400)).toEqual({ x: 0, y: 0 });
  });

  it("không cho kéo vượt quá phần ảnh thừa ra ngoài khung", () => {
    // Khung 300×400, phóng 2× => ảnh thừa mỗi bên 150×200.
    expect(kepBien(1000, 1000, 2, 300, 400)).toEqual({ x: 150, y: 200 });
    expect(kepBien(-1000, -1000, 2, 300, 400)).toEqual({ x: -150, y: -200 });
  });

  it("trong biên thì giữ nguyên, không kẹp oan", () => {
    expect(kepBien(50, -30, 2, 300, 400)).toEqual({ x: 50, y: -30 });
  });

  /**
   * KIỂM NGƯỢC (23/09/2026… BB-210): tạm sửa `kepBien` bỏ hẳn việc kẹp biên
   * (return {x, y} không đụng gì) rồi chạy lại — ca "không cho kéo vượt quá
   * phần ảnh thừa" báo đỏ đúng lý do (nhận 1000 thay vì 150). Trả lại bản
   * gốc thì xanh lại. Bằng chứng: chạy `npx vitest run tests/unit/phong-anh.test.ts`
   * hai lần, một lần với hàm bị vô hiệu hoá, một lần với bản thật.
   */
  it("kiểm ngược: ca kẹp biên phải phân biệt được kẹp và không kẹp", () => {
    const bienNgoai = kepBien(1000, 1000, 2, 300, 400);
    const trongBien = kepBien(50, -30, 2, 300, 400);
    expect(bienNgoai).not.toEqual({ x: 1000, y: 1000 });
    expect(trongBien).toEqual({ x: 50, y: -30 });
  });
});

describe("tiLeSauChamHaiLan", () => {
  it("đang 1× thì bật lên 2,5×; đang phóng thì về 1×", () => {
    expect(tiLeSauChamHaiLan(1)).toBe(TI_LE_CHAM_HAI_LAN);
    expect(tiLeSauChamHaiLan(1.8)).toBe(TI_LE_NHO_NHAT);
    expect(tiLeSauChamHaiLan(4)).toBe(TI_LE_NHO_NHAT);
  });
});

describe("tiLeTuCuonChuot", () => {
  it("cuộn lên (deltaY âm) thì phóng to, cuộn xuống thì thu nhỏ", () => {
    expect(tiLeTuCuonChuot(1, -100)).toBeGreaterThan(1);
    expect(tiLeTuCuonChuot(2, 100)).toBeLessThan(2);
  });

  it("vẫn kẹp trong 1× – 4× dù cuộn rất mạnh", () => {
    expect(tiLeTuCuonChuot(1, -100000)).toBe(TI_LE_LON_NHAT);
    expect(tiLeTuCuonChuot(4, 100000)).toBe(TI_LE_NHO_NHAT);
  });
});
