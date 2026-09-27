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
import { PageHeader } from "@/components/features/admin/page-header";

export default function AdminDashboardPage() {
  return (
    <main className="mx-auto min-w-0 max-w-7xl space-y-4 lg:space-y-6">
      {/* Thanh trên cùng đã ghi tên màn — xem ghi chú ở màn Khách hàng. */}
      <PageHeader title="Bảng điều khiển" hideOnMobile className="mb-0" />
      <Dashboard />
    </main>
  );
}
