"use client";

import React, { useState } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { AdminHeader } from "./admin-header";

export function AdminLayoutShell({
  children,
  role,
}: {
  children: React.ReactNode;
  /** Vai trò của người đang đăng nhập, để ẩn mục Nhân sự với người không có quyền. */
  role?: string;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-[100dvh] w-full bg-[var(--bb-bg)]">
      <AdminSidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        role={role}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader role={role} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
