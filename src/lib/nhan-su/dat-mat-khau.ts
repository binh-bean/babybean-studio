/**
 * Admin tự gõ mật khẩu mới cho nhân viên — BB-373 (anh chốt 06/10/2026).
 *
 * Trước đây nút "Đặt lại mật khẩu" mở hộp `prompt()` của trình duyệt (ẩn
 * không được, không thấy mình gõ gì) và đi qua PATCH chung của nhân sự. Nay có
 * một đường riêng: `POST /api/admin/staff/:id/mat-khau`, chỉ vai Admin
 * (`owner`/`admin`), mật khẩu tối thiểu 8 ký tự, không bắt nhân viên đổi lại.
 *
 * Mật khẩu KHÔNG BAO GIỜ vào log hay nhật ký — nhật ký chỉ ghi "ai đặt lại cho
 * ai, lúc nào" (`metadata.passwordReset = true`, cùng dạng BB-327 đã đọc để
 * dòng "Quên mật khẩu" tự rời danh sách).
 */

import type { StaffRole } from "@/types/domain";

/** Anh chốt 06/10: tối thiểu 8 ký tự (ngắn hơn 10 của lúc tạo tài khoản). */
export const MIN_MAT_KHAU_DAT_LAI = 8;
export const MAX_MAT_KHAU_DAT_LAI = 200;

/** Trả câu lỗi cho Admin đọc, hoặc `null` nếu mật khẩu dùng được. */
export function vanDeMatKhauMoi(matKhau: unknown): string | null {
  if (typeof matKhau !== "string") return "Chưa có mật khẩu mới";
  if (matKhau.length < MIN_MAT_KHAU_DAT_LAI) {
    return `Mật khẩu phải từ ${MIN_MAT_KHAU_DAT_LAI} ký tự trở lên`;
  }
  if (matKhau.length > MAX_MAT_KHAU_DAT_LAI) return "Mật khẩu quá dài";
  if (/^\d+$/.test(matKhau)) return "Mật khẩu không được chỉ gồm chữ số";
  return null;
}

/** Chỉ hai vai Admin đặt được mật khẩu cho người khác. */
export function laVaiAdmin(role: StaffRole): boolean {
  return role === "owner" || role === "admin";
}
