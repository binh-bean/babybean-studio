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

export default function AdminDashboardPage() {
  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Bảng điều khiển</h1>
      <Dashboard />
    </main>
  );
}
