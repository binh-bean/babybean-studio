/**
 * Toán phóng ảnh trong màn xem lớn (Lightbox) — BB-210.
 *
 * OWNER: DEV-FE.
 *
 * Tách khỏi `photo-lightbox.tsx` vì đây là phần TOÁN THUẦN (không đụng DOM),
 * nên phép thử chạy được không cần trình duyệt — và vì đây đúng chỗ dễ sai
 * nhất: phóng lệch tâm ngón tay, hoặc kéo ảnh bay ra ngoài khung, khách sẽ
 * thấy ngay trong vài giây đầu chạm vào ảnh.
 *
 * Hệ toạ độ dùng chung: mọi điểm (x, y) đo TỪ TÂM khung ảnh, đơn vị px, khớp
 * với CSS `transform: translate(x, y) scale(scale)` khi phần tử có
 * `transform-origin` mặc định (50% 50% — chính giữa).
 */

/** Điểm tính từ tâm khung ảnh, đơn vị px. */
export interface Diem {
  x: number;
  y: number;
}

/** Trạng thái phóng: tỉ lệ và độ dịch (translate) đang áp dụng lên ảnh. */
export interface TrangThaiPhong {
  scale: number;
  x: number;
  y: number;
}

/** Không phóng nhỏ hơn ảnh gốc — dưới 1× là thu nhỏ, không phải phóng. */
export const TI_LE_NHO_NHAT = 1;
/** Chủ studio chốt 4× là đủ soi chi tiết mà ảnh không vỡ hạt quá lộ. */
export const TI_LE_LON_NHAT = 4;
/** Tỉ lệ bật lên khi chạm hai lần / nhấp đúp vào ảnh đang ở 1×. */
export const TI_LE_CHAM_HAI_LAN = 2.5;
/** Từ tỉ lệ này trở lên thì nạp bản ảnh nét hơn (xem photo-lightbox.tsx). */
export const NGUONG_ANH_NET = 1.5;

/** Kẹp tỉ lệ về đúng khoảng cho phép [1×, 4×]. */
export function kepTiLe(scale: number): number {
  return Math.min(TI_LE_LON_NHAT, Math.max(TI_LE_NHO_NHAT, scale));
}

/**
 * Phóng quanh một điểm — điểm đó (ngón tay, con trỏ chuột) đứng yên trên màn
 * hình trước và sau khi đổi tỉ lệ.
 *
 * Với `transform: translate(x, y) scale(scale)` và gốc toạ độ ở tâm khung:
 * một điểm ảnh ở toạ độ cục bộ p hiện ra trên màn hình tại `x + scale * p`.
 * Muốn điểm `diem` (đã biết vị trí màn hình) đứng yên khi tỉ lệ đổi từ
 * `hienTai.scale` sang `tiLeMoi`, suy ra độ dịch mới từ đẳng thức trên.
 */
export function phongQuanhDiem(
  hienTai: TrangThaiPhong,
  tiLeMoi: number,
  diem: Diem,
): TrangThaiPhong {
  const scale = kepTiLe(tiLeMoi);
  if (hienTai.scale <= 0) return { scale, x: 0, y: 0 };
  const ti = scale / hienTai.scale;
  return {
    scale,
    x: diem.x - ti * (diem.x - hienTai.x),
    y: diem.y - ti * (diem.y - hienTai.y),
  };
}

/**
 * Kẹp biên: không cho kéo ảnh ra khỏi khung.
 *
 * Ảnh vốn đã vừa khít khung ở tỉ lệ 1× (nhờ `object-contain`), nên ở tỉ lệ
 * `scale` nó rộng/cao gấp `scale` lần khung — phần thừa mỗi bên là
 * `khung * (scale - 1) / 2`. Độ dịch không được vượt quá phần thừa đó, nếu
 * không mép ảnh sẽ tụt vào giữa khung, để lộ nền trống.
 */
export function kepBien(
  x: number,
  y: number,
  scale: number,
  khungRong: number,
  khungCao: number,
): Diem {
  const bienX = Math.max(0, (khungRong * (scale - 1)) / 2);
  const bienY = Math.max(0, (khungCao * (scale - 1)) / 2);
  // `+ 0` gạt số -0 (Math.min/max có thể trả -0 khi x/y âm bị kẹp về 0),
  // vì -0 làm `toEqual` trong phép thử phân biệt sai với +0.
  return {
    x: Math.min(bienX, Math.max(-bienX, x)) + 0,
    y: Math.min(bienY, Math.max(-bienY, y)) + 0,
  };
}

/** Chạm hai lần / nhấp đúp: đang phóng thì về 1×, đang 1× thì bật lên. */
export function tiLeSauChamHaiLan(scaleHienTai: number): number {
  return scaleHienTai > TI_LE_NHO_NHAT + 0.01 ? TI_LE_NHO_NHAT : TI_LE_CHAM_HAI_LAN;
}

/**
 * Tỉ lệ mới khi lăn chuột / chụm trên bàn di chuột (`wheel`).
 * `deltaY` âm (cuộn lên / chụm ra) = phóng to; dương = thu nhỏ.
 * Dùng hàm mũ để mỗi nấc cuộn đổi tỉ lệ theo TỈ LỆ PHẦN TRĂM chứ không phải
 * cộng trừ một số cố định — cảm giác đều tay dù đang ở 1× hay gần 4×.
 */
export function tiLeTuCuonChuot(scaleHienTai: number, deltaY: number): number {
  const heSo = Math.exp(-deltaY * 0.01);
  return kepTiLe(scaleHienTai * heSo);
}
