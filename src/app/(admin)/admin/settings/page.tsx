/**
 * Màn Cài đặt — BB-197.
 *
 * OWNER: DEV-FE.
 */

import { SettingsManager } from "@/components/features/admin/settings-manager";
import { PageHeader } from "@/components/features/admin/page-header";
import { vi } from "@/i18n/vi";

export default function AdminSettingsPage() {
  return (
    // BB-290 (#31): `max-w-5xl` (1024px) là hẹp hơn cột nội dung thật tại
    // 1440px, nên `mx-auto` CĂN GIỮA nó — đẩy H1 lệch phải 52px so với các
    // trang dùng `max-w-6xl` (1152px, rộng hơn cột nên nằm sát lề, không bị
    // căn giữa). Đổi về `max-w-6xl` — bề rộng tối đa DÙNG CHUNG cho mọi
    // trang quản trị.
    <main className="mx-auto min-w-0 max-w-6xl">
      <PageHeader title={vi.admin.caiDat.title} hideOnMobile />
      <SettingsManager />
    </main>
  );
}
