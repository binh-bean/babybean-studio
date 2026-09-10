"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Images,
  Users,
  Settings,
  Store,
  UserCog,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

/**
 * Mục điều hướng.
 *
 * `ready: false` = trang chưa tồn tại. Hiện mờ và không bấm được, thay vì dẫn
 * người ta tới lỗi 404 — trước đây "Khách hàng" và "Cài đặt" đều nằm trong menu
 * mà bấm vào là trang trắng.
 *
 * `ownerOnly` theo docs/05-rbac.md §2: chỉ owner và admin đụng được nhân sự.
 */
const navItems: {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  ready: boolean;
  ownerOnly?: boolean;
}[] = [
  { name: "Bảng điều khiển", href: "/admin", icon: LayoutDashboard, ready: false },
  { name: "Quản lý album", href: "/admin/galleries", icon: Images, ready: true },
  { name: "Chi nhánh", href: "/admin/branches", icon: Store, ready: true },
  { name: "Nhân sự", href: "/admin/staff", icon: UserCog, ready: true, ownerOnly: true },
  { name: "Khách hàng", href: "/admin/customers", icon: Users, ready: false },
  { name: "Cài đặt", href: "/admin/settings", icon: Settings, ready: false },
];

interface AdminSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  role?: string;
}

export function NavLinks({
  isCollapsed,
  onClick,
  role,
}: {
  isCollapsed?: boolean;
  onClick?: () => void;
  role?: string;
}) {
  const pathname = usePathname();
  const canSeeStaff = role === "owner" || role === "admin";

  return (
    <nav className="space-y-1 p-2">
      {navItems.map((item) => {
        if (item.ownerOnly && !canSeeStaff) return null;

        const isActive =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);

        // Chưa làm xong thì không cho bấm. Một mục menu dẫn tới trang trắng
        // làm người dùng tưởng hệ thống hỏng chứ không nghĩ là chưa có.
        if (!item.ready) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title={isCollapsed ? `${item.name} — sắp có` : undefined}
              className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-[var(--bb-fg-muted)] opacity-50"
            >
              <item.icon className={cn("h-5 w-5 shrink-0", isCollapsed && "mx-auto")} />
              {!isCollapsed && (
                <span className="flex w-full items-center justify-between gap-2">
                  {item.name}
                  <span className="text-[10px] uppercase tracking-wide">sắp có</span>
                </span>
              )}
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-[var(--bb-primary)] text-[var(--bb-primary-fg)]"
                : "text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)]"
            )}
            title={isCollapsed ? item.name : undefined}
          >
            <item.icon className={cn("h-5 w-5 shrink-0", isCollapsed && "mx-auto")} />
            {!isCollapsed && <span>{item.name}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSidebar({ isCollapsed, onToggle, role }: AdminSidebarProps) {
  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-[var(--bb-border)] bg-[var(--bb-surface)] transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--bb-border)] px-4">
        {!isCollapsed && <span className="font-display text-lg font-bold whitespace-nowrap overflow-hidden text-[var(--bb-fg)]">BabyBean</span>}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn("shrink-0", !isCollapsed && "ml-auto")}
          title={isCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          aria-label={isCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <NavLinks isCollapsed={isCollapsed} role={role} />
      </div>
    </aside>
  );
}
