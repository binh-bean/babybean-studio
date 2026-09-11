/**
 * Khung chung cho khu quản trị.
 *
 * OWNER: DEV-FE. Task BB-021.
 *
 * Lấy vai trò ở đây, một lần cho cả khu, rồi truyền xuống thanh điều hướng để
 * ẩn mục Nhân sự với người không có quyền — docs/05-rbac.md §2. Ẩn khỏi menu
 * chỉ là cho gọn mắt; chặn thật nằm ở từng trang và từng route API.
 */

import type { Metadata } from "next";
import { AdminLayoutShell } from "@/components/features/admin/admin-layout-shell";
import { requireStaff, AuthError } from "@/lib/auth/staff";

export const metadata: Metadata = {
  title: "Quản trị | BabyBean Studio",
  description: "Trang quản trị hệ thống BabyBean Studio",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let role: string | undefined;
  try {
    ({ role } = await requireStaff());
  } catch (err) {
    // Chưa đăng nhập thì middleware đã chuyển hướng rồi; ở đây chỉ dựng khung
    // không có menu thay vì đổ vỡ.
    if (!(err instanceof AuthError)) throw err;
  }

  return <AdminLayoutShell role={role}>{children}</AdminLayoutShell>;
}
