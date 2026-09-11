"use client";

import React from "react";
import Link from "next/link";
import { vi } from "@/i18n";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Table2, Kanban, Plus } from "lucide-react";

export interface GalleryFilterState {
  branchId: string;
  status: string;
  photographerId: string;
  dateFrom: string;
  dateTo: string;
  search: string;
  viewMode: "table" | "kanban";
}

export interface GalleryFiltersProps {
  values: GalleryFilterState;
  onChange: (updates: Partial<GalleryFilterState>) => void;
  branches: { id: string; name: string }[];
  photographers: { id: string; name: string }[];
}

export function GalleryFilters({
  values,
  onChange,
  branches,
  photographers,
}: GalleryFiltersProps) {
  return (
    <div className="sticky top-16 z-20 bg-[var(--bb-surface)] py-4 border-b border-[var(--bb-border)] space-y-3">
      {/* Hàng 1: Tìm kiếm, Bộ lọc nhanh, Toggle Chế độ xem & Nút tạo mới */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Tìm kiếm Tên bé, Tên khách, SĐT */}
          <div className="relative w-full sm:w-72">
            <Input
              name="search"
              value={values.search}
              onChange={(e) => onChange({ search: e.target.value })}
              placeholder={vi.admin.galleries.searchPlaceholder}
              className="pl-9"
              aria-label={vi.admin.galleries.searchPlaceholder}
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--bb-fg-muted)] pointer-events-none" />
          </div>

          {/* Lọc chi nhánh */}
          <div className="w-full sm:w-auto">
            <Select
              name="branchId"
              value={values.branchId}
              onChange={(e) => onChange({ branchId: e.target.value })}
              className="w-full sm:w-[170px]"
              aria-label={vi.admin.galleries.filterBranch}
            >
              <option value="">{vi.admin.galleries.filterBranch}: Tất cả</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Lọc trạng thái */}
          <div className="w-full sm:w-auto">
            <Select
              name="status"
              value={values.status}
              onChange={(e) => onChange({ status: e.target.value })}
              className="w-full sm:w-[160px]"
              aria-label={vi.admin.galleries.filterStatus}
            >
              <option value="">{vi.admin.galleries.filterStatus}: Tất cả</option>
              <option value="draft">Bản nháp</option>
              <option value="syncing">Đang đồng bộ</option>
              <option value="ready">Sẵn sàng</option>
              <option value="in_review">Chờ khách chọn</option>
              <option value="submitted">Đã chốt</option>
              <option value="in_retouch">Đang retouch</option>
              <option value="delivered">Đã giao</option>
              <option value="expired">Quá hạn</option>
              <option value="archived">Lưu trữ</option>
            </Select>
          </div>

          {/* Lọc người phụ trách (Photographer) */}
          <div className="w-full sm:w-auto">
            <Select
              name="photographerId"
              value={values.photographerId}
              onChange={(e) => onChange({ photographerId: e.target.value })}
              className="w-full sm:w-[170px]"
              aria-label={vi.admin.galleries.filterPhotographer}
            >
              <option value="">{vi.admin.galleries.filterPhotographer}: Tất cả</option>
              {photographers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Lọc khoảng ngày chụp */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Input
              type="date"
              name="dateFrom"
              value={values.dateFrom}
              onChange={(e) => onChange({ dateFrom: e.target.value })}
              className="w-full sm:w-[145px]"
              aria-label="Từ ngày chụp"
              title="Từ ngày chụp"
            />
            <span className="text-[var(--bb-fg-muted)] text-xs">đến</span>
            <Input
              type="date"
              name="dateTo"
              value={values.dateTo}
              onChange={(e) => onChange({ dateTo: e.target.value })}
              className="w-full sm:w-[145px]"
              aria-label="Đến ngày chụp"
              title="Đến ngày chụp"
            />
          </div>
        </div>

        {/* Nút Toggle View & Nút Tạo mới */}
        <div className="flex items-center gap-3 ml-auto">
          {/* Segmented control: Bảng vs Kanban */}
          <div className="flex items-center rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface-2)] p-0.5">
            <Button
              type="button"
              variant={values.viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => onChange({ viewMode: "table" })}
              className="h-8 px-3 text-xs"
              aria-label="Xem dạng bảng"
            >
              <Table2 className="h-3.5 w-3.5 mr-1" />
              Bảng
            </Button>
            <Button
              type="button"
              variant={values.viewMode === "kanban" ? "default" : "ghost"}
              size="sm"
              onClick={() => onChange({ viewMode: "kanban" })}
              className="h-8 px-3 text-xs"
              aria-label="Xem dạng Kanban"
            >
              <Kanban className="h-3.5 w-3.5 mr-1" />
              Kanban
            </Button>
          </div>

          <Link href="/admin/galleries/create">
            <Button variant="default" className="h-9">
              <Plus className="h-4 w-4 mr-1.5" />
              {vi.admin.galleries.createGalleryCta}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
