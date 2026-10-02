/**
 * BB-342 — tên sự kiện "cập nhật tức thì" dùng chung cho máy chủ (phát) và
 * trình duyệt (nghe). KHÔNG `server-only`: cả hai phía cùng đọc.
 *
 * Payload của một sự kiện chỉ có LOẠI + id bộ ảnh — không tên khách, không
 * số điện thoại, không tên bé, không số tiền. Trình duyệt nhận xong thì tự
 * gọi lại API (API mới là nơi kiểm quyền), nên lộ một sự kiện cũng chỉ lộ
 * "bộ ảnh X vừa có thay đổi loại Y".
 */

/** Tên sự kiện broadcast trên kênh Supabase Realtime. */
export const TEN_SU_KIEN_TUC_THI = "cap_nhat";

/** Loại thay đổi — chỉ để hiện câu báo cho đúng; mọi loại đều dẫn tới tải lại. */
export const LOAI_TUC_THI = {
  // Khách → studio
  khachChotDanhSach: "khach.chot_danh_sach",
  khachChotDot: "khach.chot_dot",
  khachXinMoLai: "khach.xin_mo_lai",
  khachMuaThem: "khach.mua_them",
  khachDuyetAnh: "khach.duyet_anh",
  // Studio → khách
  studioXacNhan: "studio.xac_nhan",
  studioThanhToan: "studio.thanh_toan",
  studioMuaThem: "studio.mua_them",
  studioMoLink: "studio.mo_link",
  /** Mọi tin vào chuông của khách (xác nhận/từ chối đợt, mở lại, nhắc, đã giao…). */
  studioThongBao: "studio.thong_bao",
  /**
   * BB-347 — cột "Trạng Thái" bảng Hậu Kỳ bên Lark vừa đổi (hook Lark đẩy sang).
   * Phát cho MỌI lần đổi thật, không chỉ ba mốc có chuông. Payload chỉ có loại
   * (+ id bộ ảnh ở kênh nhân viên) — không mã trạng thái, không dữ liệu cá nhân.
   */
  larkTrangThai: "lark.trang_thai",
  /** BB-359 — bộ đã thu gọn vừa Đồng bộ lại xong: màn khách nạp lại danh sách ảnh. */
  studioMoLaiAnh: "studio.mo_lai_anh",
} as const;

/** Loại hợp lệ: chữ thường, số, `_`, `.` — không bao giờ là văn bản tự do. */
const LOAI_HOP_LE = /^[a-z0-9_.]{1,48}$/;

export function laLoaiHopLe(loai: unknown): loai is string {
  return typeof loai === "string" && LOAI_HOP_LE.test(loai);
}

/** Thứ trình duyệt nhận được. `galleryId` chỉ có trên kênh nhân viên. */
export interface SuKienTucThi {
  loai: string;
  galleryId?: string;
}

/** Câu báo ngắn cho nhân viên (toast). Không có dữ liệu cá nhân — chỉ loại việc. */
export function cauBaoNhanVien(loai: string): string | null {
  switch (loai) {
    case LOAI_TUC_THI.khachChotDanhSach:
      return "Khách vừa gửi danh sách ảnh";
    case LOAI_TUC_THI.khachChotDot:
      return "Khách vừa chốt một đợt chọn thêm";
    case LOAI_TUC_THI.khachXinMoLai:
      return "Khách vừa xin mở lại bộ ảnh";
    case LOAI_TUC_THI.khachMuaThem:
      return "Khách vừa gửi yêu cầu mua thêm";
    case LOAI_TUC_THI.khachDuyetAnh:
      return "Khách vừa phản hồi ảnh đã chỉnh";
    default:
      return null; // việc của chính nhân viên — không bật toast, chỉ tải lại
  }
}
