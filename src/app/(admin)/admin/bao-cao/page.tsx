/**
 * /admin/bao-cao — trung tâm báo cáo điều hành (khung BB-260).
 *
 * OWNER: DEV-FE (khung do DEV-BE dựng theo brief BB-260). Task BB-260.
 *
 * Màn hình chỉ chặn cho gọn; route API kiểm lại quyền một lần nữa và tự lọc
 * chi nhánh theo vai — màn hình không phải ranh giới an ninh.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { BaoCaoExplorer } from "@/components/features/admin/bao-cao/bao-cao-explorer";

export const dynamic = "force-dynamic";

export default async function BaoCaoPage() {
  try {
    await requireStaff();
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Fbao-cao");
    throw err;
  }

  return (
    // BB-290 (#31): bỏ `p-6` riêng (khung cuộn của layout đã tự đệm), và
    // dùng `max-w-6xl` — bề rộng tối đa DÙNG CHUNG cho mọi trang quản trị.
    <main className="mx-auto max-w-6xl">
      <BaoCaoExplorer />
    </main>
  );
}
