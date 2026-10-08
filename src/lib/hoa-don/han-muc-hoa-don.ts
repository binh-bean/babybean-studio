/**
 * BB-395 — dòng hạn mức do HOÁ ĐƠN: phần thuần (không DB), phép thử gọi được.
 *
 * Xác nhận bằng hoá đơn thêm vào `gallery_items` một dòng cho mỗi dòng hoá đơn có tiền:
 *   · `lark_record_id = 'hoa_don:<mã dòng hoá đơn>'` (cột unique → đồng bộ lại không nhân đôi),
 *   · `lark_contract_code = null` → kéo hợp đồng từ Lark (`ghiDongHopDong`) không xoá nó,
 *   · dòng "Edit file": `quantity` = số file hoá đơn NÂNG HẠN MỨC, `line_total` = tiền hoá đơn
 *     phần đó → `app.gallery_quota` tăng đúng N qua công thức cũ.
 * Tiền: xem `TienHanMucHoaDon` (tien-phat-sinh.ts).
 */
import type { TienHanMucHoaDon } from "@/lib/gallery/tien-phat-sinh";

export const TIEN_TO_DONG_HOA_DON = "hoa_don:";

export function laDongHoaDon(larkRecordId: string | null | undefined): boolean {
  return typeof larkRecordId === "string" && larkRecordId.startsWith(TIEN_TO_DONG_HOA_DON);
}

export function maDongHoaDonTrongApp(maDong: string): string {
  return `${TIEN_TO_DONG_HOA_DON}${maDong}`;
}

export interface DongHanMucHoaDon {
  quantity: number;
  /** Tiền hoá đơn của dòng (đồng). null = cũ/thiếu → tính 0. */
  lineTotal: number | null;
  createdAt: string;
  /** Chỉ dòng sản phẩm loại ảnh chỉnh sửa mới tính vào tiền/hạn mức. */
  laAnhChinh: boolean;
}

/**
 * Gom các dòng hoá đơn của MỘT bộ thành `TienHanMucHoaDon`.
 * @param ghiCoHoaDon tổng `gallery_payments.amount` có `ma_hoa_don` của bộ.
 */
export function tinhTienHoaDon(
  dong: readonly DongHanMucHoaDon[],
  luot: { chotLuc: string | null | undefined; soAnhLucChot: number; tienLucChot: number },
  ghiCoHoaDon: number,
): TienHanMucHoaDon & { soAnh: number } {
  let tien = 0;
  let soAnh = 0;
  let soAnhSauChot = 0;
  const moc = luot.chotLuc ? Date.parse(luot.chotLuc) : NaN;
  for (const d of dong) {
    if (!d.laAnhChinh) continue;
    const q = Math.max(0, Number(d.quantity) || 0);
    soAnh += q;
    tien += Math.max(0, Number(d.lineTotal ?? 0) || 0);
    if (Number.isFinite(moc) && Date.parse(d.createdAt) >= moc) soAnhSauChot += q;
  }
  const soLucChot = Math.max(0, Number(luot.soAnhLucChot) || 0);
  const tienLucChot = Math.max(0, Number(luot.tienLucChot) || 0);
  const giaLucChot = soLucChot > 0 ? tienLucChot / soLucChot : 0;
  const truLucChot = Math.round(Math.min(soAnhSauChot, soLucChot) * giaLucChot);
  return { tien, truLucChot, ghiCoNgoaiVuot: Math.max(0, (Number(ghiCoHoaDon) || 0) - tien), soAnh };
}
