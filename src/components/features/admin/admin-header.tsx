"use client";

import React, { useState } from "react";
import { BranchSelector } from "./branch-selector";
import { AdminBreadcrumb } from "./admin-breadcrumb";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Menu } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NavLinks } from "./admin-sidebar";

export function AdminHeader({ role }: { role?: string }) {
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
        {/* Title for mobile when breadcrumb hidden */}
        <span className="font-display font-bold sm:hidden text-[var(--bb-fg)]">BabyBean</span>
      </div>
      
      <div className="flex items-center gap-3">
        <BranchSelector />
        <Avatar className="h-8 w-8">
          <AvatarImage src="https://i.pravatar.cc/150?u=admin" alt="Admin" />
          <AvatarFallback>AD</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
