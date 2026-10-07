/**
 * /admin/goi-chup — quản lý gói chụp và giá ảnh chọn thêm.
 *
 * OWNER: DEV-FE. Task BB-385 (BB-062 nâng P0).
 *
 * Ai có `packages:read` (CSKH trở lên) xem được; chỉ Admin (`settings:system`)
 * sửa giá. Route API kiểm lại cả hai — màn hình không phải ranh giới an ninh.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { GoiChupManager } from "@/components/features/admin/goi-chup-manager";

export const dynamic = "force-dynamic";

export default async function GoiChupPage() {
  try {
    const staff = await requireStaff();
    if (!staff.permissions.includes("packages:read")) redirect("/admin");
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Fgoi-chup");
    throw err;
  }

  return (
    <main className="mx-auto max-w-6xl">
      <GoiChupManager />
    </main>
  );
}
