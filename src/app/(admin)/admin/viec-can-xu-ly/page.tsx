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
    // BB-290 (#31): KHÔNG thêm `p-6` riêng ở đây — khung cuộn của layout đã có
    // `p-4 sm:p-6 lg:p-8` (admin-layout-shell.tsx). Lồng thêm một lớp đệm nữa
    // là đúng lý do H1 của trang này lệch 24px so với các trang khác (đo được
    // bằng e2e bb-290: x=304 ở đây, x=280 ở /admin).
    <main className="mx-auto max-w-6xl">
      <ViecCanXuLy role={role} />
    </main>
  );
}
