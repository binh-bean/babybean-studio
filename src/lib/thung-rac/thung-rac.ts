/**
 * BB-409 — Thùng rác bộ ảnh: luật thuần (không gọi mạng, không đọc DB).
 *
 * Chủ studio chốt 10/10/2026: xoá bộ ảnh → vào THÙNG RÁC; trong 10 ngày khôi phục
 * được; quá 10 ngày cron 01:00 dọn hẳn dữ liệu của bộ trên app (giữ thư mục Drive).
 * Bộ đã xoá KHÔNG được đồng bộ Lark sinh lại — xem `laDongBiChan`.
 */
import { createHash } from "node:crypto";

/** Quyền xoá / khôi phục / xoá hẳn bộ ảnh (migration 0109: Admin + Quản lý). */
export const QUYEN_XOA_BO_ANH = "bo_anh:xoa";

/** Số ngày một bộ nằm trong thùng rác trước khi bị dọn hẳn. */
export const SO_NGAY_THUNG_RAC = 10;
/** Mỗi lượt cron dọn tối đa bấy nhiêu bộ — hàm Hobby chỉ có 60 giây. */
export const TOI_DA_DON_MOI_LUOT = 5;

const MOT_NGAY_MS = 24 * 60 * 60 * 1000;

/** Mốc bộ sẽ bị dọn hẳn. */
export function mocDonHan(deletedAt: string | Date): Date {
  return new Date(new Date(deletedAt).getTime() + SO_NGAY_THUNG_RAC * MOT_NGAY_MS);
}

/**
 * Còn mấy ngày trước khi dọn hẳn — làm tròn LÊN (còn 3 giờ vẫn là "còn 1 ngày"),
 * không bao giờ âm. 0 = đã tới hạn, lượt cron kế tiếp sẽ dọn.
 */
export function soNgayConLai(deletedAt: string | Date, bayGio: Date = new Date()): number {
  const conMs = mocDonHan(deletedAt).getTime() - bayGio.getTime();
  if (conMs <= 0) return 0;
  return Math.ceil(conMs / MOT_NGAY_MS);
}

export interface BoTrongThungRac {
  id: string;
  deletedAt: string;
}

/**
 * Chọn bộ đã QUÁ 10 ngày để dọn: cũ nhất trước, tối đa `gioiHan` bộ. Bộ chưa
 * tới hạn, hoặc `deletedAt` hỏng, không bao giờ được chọn.
 */
export function chonBoQuaHan<T extends BoTrongThungRac>(
  ds: readonly T[],
  bayGio: Date = new Date(),
  gioiHan: number = TOI_DA_DON_MOI_LUOT,
): T[] {
  return ds
    .filter((b) => {
      const t = new Date(b.deletedAt).getTime();
      return Number.isFinite(t) && mocDonHan(b.deletedAt).getTime() <= bayGio.getTime();
    })
    .sort((a, b) => new Date(a.deletedAt).getTime() - new Date(b.deletedAt).getTime())
    .slice(0, Math.max(0, gioiHan));
}

/** Mốc cắt cho câu truy vấn: bộ có `deleted_at` <= mốc này là quá hạn. */
export function mocCatQuaHan(bayGio: Date = new Date()): string {
  return new Date(bayGio.getTime() - SO_NGAY_THUNG_RAC * MOT_NGAY_MS).toISOString();
}

/**
 * Băm thư mục Drive để đặt dấu — dấu sống tiếp sau khi dọn, nên KHÔNG lưu id thật
 * (thư mục Drive mở công khai: ai có id là xem được ảnh — AGENTS.md §6).
 */
export function bamThuMucDrive(driveFolderId: string | null | undefined): string | null {
  const s = (driveFolderId ?? "").trim();
  if (!s) return null;
  return createHash("sha256").update(s).digest("hex");
}

/** Mã ngắn hiện cho người dùng và ghi nhật ký (không có thông tin cá nhân). */
export function maBo(galleryId: string): string {
  return galleryId.slice(0, 8);
}

export interface DauDaXoa {
  lark_hauky_record_id: string | null;
  drive_folder_hash: string | null;
  bo_dau_luc: string | null;
}

/**
 * Dòng Hậu Kỳ bên Lark có bị chặn vì trùng dấu một bộ đã xoá không. Dấu đã được
 * Admin "Cho Lark tạo lại" (`bo_dau_luc`) thì không chặn nữa.
 */
export function laDongBiChan(
  dau: readonly DauDaXoa[],
  dong: { recordId?: string | null; driveFolderId?: string | null },
): boolean {
  const bam = bamThuMucDrive(dong.driveFolderId);
  return dau.some(
    (d) =>
      !d.bo_dau_luc &&
      ((!!dong.recordId && d.lark_hauky_record_id === dong.recordId) ||
        (!!bam && d.drive_folder_hash === bam)),
  );
}

/** Người gõ lại mã để "Xoá hẳn ngay" — so không phân biệt hoa thường, bỏ khoảng trắng. */
export function xacNhanDungMa(galleryId: string, goLai: unknown): boolean {
  return typeof goLai === "string" && goLai.trim().toLowerCase() === maBo(galleryId).toLowerCase();
}
