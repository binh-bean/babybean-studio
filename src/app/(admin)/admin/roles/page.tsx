/**
 * Màn Vai trò và quyền — BB-172 chặng 2b.
 *
 * OWNER: DEV-FE.
 */

import { RolesManager } from "@/components/features/admin/roles-manager";
import { vi } from "@/i18n/vi";

export default function AdminRolesPage() {
  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6 lg:p-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">{vi.admin.vaiTro.title}</h1>
      <RolesManager />
    </main>
  );
}
