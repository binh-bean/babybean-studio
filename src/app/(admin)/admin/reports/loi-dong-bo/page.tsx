/**
 * /admin/reports/loi-dong-bo — bộ ảnh kéo từ Drive về không thành công.
 *
 * OWNER: DEV-FE. Task BB-129.
 *
 * Chặn ở đây chỉ để người không có việc gì thì không thấy màn hình trắng.
 * Ranh giới an ninh thật nằm ở route API: nó kiểm vai một lần nữa và tự lọc
 * chi nhánh, vì màn hình thì ai cũng sửa được bằng công cụ trình duyệt.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { LoiDongBoReport } from "@/components/features/admin/loi-dong-bo-report";

export const dynamic = "force-dynamic";

export default async function LoiDongBoReportPage() {
  try {
    const staff = await requireStaff();
    // CTV thời vụ không vào màn này — đẩy về danh sách bộ ảnh thay vì báo lỗi,
    // họ không làm gì sai, chỉ là đi nhầm cửa.
    if (staff.role === "photoshop_ctv") redirect("/admin/galleries");
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Freports%2Floi-dong-bo");
    throw err;
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <LoiDongBoReport />
    </main>
  );
}
