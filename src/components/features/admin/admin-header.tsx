"use client";

import React, { useState } from "react";
import { AdminBreadcrumb } from "./admin-breadcrumb";
import { Menu } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NavLinks } from "./admin-sidebar";
import { AdminAccountMenu } from "./admin-account-menu";

export function AdminHeader({
  role,
  hoTen,
  canXuLyCount,
}: {
  role?: string;
  hoTen?: string | null;
  /** Huy hiệu "Việc cần xử lý" trong menu Sheet điện thoại — xem admin-layout-shell.tsx. */
  canXuLyCount?: number | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 w-full items-center justify-between border-b border-[var(--bb-border)] bg-[var(--bb-surface)]/80 backdrop-blur-md px-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {/* Mobile Menu Trigger */}
        <div className="md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Mở menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            {/* BB-320 (Q12): Sheet dựng qua portal ra <body>, NGOÀI .giao-dien-quan-tri — thiếu lớp này thì
                --bb-sidebar-active-bg/--bb-moss không có giá trị và mục đang mở không tô nền lẫn vạch rêu. */}
            <SheetContent side="left" className="giao-dien-quan-tri w-[280px] p-0" aria-describedby={undefined}>
              <SheetTitle className="sr-only">Menu Điều Hướng</SheetTitle>
              <div className="flex h-16 items-center gap-[7px] border-b border-[var(--bb-border)] px-4">
                {/* BB-306 — logo hạt đậu trước chữ, căn giữa dọc theo chữ. */}
                <img
                  data-testid="logo-hat-dau"
                  src="/brand/logo-hat-dau-64.png"
                  alt=""
                  aria-hidden="true"
                  className="h-[21px] w-[21px] shrink-0"
                />
                <span className="font-display text-[18px] tracking-[0.14em] text-[var(--bb-fg)]">BABY BEAN</span>
              </div>
              <div className="overflow-y-auto">
                <NavLinks onClick={() => setMobileOpen(false)} role={role} canXuLyCount={canXuLyCount} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        
        {/* Breadcrumb for desktop */}
        <AdminBreadcrumb />
        {/*
          Trên điện thoại thanh này chỉ có nút menu, chữ BabyBean và nút thoát.
          BB-320: tên màn KHÔNG còn ở đây — mọi màn nay có H1 ngay đầu trang
          (PageHeader), in hai lần là nói cùng một điều hai chỗ.
        */}
        <span className="flex min-w-0 items-baseline gap-1.5 sm:hidden">
          {/* BB-292: "BabyBean" liền chữ khác hẳn thanh bên/Sheet (đều giãn
              chữ "BABY BEAN" serif) — đồng bộ lại, giữ nhỏ + không xuống dòng
              để còn chỗ cho tên màn ngay bên cạnh. */}
          {/* BB-306 — logo hạt đậu trước chữ; `items-center` riêng cho cụm
              logo+chữ (không dùng `items-baseline` của span cha, ảnh không
              có baseline chữ để canh theo). */}
          <span className="inline-flex shrink-0 items-center gap-[6px]">
            <img
              data-testid="logo-hat-dau"
              src="/brand/logo-hat-dau-64.png"
              alt=""
              aria-hidden="true"
              className="h-[18px] w-[18px] shrink-0"
            />
            <span className="font-display whitespace-nowrap tracking-[0.08em] text-[var(--bb-fg)]">BABY BEAN</span>
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
