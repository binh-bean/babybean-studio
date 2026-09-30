/**
 * Admin dashboard.
 *
 * OWNER: DEV-FE. Task BB-060.
 * Spec: docs/07-ui-ux.md §4.1
 *
 * STATUS: scaffold. Data comes from the v_gallery_progress view — see
 * db/schema.sql §16. Do not recompute urgency on the client.
 */

import { Dashboard } from "@/components/features/admin/dashboard";
import { requireStaff, AuthError, layHoTenNhanVien } from "@/lib/auth/staff";

export default async function AdminDashboardPage() {
  // BB-303 (bản vẽ BB-301: "Chào buổi sáng, Admin") — Dashboard tự vẽ lời
  // chào đầu trang thay cho <PageHeader title="Bảng điều khiển"> tĩnh cũ, nên
  // cần tên nhân viên đang đăng nhập ở đây. Lặp lại đúng cách
  // `(admin)/layout.tsx` đã lấy tên (hỏng thì thôi, ẩn tên trong lời chào,
  // không chặn cả trang) — hai nơi hỏi cùng một câu hỏi nhỏ, chấp nhận được vì
  // đây là trang duy nhất cần tên NGAY TRONG nội dung (không chỉ ở góc phải).
  let hoTen: string | null = null;
  try {
    const staff = await requireStaff();
    // BB-333: cả hai hàm đều có `cache()` — layout vừa hỏi xong thì ở đây
    // dùng lại, không lặp getUser → hồ sơ → chi nhánh → tên thêm lần nữa.
    hoTen = await layHoTenNhanVien(staff.staffId);
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
  }

  // BB-290 (#31): bề rộng tối đa DÙNG CHUNG cho mọi trang quản trị —
  // max-w-6xl, xem ghi chú ở /admin/settings/page.tsx.
  return (
    <main className="mx-auto min-w-0 max-w-6xl space-y-4 lg:space-y-6">
      <Dashboard hoTen={hoTen} />
    </main>
  );
}
