/**
 * Màn Cài đặt — BB-197.
 *
 * OWNER: DEV-FE.
 *
 * BB-308 (vòng 4, mục #6 báo cáo chấm 28/09/2026) — trang này trước đây
 * KHÔNG kiểm quyền ở tầng trang: mọi nhân viên đăng nhập đều thấy đủ form
 * cùng thanh "Huỷ"/"Lưu thay đổi" bấm được, kể cả người không có quyền
 * `settings:system` — `GET /api/admin/settings` trả 403, `SettingsManager`
 * chỉ hiện dòng lỗi ĐÈ LÊN form, còn thanh lưu dính đáy vẫn nguyên vẹn bên
 * dưới. Thêm kiểm quyền SERVER-SIDE ở đây, cùng khuôn `staff/page.tsx` và
 * `customers/page.tsx`: không đủ quyền thì chỉ trả `KhongCoQuyen`, không bao
 * giờ dựng `SettingsManager`. Route API vẫn là ranh giới an ninh thật — đây
 * chỉ là không BÀY RA thứ chắc chắn bị chặn.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { SettingsManager } from "@/components/features/admin/settings-manager";
import { DanhMucKichThuoc } from "@/components/features/admin/danh-muc-kich-thuoc";
import { DongBoGiaSanPham } from "@/components/features/admin/dong-bo-gia-san-pham";
import { PageHeader, KhongCoQuyen } from "@/components/features/admin/page-header";
import { vi } from "@/i18n/vi";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  let permissions: string[];
  try {
    ({ permissions } = await requireStaff());
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Fsettings");
    throw err;
  }

  if (!permissions.includes("settings:system")) {
    return <KhongCoQuyen mota="Vai trò của bạn chưa được cấp quyền đổi cài đặt hệ thống." />;
  }

  return (
    // BB-290 (#31): `max-w-5xl` (1024px) là hẹp hơn cột nội dung thật tại
    // 1440px, nên `mx-auto` CĂN GIỮA nó — đẩy H1 lệch phải 52px so với các
    // trang dùng `max-w-6xl` (1152px, rộng hơn cột nên nằm sát lề, không bị
    // căn giữa). Đổi về `max-w-6xl` — bề rộng tối đa DÙNG CHUNG cho mọi
    // trang quản trị.
    <main className="mx-auto min-w-0 max-w-6xl space-y-6">
      <PageHeader title={vi.admin.caiDat.title} description={vi.admin.caiDat.subtitle} />
      <SettingsManager />
      <DongBoGiaSanPham />
      {/* BB-331: đủ mọi kích thước đang bán (chỉ đọc) + lý do khách chưa thấy. */}
      <DanhMucKichThuoc />
    </main>
  );
}
