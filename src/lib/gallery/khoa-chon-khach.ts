/**
 * BB-338 mục 3 — MỘT công thức "ba mẹ còn tự sửa danh sách được không".
 *
 * Lỗi chủ studio báo 01/10/2026: bộ ảnh đã khoá chọn, ba mẹ bấm "Yêu cầu sửa
 * lại" thì nhận câu "Bộ ảnh vẫn đang mở — ba mẹ sửa trực tiếp được, không cần
 * xin ạ".
 *
 * Gốc lỗi: hai đầu dùng hai luật khác nhau.
 *   - Màn khách (`/api/g/gallery` → `khoaChonTheoLark`) khoá theo trạng thái
 *     app + mã Lark CÒN HIỆU LỰC (BB-285/BB-327) + luật 60 ngày.
 *   - Route `/api/g/xin-sua-lai` chỉ xét `isGalleryLocked(status)` — KHÔNG
 *     xét Lark. Bộ app còn `in_review`/`submitted` mà Lark đã sang "Đã chọn
 *     hình" trở lên thì màn khách khoá và hiện nút "Yêu cầu sửa lại", còn
 *     route lại bảo "vẫn đang mở".
 *
 * Nay cả hai gọi chung hàm này — không tự tính lại ở nơi khác.
 */

import { isGalleryLocked, maLarkConHieuLuc } from "@/lib/gallery-status";
import { qua60NgayFileGoc } from "@/lib/lark/trang-thai-hau-ky";

export interface DongKhoaChon {
  status: string;
  lark_trang_thai?: string | null;
  lark_trang_thai_tu?: string | Date | null;
  reopened_at?: string | Date | null;
}

export interface KetQuaKhoaChon {
  /** Ba mẹ KHÔNG tự sửa danh sách được nữa (phải xin CSKH mở lại). */
  khoa: boolean;
  /** Khoá vì quá 60 ngày ở "Đã gửi file gốc" — câu báo riêng cho khách. */
  quaHan60Ngay: boolean;
  /** Mã Lark còn hiệu lực sau luật mở lại của BB-327 (null = coi như không có). */
  larkHieuLuc: string | null;
}

export function khoaChonCuaKhach(g: DongKhoaChon, homNay: Date = new Date()): KetQuaKhoaChon {
  const larkHieuLuc = maLarkConHieuLuc(g);
  const quaHan60Ngay = qua60NgayFileGoc(
    larkHieuLuc,
    g.lark_trang_thai_tu ? new Date(g.lark_trang_thai_tu) : null,
    homNay,
  );
  return {
    khoa: isGalleryLocked(g.status, larkHieuLuc) || quaHan60Ngay,
    quaHan60Ngay,
    larkHieuLuc,
  };
}
