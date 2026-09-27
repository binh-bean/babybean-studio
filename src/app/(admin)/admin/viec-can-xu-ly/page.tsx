/**
 * /admin/viec-can-xu-ly — "Việc cần xử lý", ba hàng đợi gộp một trang.
 *
 * OWNER: DEV-FE. Task BB-280.
 *
 * Thay cho ba trang cũ /admin/reports/{loi-dong-bo,link-sap-het-han,over-quota}
 * — vẫn còn (đổi hướng ở next.config.ts) để liên kết cũ không vỡ.
 *
 * Màn hình chỉ chặn cho gọn; mỗi route API bên dưới kiểm lại quyền một lần
 * nữa và tự lọc chi nhánh theo vai — màn hình không phải ranh giới an ninh.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { ViecCanXuLy } from "@/components/features/admin/viec-can-xu-ly";

export const dynamic = "force-dynamic";

export default async function ViecCanXuLyPage() {
  let role: string;
  try {
    ({ role } = await requireStaff());
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Fviec-can-xu-ly");
    throw err;
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <ViecCanXuLy role={role} />
    </main>
  );
}
