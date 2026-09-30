/**
 * Nút "Nhắc khách" gửi THẬT tới khách — BB-327.
 *
 * Chủ studio 29/09/2026: bấm "Nhắc khách" mà khách không nhận được gì. Nguyên
 * nhân: nút ở Việc hôm nay và ở danh sách bộ ảnh chỉ CHÉP một câu vào bộ nhớ
 * tạm (clipboard) — không gửi đi đâu cả, chữ trên nút lại hứa "Nhắc khách".
 * Nay nút gọi `POST /api/admin/galleries/[id]/nhac-khach`, route đó gọi
 * `guiThongBaoBoAnh` (chuông trong app + thông báo đẩy), rồi màn hình hiện
 * "Đã gửi nhắc lúc HH:mm" kèm việc tin tới đâu.
 *
 * Tệp thuần (không server-only) để màn hình và route dùng CHUNG một luật.
 */

/** Chỉ nhắc khi bộ ảnh đang chờ KHÁCH chọn — cùng tập với nhắc tự động (nhac-khach.ts). */
export const TRANG_THAI_NHAC_DUOC = ["ready", "in_review"] as const;

export function coTheNhacKhach(status: string): boolean {
  return (TRANG_THAI_NHAC_DUOC as readonly string[]).includes(status);
}

/** Hai lần nhắc cách nhau ít nhất bấy nhiêu giây — chặn bấm đúp gửi hai tin. */
export const GIAN_CACH_NHAC_GIAY = 60;

/**
 * Nội dung tin. KHÔNG có tên bé/tên khách/link: payload đẩy đi qua máy chủ
 * của Google/Apple/Mozilla (xem gui-day.ts).
 */
export function noiDungNhacKhach(): { tieuDe: string; noiDung: string; loai: string } {
  return {
    tieuDe: "Ảnh đang chờ ba mẹ chọn",
    noiDung: "Studio nhắc nhẹ: ba mẹ mở bộ ảnh và chọn giúp em những tấm ưng ý nhé.",
    loai: "nhac_chon_anh",
  };
}

/**
 * BB-331 — nhắc khách THANH TOÁN phần ảnh chọn vượt hạn mức (dòng "Ảnh vượt
 * hạn mức" ở Việc cần xử lý). Khác nhắc chọn ảnh: bộ ảnh đã chốt rồi nên
 * không kiểm trạng thái "đang chờ chọn". Cùng luật riêng tư: không tên, không
 * số tiền, không link trong payload đẩy.
 */
export type LoaiNhacKhach = "chon_anh" | "thanh_toan";

export function noiDungNhacThanhToan(): { tieuDe: string; noiDung: string; loai: string } {
  return {
    tieuDe: "Ảnh chọn thêm của bé",
    noiDung: "Ba mẹ đã chọn thêm ảnh ngoài gói. Studio nhờ ba mẹ mở bộ ảnh xem phần chọn thêm và thanh toán giúp em nhé.",
    loai: "nhac_thanh_toan",
  };
}

/** Nhắc loại nào thì được ở trạng thái nào. `thanh_toan` không phụ thuộc trạng thái chọn. */
export function coTheNhac(loai: LoaiNhacKhach, status: string): boolean {
  return loai === "thanh_toan" ? true : coTheNhacKhach(status);
}

/**
 * Câu báo kết quả cho CSKH ngay sau khi bấm. Nói THẬT tin tới đâu: khách chưa
 * bật thông báo thì tin chỉ nằm trong chuông, lần sau khách mở app mới thấy.
 */
export function cauDaGuiNhac(
  kq: { daVaoChuong: boolean; soMayNhanDay: number },
  gioPhut: string,
): string {
  if (!kq.daVaoChuong && kq.soMayNhanDay === 0) return "Chưa gửi được, thử lại giúp";
  const noi: string[] = [];
  if (kq.daVaoChuong) noi.push("chuông trong app");
  if (kq.soMayNhanDay > 0) noi.push(`thông báo tới ${kq.soMayNhanDay} máy`);
  return `Đã gửi nhắc lúc ${gioPhut} · ${noi.join(" + ")}`;
}
