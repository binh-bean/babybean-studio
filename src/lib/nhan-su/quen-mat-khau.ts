/**
 * "Quên mật khẩu?" ở màn đăng nhập nhân viên — BB-327.
 *
 * Chủ studio 29/09/2026: dòng "Quên mật khẩu? Nhờ admin đặt lại giúp." chỉ là
 * chữ, không bấm được, nhân viên phải tự đi tìm admin. Nay nhân viên gõ tên
 * tài khoản/email, app ghi một yêu cầu, admin thấy ngay trong "Việc cần xử lý"
 * (tab "Quên mật khẩu", huy hiệu menu cộng cả số này) và đặt lại ở Nhân sự.
 * Gửi qua Lark để sau.
 *
 * Lưu ở đâu: `activity_logs` (action `staff.quen_mat_khau`), KHÔNG cần bảng
 * mới / migration — cùng cách "xin mở lại" (yeu-cau-mo-lai.ts) đã làm. Yêu
 * cầu coi là ĐÃ XỬ LÝ khi có dòng `staff.update` với `passwordReset: true`
 * cho đúng nhân sự đó, MỚI HƠN yêu cầu — tức admin đặt lại mật khẩu ở Nhân sự
 * là yêu cầu tự rời danh sách, không cần bấm thêm nút nào.
 *
 * KHÔNG lộ tài khoản có tồn tại hay không: route luôn trả cùng một câu.
 */

export const HANH_DONG_QUEN_MAT_KHAU = "staff.quen_mat_khau";

/** Câu DUY NHẤT màn đăng nhập hiện sau khi gửi — có tài khoản hay không đều vậy. */
export const CAU_DA_GUI_QUEN_MAT_KHAU =
  "Đã gửi yêu cầu. Nếu tài khoản có trong hệ thống, admin sẽ đặt lại mật khẩu và báo lại bạn.";

/** Một nhân sự gửi lại trong khoảng này thì không ghi thêm dòng mới (chống bấm liên tục). */
export const GIAN_CACH_GUI_LAI_PHUT = 10;

/** Trần toàn hệ thống mỗi giờ — người lạ dò tên tài khoản không làm đầy danh sách của admin. */
export const TRAN_MOI_GIO = 30;

export interface DongYeuCauQuenMatKhau {
  staffId: string;
  requestedAt: string;
}

export interface DongDatLaiMatKhau {
  staffId: string;
  resetAt: string;
}

/**
 * Yêu cầu CHƯA XỬ LÝ: với mỗi nhân sự giữ yêu cầu MỚI NHẤT, bỏ nếu đã có lần
 * đặt lại mật khẩu sau đó. Trả kèm số lần gửi (chưa xử lý) để admin biết người
 * đó đã chờ bao lâu. Xếp cũ trước — ai chờ lâu nhất lên đầu.
 */
export function locYeuCauChuaXuLy(
  yeuCau: ReadonlyArray<DongYeuCauQuenMatKhau>,
  datLai: ReadonlyArray<DongDatLaiMatKhau>,
): Array<{ staffId: string; requestedAt: string; lanThu: number }> {
  const datLaiMoiNhat = new Map<string, number>();
  for (const d of datLai) {
    const t = new Date(d.resetAt).getTime();
    if (!Number.isFinite(t)) continue;
    const cu = datLaiMoiNhat.get(d.staffId);
    if (cu === undefined || t > cu) datLaiMoiNhat.set(d.staffId, t);
  }

  const theoNguoi = new Map<string, { requestedAt: string; t: number; lanThu: number }>();
  for (const y of yeuCau) {
    const t = new Date(y.requestedAt).getTime();
    if (!Number.isFinite(t)) continue;
    const moc = datLaiMoiNhat.get(y.staffId);
    if (moc !== undefined && moc >= t) continue; // đã đặt lại sau yêu cầu này
    const cu = theoNguoi.get(y.staffId);
    if (!cu) theoNguoi.set(y.staffId, { requestedAt: y.requestedAt, t, lanThu: 1 });
    else {
      cu.lanThu += 1;
      if (t > cu.t) {
        cu.t = t;
        cu.requestedAt = y.requestedAt;
      }
    }
  }

  return [...theoNguoi.entries()]
    .map(([staffId, v]) => ({ staffId, requestedAt: v.requestedAt, lanThu: v.lanThu }))
    .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime());
}
