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
    <main className="mx-auto min-w-0 max-w-5xl">
      <PageHeader title={vi.admin.caiDat.title} hideOnMobile />
      <SettingsManager />
    </main>
  );
}
