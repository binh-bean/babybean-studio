"use client";

import React from "react";
import { vi } from "@/i18n";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import Link from "next/link";

export function GalleryFilters() {
  return (
    <div className="sticky top-16 z-20 bg-[var(--bb-surface)] py-4 border-b border-[var(--bb-border)] flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-64">
        <Input 
          placeholder={vi.admin.galleries.searchPlaceholder}
          className="pl-9"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--bb-fg-muted)]" />
      </div>

      <Select className="w-[140px]" aria-label={vi.admin.galleries.filterBranch}>
        <option value="">{vi.admin.galleries.filterBranch}</option>
        <option value="1">Chi nhánh 1</option>
      </Select>

      <Select className="w-[140px]" aria-label={vi.admin.galleries.filterStatus}>
        <option value="">{vi.admin.galleries.filterStatus}</option>
        <option value="draft">Bản nháp</option>
        <option value="ready">Chờ chọn</option>
        <option value="submitted">Đã chốt</option>
      </Select>

      <Select className="w-[140px]" aria-label={vi.admin.galleries.filterUrgency}>
        <option value="">{vi.admin.galleries.filterUrgency}</option>
        <option value="normal">Bình thường</option>
        <option value="urgent">Gấp</option>
      </Select>

      <Select className="w-[140px]" aria-label={vi.admin.galleries.filterPhotographer}>
        <option value="">{vi.admin.galleries.filterPhotographer}</option>
        <option value="tuan_anh">Tuấn Anh</option>
      </Select>
      
      {/* Date filter could just be a simple select or date input, but let's keep it simple for BB-024 */}
      <Input type="date" className="w-[160px]" aria-label={vi.admin.galleries.filterDate} />

      <div className="ml-auto">
        <Link href="/admin/galleries/create">
          <Button variant="default">
            {vi.admin.galleries.createGalleryCta}
          </Button>
        </Link>
      </div>
    </div>
  );
}
