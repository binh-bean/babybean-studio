/**
 * Màn Vai trò và quyền — BB-172 chặng 2b.
 *
 * OWNER: DEV-FE.
 */

import { RolesManager } from "@/components/features/admin/roles-manager";
import { vi } from "@/i18n/vi";

export default function AdminRolesPage() {
  return (
    <main className="mx-auto min-w-0 max-w-5xl">
      <h1 className="mb-6 hidden text-2xl font-bold tracking-tight lg:block">
        {vi.admin.vaiTro.title}
      </h1>
      <RolesManager />
    </main>
  );
}
