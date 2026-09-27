/**
 * /admin/branches — quản lý chi nhánh.
 *
 * OWNER: DEV-FE. Task BB-063.
 *
 * Ai cũng xem được danh sách chi nhánh (docs/05-rbac.md §2), nhưng chỉ owner,
 * admin và branch_manager sửa được — và route API kiểm lại lần nữa, vì màn hình
 * không phải ranh giới an ninh.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { BranchManager } from "@/components/features/admin/branch-manager";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  try {
    await requireStaff();
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Fbranches");
    throw err;
  }

  return (
    // BB-290 (#31): bỏ `p-6` riêng — cùng lý do đã sửa ở /admin/viec-can-xu-ly
    // và /admin/bao-cao (khung cuộn của layout đã tự đệm p-4/p-6/p-8).
    <main className="mx-auto max-w-6xl">
      <BranchManager />
    </main>
  );
}
