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
    <main className="mx-auto min-w-0 max-w-6xl p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">{vi.admin.khachHang.title}</h1>
      <CustomersManager
        coQuyenSua={permissions.includes("customers:write")}
        coQuyenXoa={permissions.includes("customers:delete")}
      />
    </main>
  );
}
