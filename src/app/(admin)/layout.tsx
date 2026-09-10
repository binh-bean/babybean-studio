import { AdminLayoutShell } from "@/components/features/admin/admin-layout-shell";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quản trị | BabyBean Studio",
  description: "Trang quản trị hệ thống BabyBean Studio",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminLayoutShell>
      {children}
    </AdminLayoutShell>
  );
}
