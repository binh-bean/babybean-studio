/**
 * BB-354 — các con số "tổng" trên trang chi tiết khách. HÀM THUẦN.
 *
 * Lỗi cũ: thẻ "Tổng giá trị đã mua" chỉ lấy tiền MUA THÊM (sản phẩm chọn kèm lúc chốt),
 * nên khách đã trả tiền trong app mà không mua thêm vẫn hiện 0 ₫.
 *
 * Định nghĩa chốt:
 *   · tongMuaThem = Σ số lượng × đơn giá các món mua thêm của lượt chọn chính đã chốt
 *     (cùng định nghĩa với BB-303 và báo cáo Doanh thu phát sinh).
 *   · tongDaThu   = Σ các dòng sổ `gallery_payments` KHÔNG phải giảm giá (tiền thật đã thu;
 *     dòng âm = hoàn/ghi nhầm nên tự trừ).
 *   · tongGiamGia = Σ các dòng giảm giá (không phải tiền thu).
 *   · tongGiaTri  = tongMuaThem + tongDaThu. Giảm giá KHÔNG cộng vào: đó là tiền khách
 *     không phải trả, không phải giá trị khách đã mua.
 *
 * Giới hạn đã biết: app không giữ giá gói chụp (gói nằm bên Lark), nên "giá trị đã mua"
 * ở đây là phần ghi trong app, không phải toàn bộ hợp đồng. Màn hình nói rõ điều đó ở ghi chú thẻ.
 */
export interface TongKhach {
  tongMuaThem: number;
  tongDaThu: number;
  tongGiamGia: number;
  tongGiaTri: number;
}

export function tinhTongKhach(
  muaThem: Array<{ thanhTien: number }>,
  thanhToan: Array<{ soTien: number; laGiamGia: boolean }>,
): TongKhach {
  const tongMuaThem = muaThem.reduce((t, m) => t + m.thanhTien, 0);
  const tongDaThu = thanhToan.filter((p) => !p.laGiamGia).reduce((t, p) => t + p.soTien, 0);
  const tongGiamGia = thanhToan.filter((p) => p.laGiamGia).reduce((t, p) => t + p.soTien, 0);
  return { tongMuaThem, tongDaThu, tongGiamGia, tongGiaTri: tongMuaThem + tongDaThu };
}
