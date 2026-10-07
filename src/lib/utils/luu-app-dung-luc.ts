/**
 * BB-378 — KHI NÀO mời ba mẹ "lưu app ra màn hình chính".
 *
 * OWNER: DEV-FE. Anh (Bản yêu cầu, P1): "nếu không phải người thiết kế thì
 * không biết nó để làm gì — cần nó giống như gợi ý cho khách biết". Một lời mời
 * hiện NGAY giây đầu mở link (trước khi ba mẹ biết bộ ảnh có gì) là lời mời
 * không ai hiểu. Hiện ĐÚNG LÚC: ba mẹ đã gắn bó với bộ ảnh.
 *
 * Hàm THUẦN — component (`loi-goi-y-luu-app.tsx`) tự đọc localStorage /
 * matchMedia rồi truyền vào, phép thử canh luật không cần trình duyệt.
 *
 * Luật (theo thứ tự):
 *  1. Đang chạy như app đã cài (display-mode standalone / navigator.standalone)
 *     → không bao giờ mời.
 *  2. Ba mẹ đã bấm "Để sau"/× (hoặc đã xem cách lưu) trong `NGAY_AN` ngày → im.
 *  3. Lần mở thứ 2 trở đi (đếm theo PHIÊN trình duyệt, không theo lượt dựng
 *     component) → mời.
 *  4. Mở ra đã có tim từ trước (`daChonLucMo > 0`) → đó cũng là người quay lại
 *     (BB-289: khách mở link cũ đã thả tim phải thấy lời mời ngay) → mời.
 *  5. Trong phiên này đã xem lớn / thả tim đủ `NGUONG_TIN_HIEU` tấm → mời.
 */

export const KHOA_DA_AN = "bb_luu_app_da_dong_luc";
export const KHOA_SO_LAN_MO = "bb_luu_app_so_lan_mo";
/** sessionStorage — đánh dấu phiên này đã được đếm một lần mở. */
export const KHOA_PHIEN = "bb_luu_app_phien";
export const NGAY_AN = 30;
export const NGUONG_TIN_HIEU = 3;

export interface DauVaoGoiYLuuApp {
  dangLaApp: boolean;
  /** Mốc (ms) lần bấm ẩn/xem cách lưu gần nhất; null = chưa từng. */
  lucDaAn: number | null;
  bayGio: number;
  /** Số phiên trình duyệt đã mở màn khách trên máy này, tính cả phiên hiện tại. */
  soLanMo: number;
  /** Số tấm đã có tim ngay lúc mở (tim từ những lần trước). */
  daChonLucMo: number;
  /** Số tấm xem lớn + tim mới thả trong phiên này. */
  tinHieuTrongPhien: number;
}

export function nenHienGoiYLuuApp(v: DauVaoGoiYLuuApp): boolean {
  if (v.dangLaApp) return false;
  if (v.lucDaAn !== null && Number.isFinite(v.lucDaAn)) {
    const soNgay = (v.bayGio - v.lucDaAn) / 86_400_000;
    if (soNgay >= 0 && soNgay < NGAY_AN) return false;
  }
  if (v.soLanMo >= 2) return true;
  if (v.daChonLucMo > 0) return true;
  return v.tinHieuTrongPhien >= NGUONG_TIN_HIEU;
}

/** Trình duyệt đang chạy trang như một app đã cài (Android/Chrome: display-mode; iOS: navigator.standalone). */
export function dangChayNhuApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
  } catch {
    // matchMedia hỏng thì coi như chưa cài — lời mời bỏ qua được, không chặn màn khách.
  }
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}
