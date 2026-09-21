/**
 * /admin/reports/link-sap-het-han — link gửi khách sắp hết hạn.
 *
 * OWNER: DEV-FE. Task BB-186.
 *
 * Màn hình chỉ chặn cho gọn; route API kiểm lại quyền một lần nữa và tự lọc chi
 * nhánh theo vai — màn hình không phải ranh giới an ninh.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { LinkSapHetHanReport } from "@/components/features/admin/link-sap-het-han-report";

export const dynamic = "force-dynamic";

export default async function LinkSapHetHanPage() {
  try {
    await requireStaff();
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Freports%2Flink-sap-het-han");
    throw err;
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <LinkSapHetHanReport />
    </main>
  );
}
