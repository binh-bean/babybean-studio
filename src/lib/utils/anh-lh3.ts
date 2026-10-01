/**
 * BB-341 — đường ảnh THẲNG sang lh3, bỏ vòng 302 qua hàm Vercel.
 *
 * Trước đây MỖI ô ảnh lưới đi: trình duyệt → `/api/img/<id>?w=400` (một lần
 * chạy hàm Vercel: tra ảnh, xét phiên, tra link) → 302 → lh3. Một khách cuộn
 * hết bộ 425 ảnh là ~425 lần chạy hàm chỉ để trả về một dòng `Location`; mở
 * xem lớn (w=1600/2048) còn tệ hơn: hàm tải NGUYÊN tấm ảnh từ lh3 rồi chuyển
 * tiếp từng byte qua Vercel.
 *
 * Nay `/api/g/photos` (đã đòi phiên khách — chỉ người cầm đúng mã mới lấy được
 * danh sách) trả kèm `maTepDrive` của từng ảnh, và màn khách dựng thẳng URL
 * lh3 với CÙNG tham số `=w<cỡ>` mà route vẫn điều hướng tới → cùng một tấm
 * ảnh, cùng độ phân giải, cùng chất lượng, chỉ bớt một chặng.
 *
 * Vì sao an toàn: mã tệp Drive VỐN ĐÃ lộ cho đúng người này qua dòng
 * `Location` của 302 (BB-314), và thư mục Drive đã để "ai có link cũng xem".
 * Quyền xem DANH SÁCH vẫn do `/api/g/photos` xét như cũ.
 *
 * Lh3 lỗi trên trình duyệt (chặn mạng lạ, quá tải tạm thời) → `urlAnhDuPhong`
 * quay về route cũ với `?qua=1` (route kéo hộ qua Vercel) — đúng một lần.
 *
 * KHÔNG dùng cho tải ảnh gốc (`?tai=1`, =s0) và ảnh bìa (cần bộ đệm Storage):
 * hai đường đó vẫn đi qua `/api/img`.
 */

/** Ảnh có thể mang thêm mã tệp Drive (trường phụ của `/api/g/photos`, BB-341). */
export interface CoMaTepDrive {
  id: string;
  maTepDrive?: string | null;
}

/** Mã tệp Drive hợp lệ: chữ, số, `-`, `_`. Lạ thì coi như không có — không ghép vào URL. */
const MA_HOP_LE = /^[A-Za-z0-9_-]{10,200}$/;

export function maTepHopLe(ma: string | null | undefined): ma is string {
  return typeof ma === "string" && MA_HOP_LE.test(ma);
}

/** URL ảnh cỡ `w`: thẳng lh3 khi có mã tệp hợp lệ, không thì qua `/api/img` như cũ. */
export function urlAnh(anh: CoMaTepDrive, w: number): string {
  return maTepHopLe(anh.maTepDrive)
    ? `https://lh3.googleusercontent.com/d/${anh.maTepDrive}=w${w}`
    : `/api/img/${anh.id}?w=${w}`;
}

/** Đường lùi khi lh3 lỗi: route cũ, ép đi qua proxy (`qua=1`). */
export function urlAnhDuPhong(photoId: string, w: number): string {
  return `/api/img/${photoId}?w=${w}&qua=1`;
}
