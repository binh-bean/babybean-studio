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

// ---------------------------------------------------------------------------
// BB-303 — lời chào đầu trang (bản vẽ BB-301: "Chào buổi sáng, Admin")
// ---------------------------------------------------------------------------

/** "Chào buổi sáng"/"Chào buổi chiều"/"Chào buổi tối" theo giờ hiện tại (0-23). */
export function chaoTheoBuoi(gio: number): string {
  if (gio < 11) return "Chào buổi sáng";
  if (gio < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

const THU_TRONG_TUAN = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
] as const;

/** "Thứ Hai, 28/09/2026" theo NGÀY LỊCH của `d` (giờ máy chạy — màn quản trị chỉ dùng trên máy tính/điện thoại của nhân viên tại studio, không cần quy đổi múi giờ VN riêng như báo cáo). */
export function ngayDayDuVN(d: Date): string {
  const thu = THU_TRONG_TUAN[d.getDay()];
  const ngay = String(d.getDate()).padStart(2, "0");
  const thang = String(d.getMonth() + 1).padStart(2, "0");
  const nam = d.getFullYear();
  return `${thu}, ${ngay}/${thang}/${nam}`;
}

// ---------------------------------------------------------------------------
// BB-303 — "Việc hôm nay" (bản vẽ BB-301, bang-dieu-khien.html)
// ---------------------------------------------------------------------------
/**
 * Ba nhóm của khối "Việc hôm nay": Đã trễ hạn / Hôm nay / Ngày mai. Việc ĐÃ
 * CHỐT (status "submitted") luôn cần xử lý NGAY — không có `due_at` thật để so
 * (khách không có hạn "phải chốt trước giờ nào", họ đã chốt rồi) — xếp thẳng
 * vào "Hôm nay" theo đúng ví dụ bản vẽ ("Khách đã chốt 15 tấm").
 *
 * Việc có `due_at` xa hơn ngày mai (ví dụ hạn tuần sau) KHÔNG thuộc khối này —
 * bản vẽ chỉ có ba nhóm, không phải "mọi việc còn hạn".
 */
export type NhomViecHomNay = "qua_han" | "hom_nay" | "ngay_mai";

export interface ViecHomNayThoLuoc {
  dueAt: string | null;
  status: string;
  /**
   * BB-312 — việc không có hạn giao thật (không phải "hạn khách chọn ảnh")
   * nhưng vẫn cần STUDIO xử lý NGAY hôm nay, vd khách xin mở lại bộ ảnh. Đứng
   * ngoài enum `status` nên không dùng nhánh `submitted` sẵn có (nhánh đó gắn
   * chặt với nghĩa "khách đã chốt", đúng cả ở `nhomThaoTacViec` phía
   * `dashboard.tsx` — ép trạng thái thành `submitted` giả sẽ làm sai nút "Làm
   * nhanh"). Cờ riêng, mặc định false/undefined không đổi hành vi cũ.
   */
  forceHomNay?: boolean;
}

export function nhomViecHomNay(v: ViecHomNayThoLuoc, now: Date = new Date()): NhomViecHomNay | null {
  if (v.status === "submitted" || v.forceHomNay) return "hom_nay";
  if (!v.dueAt) return null;
  const due = new Date(v.dueAt);
  if (Number.isNaN(due.getTime())) return null;
  if (due.getTime() < now.getTime()) return "qua_han";

  const dauHomNay = new Date(now);
  dauHomNay.setHours(0, 0, 0, 0);
  const dauNgayMai = new Date(dauHomNay);
  dauNgayMai.setDate(dauNgayMai.getDate() + 1);
  const dauNgayKia = new Date(dauHomNay);
  dauNgayKia.setDate(dauNgayKia.getDate() + 2);

  if (due.getTime() < dauNgayMai.getTime()) return "hom_nay";
  if (due.getTime() < dauNgayKia.getTime()) return "ngay_mai";
  return null;
}

/**
 * Xếp một danh sách việc vào ba nhóm, mỗi nhóm SẮP THEO HẠN (bản vẽ: "trễ hạn
 * tăng dần theo giờ trễ lớn nhất trước, rồi theo giờ hạn"). Việc không có
 * `dueAt` thật (status "submitted") đứng ĐẦU nhóm "Hôm nay" — cần xử lý ngay,
 * không có giờ để so.
 */
export function xepViecHomNay<T extends ViecHomNayThoLuoc>(
  items: T[],
  now: Date = new Date(),
): { quaHan: T[]; homNay: T[]; ngayMai: T[] } {
  const ket = { quaHan: [] as T[], homNay: [] as T[], ngayMai: [] as T[] };
  for (const item of items) {
    const nhom = nhomViecHomNay(item, now);
    if (nhom === "qua_han") ket.quaHan.push(item);
    else if (nhom === "hom_nay") ket.homNay.push(item);
    else if (nhom === "ngay_mai") ket.ngayMai.push(item);
  }
  const gioCua = (v: T): number => (v.dueAt ? new Date(v.dueAt).getTime() : -Infinity);
  const tangDan = (a: T, b: T) => gioCua(a) - gioCua(b);
  ket.quaHan.sort(tangDan);
  ket.homNay.sort(tangDan);
  ket.ngayMai.sort(tangDan);
  return ket;
}
