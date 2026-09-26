/**
 * Tiện ích "so nhân viên với nhân viên / so nhân viên với tổng / so kỳ trước".
 *
 * OWNER: DEV-BE. Task BB-264.
 *
 * ---------------------------------------------------------------------------
 * Vì sao tách riêng tệp này
 * ---------------------------------------------------------------------------
 * Chủ studio chốt 26/09/2026: báo cáo nhân viên lần này (`hieu-suat-nhan-vien`)
 * chỉ là bản đầu — sau này báo cáo "sales" sẽ cần lại đúng ba phép so sánh này
 * (tỉ trọng % trên tổng, xếp hạng, chênh lệch % so kỳ trước theo từng người).
 * Viết một lần ở đây, báo cáo nào cần "một dòng/nhân viên + dòng Tổng" thì gọi
 * `soSanhNhanVien()`, không viết lại phép tính tỉ trọng/xếp hạng mỗi lần.
 *
 * Hàm ở đây THUẦN — không đụng `ctx.client`, không gọi Supabase. Test bằng dữ
 * liệu truyền tay, không cần DB.
 */

import { chenhLechPhanTram } from "./ky";

/** Một điểm dữ liệu thô: một nhân viên, một chỉ số, một kỳ. */
export interface DiemNhanVien {
  staffId: string;
  ten: string;
  giaTri: number;
}

export interface SoSanhNhanVien extends DiemNhanVien {
  /** % trên tổng CỦA TẤT CẢ nhân viên trong danh sách truyền vào. `null` khi tổng = 0. */
  tiTrongPhanTram: number | null;
  /** Hạng 1 = giá trị cao nhất. Đồng hạng (bằng giá trị) nhận cùng số, hạng kế nhảy đúng số người đứng trước (kiểu "1,1,3"). */
  xepHang: number;
  /** Giá trị cùng chỉ số ở kỳ trước; 0 nếu nhân viên không có dữ liệu kỳ trước. */
  kyTruoc: number;
  /** % chênh lệch so kỳ trước; `null` khi không tính được (kỳ trước = 0 và kỳ này > 0 — xem `chenhLechPhanTram`). */
  chenhLechPhanTram: number | null;
}

/**
 * So từng nhân viên với nhau (xếp hạng, tỉ trọng % trên tổng của CHÍNH danh
 * sách `hienTai` truyền vào) và với kỳ trước (chênh lệch %, đọc từ `kyTruoc`).
 *
 * `kyTruoc`: map staffId -> giá trị kỳ trước. Nhân viên không có trong map
 * (chưa từng phát sinh chỉ số này kỳ trước) được coi là 0, KHÔNG phải bỏ qua —
 * để `chenhLechPhanTram` phản ánh đúng "mới có từ kỳ này".
 *
 * Không lọc, không sắp xếp lại `hienTai` trước khi gọi: hàm này tự sắp xếp
 * giảm dần theo `giaTri` cho kết quả trả về (khớp thứ tự xếp hạng).
 */
export function soSanhNhanVien(
  hienTai: DiemNhanVien[],
  kyTruoc: Map<string, number>,
): SoSanhNhanVien[] {
  const tong = hienTai.reduce((s, d) => s + d.giaTri, 0);
  const daSapXep = [...hienTai].sort((a, b) => b.giaTri - a.giaTri);

  const ketQua: SoSanhNhanVien[] = [];
  let hangHienTai = 0;
  let giaTriHangTruoc: number | null = null;
  for (let i = 0; i < daSapXep.length; i++) {
    const diem = daSapXep[i] as DiemNhanVien;
    // Đồng hạng: chỉ nhảy số hạng khi giá trị đổi, không nhảy theo vị trí i.
    if (giaTriHangTruoc === null || diem.giaTri !== giaTriHangTruoc) {
      hangHienTai = i + 1;
      giaTriHangTruoc = diem.giaTri;
    }
    const giaTriKyTruoc = kyTruoc.get(diem.staffId) ?? 0;
    ketQua.push({
      ...diem,
      tiTrongPhanTram: tong === 0 ? null : (diem.giaTri / tong) * 100,
      xepHang: hangHienTai,
      kyTruoc: giaTriKyTruoc,
      chenhLechPhanTram: chenhLechPhanTram(diem.giaTri, giaTriKyTruoc),
    });
  }
  return ketQua;
}

/** Tổng giá trị của một danh sách điểm nhân viên — dùng dựng dòng "Tổng". */
export function tongGiaTri(diem: { giaTri: number }[]): number {
  return diem.reduce((s, d) => s + d.giaTri, 0);
}
