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
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Quản trị | BabyBean Studio",
  description: "Trang quản trị hệ thống BabyBean Studio",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let role: string | undefined;
  let hoTen: string | null = null;
  try {
    const staff = await requireStaff();
    role = staff.role;

    // BB-185: lấy tên để góc phải nói được AI đang đăng nhập. Máy quầy là máy
    // chung, và người ngồi vào không biết mình đang là ai là cả nhật ký sai tên.
    //
    // Hỏi riêng chứ không thêm vào `requireStaff()`: hàm đó chạy ở **mọi** đường
    // API, thêm một cột vào đó là thêm chi phí cho hàng trăm lượt gọi không cần tên.
    // Hỏng thì thôi — thiếu tên không được phép chặn cả khu quản trị.
    const supabase = await createServerClient();
    const { data } = await supabase
      .from("staff_profiles")
      .select("full_name")
      .eq("id", staff.staffId)
      .maybeSingle();
    hoTen = (data?.full_name as string | undefined) ?? null;
  } catch (err) {
    // Chưa đăng nhập thì middleware đã chuyển hướng rồi; ở đây chỉ dựng khung
    // không có menu thay vì đổ vỡ.
    if (!(err instanceof AuthError)) throw err;
  }

  return (
    <AdminLayoutShell role={role} hoTen={hoTen}>
      {children}
    </AdminLayoutShell>
  );
}
