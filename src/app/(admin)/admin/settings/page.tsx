/**
 * Màn Cài đặt — BB-197.
 *
 * OWNER: DEV-FE.
 */

import { SettingsManager } from "@/components/features/admin/settings-manager";
import { vi } from "@/i18n/vi";

export default function AdminSettingsPage() {
  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6 lg:p-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">{vi.admin.caiDat.title}</h1>
      <SettingsManager />
    </main>
  );
}
