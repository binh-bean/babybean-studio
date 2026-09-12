/**
 * /admin/reports/over-quota — ảnh đã giao vượt hạn mức chưa thu tiền.
 *
 * OWNER: DEV-FE. Task BB-120.
 *
 * Màn hình chỉ chặn cho gọn; route API kiểm lại quyền một lần nữa và tự lọc
 * chi nhánh theo vai — màn hình không phải ranh giới an ninh.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { OverQuotaReport } from "@/components/features/admin/over-quota-report";

export const dynamic = "force-dynamic";

export default async function OverQuotaReportPage() {
  try {
    await requireStaff();
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Freports%2Fover-quota");
    throw err;
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <OverQuotaReport />
    </main>
  );
}
