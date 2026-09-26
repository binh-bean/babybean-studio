/**
 * Tiện ích thuần cho Bảng điều khiển quản trị — BB-270.
 *
 * OWNER: DEV-FE (`src/lib/utils/**`).
 *
 * Tách khỏi route API và khỏi component để phép thử canh được đúng phần TÍNH
 * TOÁN (không phụ thuộc Supabase client giả hay React) — xem AGENTS.md §5a.
 *
 * ---------------------------------------------------------------------------
 * Định nghĩa "tiến độ theo chi nhánh"
 * ---------------------------------------------------------------------------
 * - "Đang hoạt động": bộ ảnh chưa giao, chưa quá hạn bị đóng, chưa lưu trữ —
 *   trạng thái `ready` (sẵn sàng gửi), `in_review` (khách đang chọn),
 *   `submitted` (đã chốt, chờ xử lý), `in_retouch` (đang chỉnh sửa). Đây là
 *   "việc đang chạy" của một chi nhánh tại THỜI ĐIỂM XEM, không giới hạn theo
 *   kỳ — giống cách "Chờ khách chọn"/"Chờ retouch" của bảng điều khiển đã tính.
 * - "Đã chốt": trong số "đang hoạt động" ở trên, phần đã QUA khỏi bước khách
 *   chọn ảnh — `submitted` hoặc `in_retouch`. Khách đã xong việc của họ, phần
 *   còn lại là việc của studio.
 * - "Tỉ lệ đã chốt" = đã chốt / đang hoạt động. `null` khi chi nhánh không có
 *   bộ ảnh nào đang hoạt động (không chia cho 0, và 0% sẽ đọc nhầm thành "chi
 *   nhánh làm việc kém" thay vì "chi nhánh không có việc").
 */

export const TRANG_THAI_DANG_HOAT_DONG = ["ready", "in_review", "submitted", "in_retouch"] as const;
export const TRANG_THAI_DA_CHOT = ["submitted", "in_retouch"] as const;

export interface TienDoChiNhanh {
  branchId: string;
  branchName: string;
  dangHoatDong: number;
  daChot: number;
  tyLeChot: number | null;
}

/** Tỉ lệ đã chốt trong số đang hoạt động; `null` nếu không có gì đang hoạt động. */
export function tinhTyLeChot(dangHoatDong: number, daChot: number): number | null {
  if (dangHoatDong <= 0) return null;
  return daChot / dangHoatDong;
}

/**
 * Một thẻ số tăng/giảm là "tốt" hay "xấu" tuỳ Ý NGHĨA của thẻ đó, không tuỳ
 * dấu của con số. Vd "Đã giao" tăng là tốt, "Quá hạn" tăng là xấu.
 *
 * `chieuTangLaTot`: true nếu TĂNG so với kỳ trước là tin tốt cho thẻ này.
 * Trả `null` khi không có kỳ trước để so (không tô màu gì) hoặc khi % chênh
 * lệch đúng bằng 0 (đi ngang — không phải tin tốt cũng không phải tin xấu).
 */
export function bienDongLaTot(
  chenhLechPhanTram: number | null | undefined,
  chieuTangLaTot: boolean,
): boolean | null {
  if (chenhLechPhanTram === null || chenhLechPhanTram === undefined) return null;
  if (chenhLechPhanTram === 0) return null;
  const tang = chenhLechPhanTram > 0;
  return chieuTangLaTot ? tang : !tang;
}
