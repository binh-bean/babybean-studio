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
import { StaffManager } from "@/components/features/admin/staff-manager";

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
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold text-[var(--bb-fg)]">Không có quyền</h1>
        <p className="mt-2 text-sm text-[var(--bb-fg-muted)]">
          Chỉ chủ studio và quản trị hệ thống mới xem được mục nhân sự.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <StaffManager />
    </main>
  );
}
