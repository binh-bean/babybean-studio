/**
 * /admin/customers — tra cứu và quản lý khách hàng.
 *
 * OWNER: DEV-FE. Task BB-061.
 *
 * Màn hình không phải ranh giới an ninh: nút "Sửa" ẩn đi khi không có quyền
 * chỉ để người ta khỏi bấm vào chỗ chắc chắn bị từ chối. Cửa thật nằm trong
 * từng route API, và mỗi route hỏi lại `requirePermission` một lần nữa.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { CustomersManager } from "@/components/features/admin/customers-manager";
import { vi } from "@/i18n/vi";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  let permissions: string[];
  try {
    ({ permissions } = await requireStaff());
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Fcustomers");
    throw err;
  }

  if (!permissions.includes("customers:read")) {
    return (
      <main className="mx-auto max-w-2xl p-4 md:p-6">
        <h1 className="text-xl font-semibold text-[var(--bb-fg)]">Không có quyền</h1>
        <p className="mt-2 text-sm text-[var(--bb-fg-muted)]">
          Vai trò của bạn chưa được cấp quyền xem danh sách khách hàng.
        </p>
      </main>
    );
  }

  return (
    /*
      Không thêm padding ở đây: khung cuộn của layout đã có `p-4 sm:p-6 lg:p-8`.
      Lồng thêm một lớp nữa là mất 32px bề ngang trên màn 375px.

      Tiêu đề to chỉ hiện từ `lg`. Dưới đó, tên màn đã nằm ngay cạnh chữ
      BabyBean ở thanh trên cùng (admin-header.tsx) — in lại lần nữa là đẩy
      danh sách xuống thêm gần 100px trên một màn cao 812px. Cùng luật với màn
      Quản lý bộ ảnh, theo yêu cầu của chủ studio 22/09/2026.
    */
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <h1 className="hidden text-2xl font-display font-bold tracking-tight lg:block">
        {vi.admin.khachHang.title}
      </h1>
      <CustomersManager
        coQuyenSua={permissions.includes("customers:write")}
        coQuyenXoa={permissions.includes("customers:delete")}
      />
    </div>
  );
}
