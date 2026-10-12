/**
 * /admin/thung-rac — BB-409: thùng rác bộ ảnh.
 *
 * OWNER: DEV-FE. Ai có `bo_anh:xoa` (Admin + Quản lý) mới vào. Route API kiểm
 * lại quyền và chi nhánh — màn hình không phải ranh giới an ninh.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { QUYEN_XOA_BO_ANH } from "@/lib/thung-rac/thung-rac";
import { ThungRac } from "@/components/features/admin/thung-rac";
import { KhongCoQuyen } from "@/components/features/admin/page-header";

export const dynamic = "force-dynamic";

export default async function ThungRacPage() {
  let permissions: string[];
  try {
    ({ permissions } = await requireStaff());
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Fthung-rac");
    throw err;
  }

  if (!permissions.includes(QUYEN_XOA_BO_ANH)) {
    return <KhongCoQuyen mota="Chỉ Admin và Quản lý mới xem được thùng rác." />;
  }

  return (
    <main className="mx-auto min-w-0 max-w-6xl">
      <ThungRac />
    </main>
  );
}
