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
    <main className="mx-auto max-w-6xl p-6">
      <BranchManager />
    </main>
  );
}
