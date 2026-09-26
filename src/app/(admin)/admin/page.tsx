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
    <main className="mx-auto min-w-0 max-w-7xl">
      {/* Thanh trên cùng đã ghi tên màn — xem ghi chú ở màn Khách hàng. */}
      <h1 className="mb-6 hidden font-display text-2xl font-bold tracking-tight lg:block">Bảng điều khiển</h1>
      <Dashboard />
    </main>
  );
}
