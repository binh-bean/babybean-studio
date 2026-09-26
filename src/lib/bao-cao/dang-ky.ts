/**
 * Sổ đăng ký báo cáo — nơi DUY NHẤT liệt kê mọi báo cáo đang có.
 *
 * OWNER: DEV-BE (khung). Task BB-260.
 *
 * Thêm báo cáo mới: viết `cac-bao-cao/<ma>.ts` rồi thêm MỘT dòng vào mảng bên
 * dưới. Xem `README.md` cùng thư mục.
 */

import type { DinhNghiaBaoCao } from "./loai";
import { tienDoChonAnh } from "./cac-bao-cao/tien-do-chon-anh";
import { hauKyCanhBao } from "./cac-bao-cao/hau-ky-canh-bao";
import { doanhThuPhatSinh } from "./cac-bao-cao/doanh-thu-phat-sinh";
import { hieuSuatNhanVien } from "./cac-bao-cao/hieu-suat-nhan-vien";

export const DANH_SACH_BAO_CAO: DinhNghiaBaoCao[] = [
  tienDoChonAnh,
  hauKyCanhBao,
  doanhThuPhatSinh,
  hieuSuatNhanVien,
];

export function layBaoCao(ma: string): DinhNghiaBaoCao | undefined {
  return DANH_SACH_BAO_CAO.find((b) => b.ma === ma);
}

/** Báo cáo mà một nhân viên với bộ quyền `permissions` này được xem. */
export function baoCaoTheoQuyen(permissions: string[]): DinhNghiaBaoCao[] {
  return DANH_SACH_BAO_CAO.filter((b) => permissions.includes(b.quyen));
}
