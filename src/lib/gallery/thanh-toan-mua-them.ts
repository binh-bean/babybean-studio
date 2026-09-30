/**
 * BB-332 mục 3b — trạng thái thanh toán MUA THÊM của một bộ ảnh, suy ra từ sổ.
 *
 * Luật chủ studio (30/09/2026): "số dư của khách = 0 là đã thanh toán đủ".
 * Số dư = phải thu − đã ghi có (sổ `gallery_payments`, gồm cả dòng giảm giá
 * BB-320). Không lưu cột "đã thanh toán" cho cả bộ — lưu thì lệch sổ.
 * Cột lưu (mã hoá đơn, mã phiếu thu, mốc xác nhận từng đợt) ở migration 0080.
 */

export type TrangThaiThanhToan = "khong_phat_sinh" | "con_thieu" | "da_thanh_toan";

export const NHAN_THANH_TOAN: Record<TrangThaiThanhToan, string> = {
  khong_phat_sinh: "Không có mua thêm",
  con_thieu: "Chưa thanh toán đủ",
  da_thanh_toan: "Đã thanh toán",
};

/**
 * @param phaiThu  tổng tiền mua thêm khách phải trả (ảnh thêm + sản phẩm), VND
 * @param daGhiCo  tổng đã ghi có trong sổ (tiền thu + giảm giá − hoàn), VND
 */
export function trangThaiThanhToan(phaiThu: number, daGhiCo: number): TrangThaiThanhToan {
  if (!Number.isFinite(phaiThu) || phaiThu <= 0) return "khong_phat_sinh";
  const soDu = phaiThu - (Number.isFinite(daGhiCo) ? daGhiCo : 0);
  return soDu <= 0 ? "da_thanh_toan" : "con_thieu";
}
