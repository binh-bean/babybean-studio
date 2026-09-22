"use client";

import React, { useState } from "react";
import { AdminBreadcrumb, TenManHinh } from "./admin-breadcrumb";
import { Menu } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NavLinks } from "./admin-sidebar";
import { AdminAccountMenu } from "./admin-account-menu";

export function AdminHeader({ role, hoTen }: { role?: string; hoTen?: string | null }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 w-full items-center justify-between border-b border-[var(--bb-border)] bg-[var(--bb-surface)]/80 backdrop-blur-md px-4 sm:px-6">
      <div className="flex items-center gap-4">
        {/* Mobile Menu Trigger */}
        <div className="md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Mở menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0" aria-describedby={undefined}>
              <SheetTitle className="sr-only">Menu Điều Hướng</SheetTitle>
              <div className="flex h-16 items-center border-b border-[var(--bb-border)] px-4">
                <span className="font-display text-lg font-bold">BabyBean Studio</span>
              </div>
              <div className="overflow-y-auto">
                <NavLinks onClick={() => setMobileOpen(false)} role={role} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        
        {/* Breadcrumb for desktop */}
        <AdminBreadcrumb />
        {/*
          Trên điện thoại thanh này chỉ có nút menu, chữ BabyBean và nút thoát —
          giữa trống một mảng, trong khi tên màn đang xem lại chiếm hẳn một dòng
          bên dưới. Nay tên màn nằm luôn ở đây.
        */}
        <span className="flex min-w-0 items-baseline gap-1.5 sm:hidden">
          <span className="font-display font-bold text-[var(--bb-fg)]">BabyBean</span>
          <span className="truncate text-sm text-[var(--bb-fg-muted)]">
            <span aria-hidden="true">· </span>
            <TenManHinh />
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* BB-174 gỡ chọn chi nhánh và ảnh đại diện đi vì cả hai chưa làm gì.
            BB-185 trả chỗ này lại — lần này có việc thật: nói rõ ai đang đăng
            nhập, và cho người ta thoát ra. Máy quầy là máy chung. */}
        <AdminAccountMenu hoTen={hoTen} role={role} />
      </div>
    </header>
  );
}
