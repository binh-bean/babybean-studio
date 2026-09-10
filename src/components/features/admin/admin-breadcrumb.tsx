"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

export function AdminBreadcrumb() {
  const pathname = usePathname();
  
  const paths = pathname.split("/").filter(Boolean);
  
  const getBreadcrumbName = (path: string) => {
    if (path === "admin") return "Bảng điều khiển";
    if (path === "galleries") return "Quản lý Album";
    if (path === "customers") return "Khách hàng";
    if (path === "settings") return "Cài đặt";
    return path; 
  };

  const breadcrumbs = paths.map((path, index) => {
    const href = "/" + paths.slice(0, index + 1).join("/");
    return {
      name: getBreadcrumbName(path),
      href
    };
  });

  return (
    <nav aria-label="Breadcrumb" className="hidden sm:flex items-center text-sm text-[var(--bb-fg-muted)] space-x-1">
      {breadcrumbs.map((bc, idx) => {
        const isLast = idx === breadcrumbs.length - 1;
        return (
          <div key={bc.href} className="flex items-center">
            {idx > 0 && <ChevronRight className="h-4 w-4 mx-1 opacity-50" />}
            {isLast ? (
              <span className="font-medium text-[var(--bb-fg)]" aria-current="page">
                {bc.name}
              </span>
            ) : (
              <Link href={bc.href} className="hover:text-[var(--bb-primary)] transition-colors">
                {bc.name}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
