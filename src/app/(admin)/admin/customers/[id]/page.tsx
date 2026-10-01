/**
 * /admin/customers/[id] — trang chi tiết khách (BB-337 mục 3), mở đường cho CRM.
 *
 * OWNER: DEV-FE. Màn hình không phải ranh giới an ninh: route
 * `/api/admin/customers/[id]/lich-su` tự kiểm `customers:read` + chi nhánh.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { KhongCoQuyen } from "@/components/features/admin/page-header";
import { TrangKhachHang } from "@/components/features/admin/trang-khach-hang";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  let permissions: string[];
  try {
    ({ permissions } = await requireStaff());
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Fcustomers");
    throw err;
  }
  if (!permissions.includes("customers:read")) {
    return <KhongCoQuyen mota="Vai trò của bạn chưa được cấp quyền xem khách hàng." />;
  }
  const { id } = await params;
  return (
    <main className="mx-auto max-w-6xl">
      <TrangKhachHang key={id} customerId={id} />
    </main>
  );
}
