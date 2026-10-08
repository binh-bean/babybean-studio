/**
 * BB-398 — "Xem album trên bàn": đặt CUỐN ALBUM lên ảnh mặt bàn thật, đúng khổ cm.
 *
 * OWNER: DEV-FE. Anh 08/10/2026: "Album cũng muốn giao diện hình dung như UV" —
 * UV đang đặt lên ảnh mặt bàn thật (`ban-uv.ts`, BB-365). Không viết bộ toán thứ
 * hai: dùng lại NGUYÊN `BAN_UV` (ảnh + pxMoiCm đo tay) và `tinhAnhGiayTrenBan`
 * (chọn chỗ đặt, xoay, kẹp trong mặt bàn). Phần riêng của album chỉ là:
 *
 *   - Hướng cuốn: khổ VUÔNG (20×20, 25×25, 30×30) → vuông; khổ CHỮ NHẬT (15×21,
 *     20×30) → cuốn ĐỨNG (BB-391: album chữ nhật của studio luôn đứng) — cùng luật
 *     `huongBiaTuKhoAlbum` của album-khai-niem.ts.
 *   - Độ dày gáy: ruột album (theo số tờ) dày cỡ 1,5–3 cm; vẽ ước lượng theo khổ
 *     (khổ to nhiều ảnh hơn → dày hơn), quy ra px bằng CÙNG pxMoiCm của ảnh bàn.
 *
 * Toàn bộ ở đây là hàm thuần (phép thử `tests/unit/bb-398-album-tren-ban.test.ts`).
 */

import { BAN_UV, tinhAnhGiayTrenBan, type CanhBanUv } from "./ban-uv";
import type { HinhChuNhatPx } from "./phong-treo";
import { chuanKhoAlbum, huongBiaTuKhoAlbum, soAnhCuaKhoAlbum } from "@/lib/products/album-khai-niem";

export interface AlbumTrenBan {
  vua: true;
  /** Mặt bìa CHƯA xoay (px ảnh gốc). */
  hinh: HinhChuNhatPx;
  gocXoayDo: number;
  /** Độ dày cuốn (px ảnh gốc) — vẽ thành mép giấy + bóng dưới bìa. */
  dayPx: number;
  huong: "vuong" | "doc";
  /** Cạnh bìa (cm) theo chiều ngang/dọc như ba mẹ thấy. */
  rongCm: number;
  caoCm: number;
}

export interface AlbumKhongVua {
  vua: false;
  lyDo: "kho_khong_doc_duoc" | "khong_con_cho";
}

/** Cảnh bàn dùng cho album: ảnh bàn DỌC (rộng chỗ nhất, đo 20 px/cm) — mọi khổ cùng một cảnh để so được. */
export const CANH_BAN_ALBUM: CanhBanUv = BAN_UV.doc;

/**
 * Độ dày ước lượng (cm) của một cuốn theo số ảnh tối đa của khổ: ~1 cm bìa cứng
 * + 0,05 cm mỗi ảnh ruột. Khổ không có trong bảng → 2 cm.
 */
export function doDayAlbumCm(size: string | null | undefined): number {
  const soAnh = soAnhCuaKhoAlbum(size);
  if (!soAnh) return 2;
  return Math.round((1 + soAnh.max * 0.05) * 10) / 10;
}

/** Đặt cuốn album khổ `size` lên cảnh bàn (mặc định `CANH_BAN_ALBUM`). */
export function datAlbumTrenBan(
  size: string | null | undefined,
  canh: CanhBanUv = CANH_BAN_ALBUM,
  /** Phần ảnh bày ra — cuốn phải nằm gọn trong đây (mặc định `VUNG_XEM_ALBUM`). */
  vung: HinhChuNhatPx | null = VUNG_XEM_ALBUM,
): AlbumTrenBan | AlbumKhongVua {
  const kho = chuanKhoAlbum(size);
  const huongBia = huongBiaTuKhoAlbum(kho);
  if (!kho || !huongBia) return { vua: false, lyDo: "kho_khong_doc_duoc" };
  // Vuông thì "doc"/"ngang" như nhau; chữ nhật luôn là cuốn ĐỨNG → "doc".
  const kq = tinhAnhGiayTrenBan(canh, kho, "doc", vung);
  if (!kq.vua) return { vua: false, lyDo: kq.lyDo === "co_khong_doc_duoc" ? "kho_khong_doc_duoc" : "khong_con_cho" };
  const [a, b] = kho.split("x").map(Number) as [number, number];
  return {
    vua: true,
    hinh: kq.hinh,
    gocXoayDo: kq.gocXoayDo,
    dayPx: doDayAlbumCm(kho) * canh.pxMoiCm,
    huong: huongBia === "vuong" ? "vuong" : "doc",
    rongCm: Math.min(a, b),
    caoCm: Math.max(a, b),
  };
}

/**
 * Phần ảnh bàn bày ra cho ba mẹ (px ảnh gốc): góc dưới-trái của `ban-uv-doc.jpg`, ôm trọn
 * chỗ đặt thứ nhất (`choDat[0].bao` x 10→1000, y 1180→1840) — cắt bớt rèm/bình hoa phía
 * trên để cuốn album hiện TO, đọc được khổ. Mọi khổ album đang bán đều nằm gọn trong đây
 * (phép thử canh).
 */
export const VUNG_XEM_ALBUM: HinhChuNhatPx = { x: 0, y: 1000, rong: 1100, cao: 986 };

/**
 * Vị trí theo % của khung xem — khung giữ ĐÚNG tỉ lệ `vung` (không `object-fit: cover`,
 * không cắt thêm), nên chỉ cần trừ gốc rồi chia.
 */
export function phanTramTrongVung(
  hinh: HinhChuNhatPx,
  vung: HinhChuNhatPx = VUNG_XEM_ALBUM,
): { leftPct: number; topPct: number; widthPct: number; heightPct: number } {
  return {
    leftPct: ((hinh.x - vung.x) / vung.rong) * 100,
    topPct: ((hinh.y - vung.y) / vung.cao) * 100,
    widthPct: (hinh.rong / vung.rong) * 100,
    heightPct: (hinh.cao / vung.cao) * 100,
  };
}

/** Cách đặt ẢNH BÀN GỐC trong khung xem `vung` (% của khung) để đúng phần đó lộ ra. */
export function viTriAnhNen(
  canh: CanhBanUv = CANH_BAN_ALBUM,
  vung: HinhChuNhatPx = VUNG_XEM_ALBUM,
): { leftPct: number; topPct: number; widthPct: number } {
  return {
    leftPct: (-vung.x / vung.rong) * 100,
    topPct: (-vung.y / vung.cao) * 100,
    widthPct: (canh.rongAnhPx / vung.rong) * 100,
  };
}
