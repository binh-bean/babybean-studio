/**
 * Xếp ảnh so le (masonry) — mỗi tấm giữ ĐÚNG khung dọc/ngang của nó.
 *
 * OWNER: DEV-FE. Chủ studio duyệt 23/09/2026 hướng "cuốn album kỷ niệm".
 *
 * ---------------------------------------------------------------------------
 * Vì sao bỏ lưới vuông
 * ---------------------------------------------------------------------------
 * Lưới cũ cắt mọi tấm thành hình vuông. Ảnh em bé gần như toàn ảnh DỌC 2:3,
 * nên hình vuông cắt mất một phần ba tấm ảnh — thường là đầu hoặc chân bé. Ba
 * mẹ đang chọn ảnh để in, mà thứ họ nhìn thấy không phải tấm sẽ được in.
 *
 * ---------------------------------------------------------------------------
 * Vì sao tự tính chứ không dùng CSS `columns`
 * ---------------------------------------------------------------------------
 * CSS `columns` xếp đẹp, nhưng buộc phải có MỌI tấm trong DOM — và bộ lớn nhất
 * có 1.235 tấm. BB-131 đã đo cái giá đó: 11.262 nút, tác vụ chặn 360ms trên
 * điện thoại. Nên vị trí từng tấm được tính bằng số học ở đây (rẻ: một vòng lặp
 * cộng trừ), rồi lưới chỉ dựng những tấm đang trong tầm nhìn.
 *
 * Kích thước thật của ảnh có sẵn trong cơ sở dữ liệu: đo 23/09/2026, 155.022
 * trên 155.028 tấm có đủ cột width/height. Sáu tấm còn thiếu lấy khung 2:3.
 */

export interface OAnh {
  /** Toạ độ tính từ góc trên bên trái của khung lưới, đơn vị px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tỉ lệ cao/rộng khi ảnh chưa có kích thước — khung dọc 2:3 phổ biến nhất. */
export const TI_LE_MAC_DINH = 1.5;

/**
 * Chặn hai đầu tỉ lệ. Một tấm toàn cảnh 1:4 sẽ thành một dải mỏng như sợi chỉ,
 * và một tấm dọc 1:4 thì dài hết cả màn hình — cả hai đều không chọn được.
 */
const TI_LE_THAP_NHAT = 0.4;
const TI_LE_CAO_NHAT = 2.2;

export function tiLeCuaAnh(rong: number | null | undefined, cao: number | null | undefined): number {
  if (!rong || !cao || rong <= 0 || cao <= 0) return TI_LE_MAC_DINH;
  return Math.min(TI_LE_CAO_NHAT, Math.max(TI_LE_THAP_NHAT, cao / rong));
}

/**
 * Số cột theo bề ngang màn hình.
 *
 * Điện thoại 2 cột: mỗi tấm còn ~180px — đủ nhận ra nét mặt con. 3 cột trên
 * điện thoại thì mỗi tấm chỉ còn ~120px, ba mẹ phải mở từng tấm mới biết con
 * có đang cười không.
 */
export function soCotSoLe(rongMan: number): number {
  if (rongMan >= 1280) return 5;
  if (rongMan >= 1024) return 4;
  if (rongMan >= 640) return 3;
  return 2;
}

/** Khoảng hở giữa hai tấm: hẹp trên điện thoại để ảnh được to nhất có thể. */
export function kheSoLe(rongMan: number): number {
  return rongMan >= 1024 ? 10 : 6;
}

/**
 * Xếp lần lượt từng tấm vào cột đang THẤP nhất.
 *
 * Cách này giữ gần đúng thứ tự chụp khi đọc từ trên xuống — điều quan trọng,
 * vì ba mẹ nhớ ảnh theo diễn biến buổi chụp ("mấy tấm lúc con cầm bóng").
 */
export function xepSoLe(
  tiLe: readonly number[],
  rongKhung: number,
  soCot: number,
  khe: number,
): { o: OAnh[]; cao: number } {
  if (rongKhung <= 0 || soCot <= 0) return { o: [], cao: 0 };

  const rongCot = (rongKhung - khe * (soCot - 1)) / soCot;
  const caoCot = new Array<number>(soCot).fill(0);
  const o: OAnh[] = new Array(tiLe.length);

  for (let i = 0; i < tiLe.length; i++) {
    let cot = 0;
    for (let c = 1; c < soCot; c++) if (caoCot[c]! < caoCot[cot]!) cot = c;

    const h = Math.round(rongCot * (tiLe[i] ?? TI_LE_MAC_DINH));
    o[i] = { x: cot * (rongCot + khe), y: caoCot[cot]!, w: rongCot, h };
    caoCot[cot] = caoCot[cot]! + h + khe;
  }

  const cao = Math.max(0, ...caoCot) - (tiLe.length > 0 ? khe : 0);
  return { o, cao: Math.max(0, cao) };
}

/**
 * Những tấm chạm vào đoạn [tu, den] (tính theo toạ độ của khung lưới).
 *
 * Duyệt cả mảng chứ không tìm nhị phân: xếp so le làm `y` không tăng đều theo
 * thứ tự, và 1.235 phép so sánh chỉ tốn chưa tới một phần mười mili giây.
 */
export function oTrongTamNhin(o: readonly OAnh[], tu: number, den: number): number[] {
  const kq: number[] = [];
  for (let i = 0; i < o.length; i++) {
    const a = o[i]!;
    if (a.y + a.h >= tu && a.y <= den) kq.push(i);
  }
  return kq;
}
