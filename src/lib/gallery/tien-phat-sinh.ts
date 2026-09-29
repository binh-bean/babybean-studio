/**
 * Tính tiền phát sinh — các hàm THUẦN cho màn quản trị (BB-320).
 *
 * Hai việc chủ dự án giao:
 *
 *  A. CSKH sửa dòng hàng ở mọi trạng thái trừ "lưu trữ". Sau khi sửa hạn mức, số
 *     ảnh vượt và số tiền phát sinh phải HIỆN LẠI theo hạn mức MỚI — nhưng con số
 *     khách đã nhìn thấy lúc chốt (`snapshot_extra_amount`) KHÔNG đổi, vì khách
 *     trả theo số đó (xem chú thích ở payments/route.ts). Nên hai con số nằm
 *     cạnh nhau, không thay nhau: `tinhPhatSinhTheoHanMuc` chỉ là số THEO HẠN MỨC
 *     HIỆN TẠI để CSKH đối chiếu.
 *
 *  B. "Giảm giá %" khi ghi nhận thu tiền. Sổ thanh toán chỉ ghi thêm; phần giảm
 *     là MỘT DÒNG RIÊNG (`payment_method = 'giam_gia'`, số dương = ghi có cho
 *     khách) có người ghi và lý do, để số còn thiếu về đúng 0 khi khách trả đủ
 *     phần sau giảm. `tinhGiamGia` là công thức duy nhất — màn hình dùng nó để
 *     gợi ý, route dùng nó để ghi; không hai bên tính hai kiểu.
 */

/** Loại dòng sổ dành cho phần giảm giá (cột `gallery_payments.payment_method`, không cần cột mới). */
export const HINH_THUC_GIAM_GIA = "giam_gia";

/** Làm tròn về nghìn đồng gần nhất (nửa nghìn làm tròn lên). */
export function lamTronNghin(soTien: number): number {
  return Math.round(soTien / 1000) * 1000;
}

export interface KetQuaGiamGia {
  /** Số tiền khách phải trả sau giảm, đã làm tròn nghìn đồng. */
  soTienGoiY: number;
  /** Phần được giảm = còn thiếu − số tiền gợi ý. Luôn ≥ 0. */
  soTienGiam: number;
}

/**
 * Giảm `phanTram`% trên số CÒN THIẾU.
 *
 * Số tiền gợi ý = còn thiếu × (1 − %/100), làm tròn nghìn đồng; phần giảm là phần
 * còn lại, nên gợi ý + giảm luôn đúng bằng số còn thiếu — không lệch một đồng.
 *
 * Trả null khi không tính được: còn thiếu ≤ 0 (không còn gì để giảm), % ngoài
 * (0, 100] hoặc không phải số.
 */
export function tinhGiamGia(conThieu: number, phanTram: number): KetQuaGiamGia | null {
  if (!Number.isFinite(conThieu) || conThieu <= 0) return null;
  if (!Number.isFinite(phanTram) || phanTram <= 0 || phanTram > 100) return null;
  const goiY = Math.min(conThieu, Math.max(0, lamTronNghin(conThieu * (1 - phanTram / 100))));
  return { soTienGoiY: goiY, soTienGiam: conThieu - goiY };
}

/**
 * Số ảnh vượt và tiền phát sinh THEO HẠN MỨC HIỆN TẠI.
 *
 * - `hanMuc` null = chưa biết hạn mức → không kết luận (trả null), giống báo cáo
 *   vượt hạn mức: chưa đủ dữ liệu thì không đoán.
 * - Ảnh khách đã mua thêm (sản phẩm `edited_photo`) trừ khỏi số ảnh vượt, đúng
 *   như `v_over_quota_unbilled`.
 */
export function tinhPhatSinhTheoHanMuc(input: {
  soAnhDaChon: number;
  hanMuc: number | null;
  giaAnhVuot: number;
  anhDaMuaThem?: number;
}): { anhVuot: number; tien: number } | null {
  if (input.hanMuc === null || !Number.isFinite(input.hanMuc)) return null;
  const vuot = Math.max(0, input.soAnhDaChon - input.hanMuc);
  const anhVuot = Math.max(0, vuot - Math.max(0, input.anhDaMuaThem ?? 0));
  return { anhVuot, tien: anhVuot * Math.max(0, input.giaAnhVuot) };
}

/**
 * Câu báo sau khi CSKH đổi hạn mức: nói số ảnh vượt / tiền theo hạn mức MỚI và
 * nhắc rằng số lúc khách chốt giữ nguyên (không bị đổi ngầm).
 */
export function cauBaoSauDoiHanMuc(input: {
  hanMucTruoc: number | null;
  hanMucSau: number | null;
  soAnhDaChon: number;
  giaAnhVuot: number;
  anhDaMuaThem?: number;
  /** `snapshot_extra_amount` — số khách đã nhìn thấy lúc chốt. */
  soTienLucChot: number;
  dinhDangTien: (n: number) => string;
}): string | null {
  if (input.hanMucTruoc === input.hanMucSau) return null;
  const truoc = input.hanMucTruoc ?? "chưa biết";
  const sau = input.hanMucSau ?? "chưa biết";
  let cau = `Hạn mức đã đổi: ${truoc} → ${sau} ảnh.`;
  const moi = tinhPhatSinhTheoHanMuc({
    soAnhDaChon: input.soAnhDaChon,
    hanMuc: input.hanMucSau,
    giaAnhVuot: input.giaAnhVuot,
    anhDaMuaThem: input.anhDaMuaThem,
  });
  if (moi && input.soAnhDaChon > 0) {
    cau +=
      moi.anhVuot > 0
        ? ` Khách đã chọn ${input.soAnhDaChon} ảnh, nay vượt ${moi.anhVuot} ảnh = ${input.dinhDangTien(moi.tien)}.`
        : ` Khách đã chọn ${input.soAnhDaChon} ảnh, nay không còn vượt hạn mức.`;
    if (input.soTienLucChot > 0 && moi.tien !== input.soTienLucChot) {
      cau += ` Số khách nhìn thấy lúc chốt (${input.dinhDangTien(input.soTienLucChot)}) giữ nguyên.`;
    }
  }
  return `${cau} Nhớ báo lại cho khách.`;
}

/**
 * Số tiền còn phải thu của một bộ vượt hạn mức SAU KHI trừ mọi khoản đã ghi có
 * (tiền đã thu + phần giảm giá) — dùng cho báo cáo "vượt hạn mức, chưa thu tiền".
 * Không âm: khách trả dư thì bộ đó không còn "chưa thu" (khoản dư là chuyện khác).
 */
export function tienConPhaiThuSauGhiCo(tienChuaThuTheoAnh: number, daGhiCo: number): number {
  return Math.max(0, tienChuaThuTheoAnh - Math.max(0, daGhiCo));
}
