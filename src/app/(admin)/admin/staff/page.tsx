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
import { QUYEN_XOA_NHAN_SU } from "@/lib/nhan-su/xoa-nhan-su";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  let role: string;
  let permissions: string[];
  try {
    ({ role, permissions } = await requireStaff());
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Fstaff");
    throw err;
  }

  const laAdmin = role === "owner" || role === "admin";
  // BB-409: Quản lý có `nhan_su:xoa` (không có `staff:manage`) được vào để XEM
  // danh sách và xoá nhân sự chi nhánh mình — cùng cửa với GET /api/admin/staff.
  // Không phải Admin và không có `staff:manage` → chỉ xem + xoá (ẩn Thêm/Sửa/Vai trò).
  const chiXoa = !laAdmin && !permissions.includes("staff:manage");

  if (!laAdmin && !permissions.includes(QUYEN_XOA_NHAN_SU)) {
    // BB-320 (Q11, quyết định của giám đốc): đúng một câu, không liệt kê hai tên vai.
    return <KhongCoQuyen mota="Chỉ Admin mới xem được mục này." />;
  }

  return (
    // Không thêm padding ở đây: khung cuộn của layout đã có `p-4 sm:p-6
    // lg:p-8` (admin-layout-shell.tsx) — cùng quy ước với Khách hàng, Bộ ảnh.
    <main className="mx-auto min-w-0 max-w-6xl">
      <NhanSuVaiTro chiXoa={chiXoa} />
    </main>
  );
}
