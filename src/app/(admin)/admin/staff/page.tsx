/**
 * /admin/staff — quản lý nhân sự.
 *
 * OWNER: DEV-FE. Task BB-063.
 *
 * Middleware đã chặn khách chưa đăng nhập. Trang này chặn thêm theo vai trò:
 * docs/05-rbac.md §2 chỉ cho owner và admin đụng vào nhân sự. Kiểm ở đây để
 * người không có quyền không nhìn thấy màn hình, và kiểm lại lần nữa trong
 * từng route API vì màn hình không phải ranh giới an ninh.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { NhanSuVaiTro } from "@/components/features/admin/nhan-su-vai-tro";
import { KhongCoQuyen } from "@/components/features/admin/page-header";
import { vi } from "@/i18n/vi";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  let role: string;
  try {
    ({ role } = await requireStaff());
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Fstaff");
    throw err;
  }

  if (role !== "owner" && role !== "admin") {
    // BB-318 (Q-e): gọi đúng tên vai như màn Nhân sự hiện (`vi.admin.staff.roles`), không tự gõ lại.
    const { owner, admin } = vi.admin.staff.roles;
    return <KhongCoQuyen mota={`Chỉ vai ${owner} và ${admin} mới xem được mục nhân sự.`} />;
  }

  return (
    // Không thêm padding ở đây: khung cuộn của layout đã có `p-4 sm:p-6
    // lg:p-8` (admin-layout-shell.tsx) — cùng quy ước với Khách hàng, Bộ ảnh.
    <main className="mx-auto min-w-0 max-w-6xl">
      <NhanSuVaiTro />
    </main>
  );
}
