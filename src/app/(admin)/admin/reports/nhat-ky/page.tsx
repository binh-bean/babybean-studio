import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { NhatKyReport } from "@/components/features/admin/nhat-ky-report";
import { PageHeader } from "@/components/features/admin/page-header";
import { vi } from "@/i18n/vi";

export const dynamic = "force-dynamic";

export default async function NhatKyPage() {
  try {
    await requireStaff();
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Freports%2Fnhat-ky");
    throw err;
  }

  return (
    // BB-290 (#31): bỏ `p-6` riêng — cùng lỗi đã sửa ở các trang khác (khung
    // cuộn của layout đã tự đệm).
    <main className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={vi.admin.nhatKy.title} description={vi.admin.nhatKy.subtitle} />
      <NhatKyReport />
    </main>
  );
}
