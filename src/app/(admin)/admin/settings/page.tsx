/**
 * Màn Cài đặt — BB-197.
 *
 * OWNER: DEV-FE.
 */

import { SettingsManager } from "@/components/features/admin/settings-manager";
import { vi } from "@/i18n/vi";

export default function AdminSettingsPage() {
  return (
    <main className="mx-auto min-w-0 max-w-5xl">
      <h1 className="mb-6 hidden font-display text-2xl font-bold tracking-tight lg:block">
        {vi.admin.caiDat.title}
      </h1>
      <SettingsManager />
    </main>
  );
}
