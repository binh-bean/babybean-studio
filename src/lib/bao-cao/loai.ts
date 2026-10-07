/**
 * Khung báo cáo điều hành — kiểu dùng chung cho MỌI báo cáo, hiện tại và
 * tương lai (tài chính, thu chi, công nợ, sales so nhân viên/kỳ...).
 *
 * OWNER: DEV-BE (khung). Task BB-260.
 *
 * ---------------------------------------------------------------------------
 * Vì sao tách riêng tệp này
 * ---------------------------------------------------------------------------
 * Chủ studio chốt 26/09/2026: thứ quan trọng nhất của việc này là CÁI KHUNG
 * để cắm báo cáo mới vào dễ dàng, không phải hai báo cáo đầu. Một báo cáo mới
 * chỉ cần viết một tệp `cac-bao-cao/<ma>.ts` khai một `DinhNghiaBaoCao` và
 * đăng ký một dòng ở `dang-ky.ts` — mọi thứ khác (API, trang, lọc kỳ/chi
 * nhánh, xuất CSV) đã có sẵn, miễn hàm `chay()` trả đúng `KetQuaBaoCao`.
 *
 * Xem `README.md` cùng thư mục để biết cách thêm một báo cáo mới.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Đơn vị gom nhóm cho biểu đồ/bảng theo thời gian. */
export type DonViGomNhom = "ngay" | "tuan" | "thang";

/** Một khoảng thời gian nửa mở: [tu, den). */
export interface KhoangThoiGian {
  tu: Date;
  den: Date;
}

/**
 * Ngữ cảnh truyền vào mọi báo cáo.
 *
 * `chiNhanhIds`: `null` = không lọc theo chi nhánh (nhân viên có
 * `system:superuser` và không chọn một chi nhánh cụ thể trên bộ lọc). Mảng
 * rỗng = không có chi nhánh nào — báo cáo phải trả kết quả rỗng, không phải
 * "mọi chi nhánh". Route API là nơi quyết định giá trị này theo
 * `staff.branchIds`, không phải bản thân báo cáo.
 */
export interface NguCanhBaoCao {
  client: SupabaseClient;
  chiNhanhIds: string[] | null;
  tu: Date;
  den: Date;
  kyTruoc?: KhoangThoiGian;
  nhom: DonViGomNhom;
  /**
   * BB-380 — bộ quyền của nhân viên đang xem (route truyền `staff.permissions`).
   * Báo cáo vận hành có con số tiền dùng nó để ẩn tiền với người không có
   * `reports:financial`. Bỏ trống (gọi nội bộ/phép thử) = không ẩn.
   */
  quyen?: readonly string[];
}

export interface TheSoBaoCao {
  nhan: string;
  giaTri: number | string;
  donVi?: string;
  /** Giá trị cùng chỉ số ở kỳ trước, nếu báo cáo có so sánh. */
  kyTruoc?: number | string;
  /** % chênh lệch so kỳ trước; `null` khi không tính được (vd kỳ trước = 0). */
  chenhLechPhanTram?: number | null;
  /** BB-380 — tăng là tốt (doanh thu, tỉ lệ chốt) hay xấu (thời gian chờ). Mặc định: tốt. */
  tangLaTot?: boolean;
  /** BB-380 — mã báo cáo chi tiết để bấm vào (vd dải 6 con số ở Bàn làm việc). */
  maChiTiet?: string;
  /** BB-380 — một câu giải thích cách đo, hiện khi rê chuột. */
  giaiThich?: string;
}

export interface BangBaoCao {
  cot: string[];
  dong: (string | number | null)[][];
}

export interface BieuDoBaoCao {
  loai: "cot" | "duong";
  nhan: string[];
  chuoi: { ten: string; giaTri: number[] }[];
}

export interface KetQuaBaoCao {
  theSo: TheSoBaoCao[];
  bang?: BangBaoCao;
  bieuDo?: BieuDoBaoCao;
  /** Ghi chú hiển thị dưới báo cáo — vd loại trừ Fixture/archived, con số là sàn... */
  ghiChu?: string[];
  /** BB-380 — bảng phụ (vd theo đợt, theo loại sản phẩm). CSV vẫn chỉ xuất `bang` chính. */
  bangPhu?: { tieuDe: string; bang: BangBaoCao }[];
  /** BB-380 — báo cáo liên quan để bấm sang (không làm trùng số của báo cáo khác). */
  lienKet?: { ma: string; nhan: string }[];
}

export interface BoLocBaoCao {
  /** Có cho phép bật "so với kỳ trước" không. */
  kySoSanh?: boolean;
  /** Có cột/bộ lọc theo nhân viên không (dành cho báo cáo sau này). */
  theoNhanVien?: boolean;
}

export interface DinhNghiaBaoCao {
  ma: string;
  ten: string;
  moTa: string;
  nhom: "van-hanh" | "doanh-thu" | "nhan-vien" | "tai-chinh" | "khac";
  quyen: "reports:operations" | "reports:financial";
  boLoc: BoLocBaoCao;
  chay(ctx: NguCanhBaoCao): Promise<KetQuaBaoCao>;
}
