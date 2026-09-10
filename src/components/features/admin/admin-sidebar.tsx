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
  ChevronLeft,
  ChevronRight
} from "lucide-react";

const navItems = [
  { name: "Bảng điều khiển", href: "/admin", icon: LayoutDashboard },
  { name: "Quản lý Album", href: "/admin/galleries", icon: Images },
  { name: "Khách hàng", href: "/admin/customers", icon: Users },
  { name: "Cài đặt", href: "/admin/settings", icon: Settings },
];

interface AdminSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function NavLinks({ isCollapsed, onClick }: { isCollapsed?: boolean; onClick?: () => void }) {
  const pathname = usePathname();
  
  return (
    <nav className="space-y-1 p-2">
      {navItems.map((item) => {
        const isActive = item.href === "/admin" 
          ? pathname === "/admin" 
          : pathname.startsWith(item.href);
          
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

export function AdminSidebar({ isCollapsed, onToggle }: AdminSidebarProps) {
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
        <NavLinks isCollapsed={isCollapsed} />
      </div>
    </aside>
  );
}
