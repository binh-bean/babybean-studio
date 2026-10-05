/**
 * Cảnh "bàn gỗ cạnh cửa sổ" cho chất liệu UV (BB-365) — cùng kiểu số liệu với
 * `phong-treo.ts`, kèm phép toán đặt TẤM ẢNH GIẤY của bé lên mặt bàn.
 *
 * OWNER: DEV-FE. UV là ẢNH GIẤY (anh 02/10/2026): không treo tường, không cán
 * gỗ, không khung. Chủ studio 04/10 muốn ướm ảnh UV lên bàn "như các chất liệu
 * khác ướm lên tường: ảnh to nhỏ theo cỡ khách chọn" — nên kích thước ở đây là
 * cm × pxMoiCm, y như `khung-tren-tuong.ts`, không phải một cỡ cố định.
 *
 * ---------------------------------------------------------------------------
 * Cách đo (Claude Opus, 04/10/2026, đo tay bằng PIL trên ảnh gốc)
 * ---------------------------------------------------------------------------
 * Vật tham chiếu: tấm ảnh 10×15 cm nằm NGANG trong túi album (trang phải) —
 * cạnh dài 15 cm. Đo mép ngoài viền trắng của tấm ảnh, lấy độ dài cạnh nghiêng
 * (√(dx²+dy²)) vì album đặt xéo:
 *   - `ban-uv-doc.jpg`  (1600×1986): tấm dưới, góc ảnh trong viền TL(667,1084)
 *     TR(936,1160) BL(609,1252) BR(885,1337) → cạnh dài ~280–289 px phần ảnh,
 *     cộng viền trắng ~12 px mỗi bên ≈ 300–310 px / 15 cm → 20 px/cm. Cạnh ngắn
 *     ~200 px / 10 cm cũng ra ~20 → tỉ lệ 3:2 khớp, tức đúng là tấm 10×15.
 *   - `ban-uv-ngang.jpg` (2000×1244): tấm trên ~231 px, tấm dưới ~221 px (cạnh
 *     ngắn ~145 px, tỉ lệ 1.52) → ~15 px/cm. Đối chiếu tấm ảnh rời nhỏ nhất
 *     bên phải (~186×240 px, vừa tấm 13×18 ở ~14 px/cm) — cùng cỡ số.
 * Vùng (mặt bàn, bình hoa, hộp ảnh, vùng trống) đo trên lưới 100 px rồi lưới
 * 20 px vẽ đè lên ảnh gốc. Sai số ước ±5%.
 *
 * Nắng vào từ cửa sổ phía TRÊN ảnh → bóng tấm ảnh đổ xuống dưới (`huongSang:
 * "tren"`).
 */

import type { HinhChuNhatPx, HuongSang, KhoAnhPhong } from "./phong-treo";
import { tachCoKhung, type CoKhungCm } from "./khung-tren-tuong";

/**
 * Một chỗ đặt ảnh trên bàn. `tam`: TÂM tấm ảnh phải nằm trong đây (vùng bàn
 * trống thật). `bao`: cả tấm ảnh (đã xoay) phải nằm trong đây — rộng hơn vùng
 * trống để cỡ lớn được chồng lên MÉP album/ảnh rời như ngoài đời, nhưng đã cắt
 * bỏ bình hoa, hộp ảnh và mọi chỗ ngoài mặt bàn. `diem`: chỗ đẹp nhất để đặt
 * khi cỡ còn nhỏ (tấm ảnh được kéo về gần điểm này nhất có thể).
 */
export interface ChoDatAnh {
  tam: HinhChuNhatPx;
  bao: HinhChuNhatPx;
  diem: { x: number; y: number };
}

export interface CanhBanUv {
  /** Tên tệp trong `public/tuong/`. */
  tep: string;
  rongAnhPx: number;
  caoAnhPx: number;
  /** Mặt bàn (mép sau giáp rèm → mép trước giáp sàn). */
  matBan: HinhChuNhatPx;
  /** Đồ vật KHÔNG được che (bình hoa, hộp ảnh) — để phép thử canh. */
  vatKhongChe: HinhChuNhatPx[];
  /** Theo thứ tự ưu tiên: chỗ đầu đặt được thì dùng chỗ đầu. */
  choDat: ChoDatAnh[];
  pxMoiCm: number;
  huongSang: HuongSang;
  /** Tấm ảnh nằm xéo nhẹ cho tự nhiên (độ, âm = ngược chiều kim đồng hồ). */
  gocXoayDo: number;
}

export const BAN_UV: Record<KhoAnhPhong, CanhBanUv> = {
  doc: {
    tep: "ban-uv-doc.jpg",
    rongAnhPx: 1600,
    caoAnhPx: 1986,
    matBan: { x: 0, y: 530, rong: 1600, cao: 1320 },
    vatKhongChe: [
      { x: 0, y: 330, rong: 330, cao: 470 }, // bình hoa (cả cành hoa)
      { x: 815, y: 355, rong: 630, cao: 645 }, // hộp ảnh (cả nắp mở)
    ],
    choDat: [
      // Góc dưới-trái: mảng bàn trống lớn nhất (~28×18 cm), dưới album. `bao`
      // sang phải tới x=1000 (chồng mép xấp ảnh rời ~8 cm) — cần khi ẩn bảng
      // trên điện thoại: ảnh tràn màn hình bị cắt trái tới x≈341, còn lại dải
      // bàn 341→1000 vừa đủ cho 20×30 ngang đã xoay (~633 px).
      {
        tam: { x: 140, y: 1420, rong: 560, cao: 360 },
        bao: { x: 10, y: 1180, rong: 990, cao: 660 },
        diem: { x: 400, y: 1610 },
      },
      // Dự phòng: dải nắng giữa bình hoa và hộp ảnh, phía trên album.
      {
        tam: { x: 400, y: 560, rong: 360, cao: 160 },
        bao: { x: 330, y: 535, rong: 480, cao: 615 },
        diem: { x: 580, y: 640 },
      },
    ],
    pxMoiCm: 20,
    huongSang: "tren",
    gocXoayDo: -5,
  },
  ngang: {
    tep: "ban-uv-ngang.jpg",
    rongAnhPx: 2000,
    caoAnhPx: 1244,
    matBan: { x: 0, y: 400, rong: 2000, cao: 755 },
    vatKhongChe: [
      { x: 0, y: 330, rong: 270, cao: 270 }, // bình hoa
      { x: 1365, y: 185, rong: 620, cao: 600 }, // hộp ảnh
    ],
    choDat: [
      // Dải bàn có nắng phía trên album, giữa bình hoa và tấm ảnh rời.
      {
        tam: { x: 330, y: 440, rong: 630, cao: 250 },
        bao: { x: 285, y: 405, rong: 730, cao: 745 },
        diem: { x: 640, y: 560 },
      },
    ],
    pxMoiCm: 15,
    huongSang: "tren",
    gocXoayDo: -6,
  },
};

export interface AnhGiayTrenBan {
  vua: true;
  /** Tấm ảnh CHƯA xoay (px ảnh gốc) — xoay quanh tâm bằng `gocXoayDo`. */
  hinh: HinhChuNhatPx;
  /** Hộp bao của tấm ảnh SAU khi xoay (px ảnh gốc). */
  baoSauXoay: HinhChuNhatPx;
  gocXoayDo: number;
}

export interface AnhGiayKhongVua {
  vua: false;
  lyDo: "co_khong_doc_duoc" | "khong_con_cho";
}

export type KetQuaAnhGiayTrenBan = AnhGiayTrenBan | AnhGiayKhongVua;

function giaoKhoang(a0: number, a1: number, b0: number, b1: number): [number, number] {
  return [Math.max(a0, b0), Math.min(a1, b1)];
}

function kep(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Đặt tấm ảnh giấy cỡ `co` lên bàn.
 *
 * @param huong "doc" = cạnh ngắn nằm ngang, "ngang" = cạnh dài nằm ngang —
 *   theo hướng ẢNH CỦA BÉ, giống `tinhKhungTrenTuong`.
 * @param vungNhin Phần ảnh gốc ba mẹ THẬT SỰ nhìn thấy (sau `object-fit:
 *   cover` và trừ bảng điều khiển / chữ nổi phía trên). Bỏ trống = cả ảnh.
 *   Không chỗ nào vừa trong phần nhìn thấy thì thử lại trên cả ảnh — thà ảnh
 *   nằm một phần dưới bảng (ba mẹ ẩn bảng là thấy) còn hơn biến mất.
 */
export function tinhAnhGiayTrenBan(
  canh: CanhBanUv,
  co: CoKhungCm,
  huong: "doc" | "ngang",
  vungNhin?: HinhChuNhatPx | null
): KetQuaAnhGiayTrenBan {
  const kichThuoc = tachCoKhung(co);
  if (!kichThuoc) return { vua: false, lyDo: "co_khong_doc_duoc" };
  const rongCm = huong === "doc" ? kichThuoc.canhNgan : kichThuoc.canhDai;
  const caoCm = huong === "doc" ? kichThuoc.canhDai : kichThuoc.canhNgan;
  const rong = rongCm * canh.pxMoiCm;
  const cao = caoCm * canh.pxMoiCm;

  const goc = (Math.abs(canh.gocXoayDo) * Math.PI) / 180;
  const rongXoay = rong * Math.cos(goc) + cao * Math.sin(goc);
  const caoXoay = rong * Math.sin(goc) + cao * Math.cos(goc);

  const thu = (nhin: HinhChuNhatPx | null): AnhGiayTrenBan | null => {
    for (const cho of canh.choDat) {
      // Hộp bao (đã xoay) nằm trong `bao` ∩ `matBan` ∩ phần nhìn thấy; tâm nằm trong `tam`.
      let [x0, x1] = giaoKhoang(cho.bao.x, cho.bao.x + cho.bao.rong, canh.matBan.x, canh.matBan.x + canh.matBan.rong);
      let [y0, y1] = giaoKhoang(cho.bao.y, cho.bao.y + cho.bao.cao, canh.matBan.y, canh.matBan.y + canh.matBan.cao);
      if (nhin) {
        [x0, x1] = giaoKhoang(x0, x1, nhin.x, nhin.x + nhin.rong);
        [y0, y1] = giaoKhoang(y0, y1, nhin.y, nhin.y + nhin.cao);
      }
      const [txMin, txMax] = giaoKhoang(x0 + rongXoay / 2, x1 - rongXoay / 2, cho.tam.x, cho.tam.x + cho.tam.rong);
      const [tyMin, tyMax] = giaoKhoang(y0 + caoXoay / 2, y1 - caoXoay / 2, cho.tam.y, cho.tam.y + cho.tam.cao);
      if (txMin > txMax || tyMin > tyMax) continue;
      const tx = kep(cho.diem.x, txMin, txMax);
      const ty = kep(cho.diem.y, tyMin, tyMax);
      return {
        vua: true,
        hinh: { x: tx - rong / 2, y: ty - cao / 2, rong, cao },
        baoSauXoay: { x: tx - rongXoay / 2, y: ty - caoXoay / 2, rong: rongXoay, cao: caoXoay },
        gocXoayDo: canh.gocXoayDo,
      };
    }
    return null;
  };

  return (vungNhin ? thu(vungNhin) : null) ?? thu(null) ?? { vua: false, lyDo: "khong_con_cho" };
}

/**
 * Phần ảnh gốc nhìn thấy trong một khung `rong × cao` (px màn hình) phủ bằng
 * `object-fit: cover`, sau khi trừ các dải bị che ở mép (px màn hình). Cùng
 * phép toán `object-fit: cover` của màn tường (scale = max hai chiều, cắt đối
 * xứng).
 */
export function vungNhinTrenAnh(
  khungRong: number,
  khungCao: number,
  anhRong: number,
  anhCao: number,
  che: { tren?: number; duoi?: number; trai?: number; phai?: number } = {}
): HinhChuNhatPx | null {
  if (khungRong <= 0 || khungCao <= 0 || anhRong <= 0 || anhCao <= 0) return null;
  const scale = Math.max(khungRong / anhRong, khungCao / anhCao);
  const lechX = (anhRong * scale - khungRong) / 2;
  const lechY = (anhCao * scale - khungCao) / 2;
  const trai = che.trai ?? 0;
  const tren = che.tren ?? 0;
  const phai = khungRong - (che.phai ?? 0);
  const duoi = khungCao - (che.duoi ?? 0);
  if (phai <= trai || duoi <= tren) return null;
  return {
    x: (trai + lechX) / scale,
    y: (tren + lechY) / scale,
    rong: (phai - trai) / scale,
    cao: (duoi - tren) / scale,
  };
}
