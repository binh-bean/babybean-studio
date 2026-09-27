"use client";

import React, { useEffect, useState } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { AdminHeader } from "./admin-header";
import { demSoCanXuLy, type CanXuLyTongHop } from "@/lib/utils/can-xu-ly";

export function AdminLayoutShell({
  children,
  role,
  hoTen,
}: {
  children: React.ReactNode;
  /** Vai trò của người đang đăng nhập, để ẩn mục Nhân sự với người không có quyền. */
  role?: string;
  /** Tên người đang đăng nhập — máy quầy là máy chung (BB-185). */
  hoTen?: string | null;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // BB-283, điểm 1 (chỉnh lại sau soát 27/09/2026): huy hiệu số cạnh "Việc
  // cần xử lý" trong sidebar và khối "Cần xử lý ngay" ở Bảng điều khiển PHẢI
  // ra CÙNG một số — gọi MỘT LẦN khi layout tải (không phải mỗi lần NavLinks
  // mount, vì component này bọc cả sidebar máy tính lẫn Sheet điện thoại),
  // gộp hai nguồn qua `demSoCanXuLy()` (src/lib/utils/can-xu-ly.ts) — công
  // thức DUY NHẤT, `dashboard.tsx` gọi lại đúng hàm này cho khối của nó. Lỗi
  // thì `null` — ẩn huy hiệu, không chặn menu.
  const [canXuLyCount, setCanXuLyCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function taiSoCanXuLy() {
      const layTuMot = (url: string) =>
        fetch(url, { cache: "no-store" })
          .then((res) => res.json().catch(() => null).then((json) => ({ ok: res.ok, json })))
          .catch(() => ({ ok: false, json: null }));

      const [canXuLy, dashboard] = await Promise.all([
        layTuMot("/api/admin/can-xu-ly"),
        layTuMot("/api/admin/dashboard"),
      ]);
      if (!alive) return;

      // Cả hai cùng hỏng thì ẩn hẳn huy hiệu; hỏng MỘT nguồn thì vẫn cộng
      // được phần còn lại (đúng hơn là ẩn tất) — `demSoCanXuLy` tự coi phần
      // thiếu là 0.
      if (!canXuLy.ok && !dashboard.ok) return;

      const merged: CanXuLyTongHop = {
        driveChuaChiaSe: canXuLy.ok ? canXuLy.json?.data?.driveChuaChiaSe : undefined,
        chuaCoAnh: canXuLy.ok ? canXuLy.json?.data?.chuaCoAnh : undefined,
        chuaCoHanMuc: canXuLy.ok ? canXuLy.json?.data?.chuaCoHanMuc : undefined,
        dueSoon: dashboard.ok ? dashboard.json?.data?.stats?.dueSoon : undefined,
        overdue: dashboard.ok ? dashboard.json?.data?.stats?.overdue : undefined,
        canhBaoLark: canXuLy.ok ? canXuLy.json?.data?.canhBaoLark : undefined,
      };
      setCanXuLyCount(demSoCanXuLy(merged));
    }

    taiSoCanXuLy().catch(() => {
      // Huy hiệu là phụ — hỏng thì ẩn, không chặn menu.
    });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex h-[100dvh] w-full bg-[var(--bb-bg)]">
      <AdminSidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        role={role}
        canXuLyCount={canXuLyCount}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader role={role} hoTen={hoTen} canXuLyCount={canXuLyCount} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
