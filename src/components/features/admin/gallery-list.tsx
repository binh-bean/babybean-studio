"use client";

import React from "react";
import { vi } from "@/i18n";
import { DataTable, Column } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Copy, Download, Bell, CalendarPlus, Unlock } from "lucide-react";


type GalleryRow = {
  id: string;
  babyName: string;
  customerName: string;
  branchName: string;
  status: string;
  urgency: string;
  date: string;
  photographer: string;
  progress: string;
};

// Mock data
const mockData: GalleryRow[] = [
  {
    id: "1",
    babyName: "Bé Bơ 3 tháng",
    customerName: "Chị Mai",
    branchName: "Quận 1",
    status: "in_review",
    urgency: "Sắp hết hạn",
    date: "10/09/2026",
    photographer: "Tuấn Anh",
    progress: "18/20",
  },
  {
    id: "2",
    babyName: "Gia đình Củ Cải",
    customerName: "Anh Hoàng",
    branchName: "Quận 3",
    status: "submitted",
    urgency: "Bình thường",
    date: "08/09/2026",
    photographer: "Minh Quân",
    progress: "25/20",
  },
];

export function GalleryList() {
  const columns: Column<GalleryRow>[] = [
    {
      key: "babyName",
      header: vi.admin.dashboard.childName,
      cell: (row) => <span className="font-medium text-[var(--bb-fg)]">{row.babyName}</span>,
    },
    {
      key: "customerName",
      header: vi.admin.dashboard.customerName,
      cell: (row) => row.customerName,
    },
    {
      key: "branchName",
      header: vi.admin.dashboard.branchName,
      cell: (row) => row.branchName,
    },
    {
      key: "status",
      header: vi.admin.dashboard.statusName,
      cell: (row) => (
        <Badge variant={row.status === "in_review" ? "warning" : "success"}>
          {row.status === "in_review" ? "Chờ chọn" : "Đã chốt"}
        </Badge>
      ),
    },
    {
      key: "progress",
      header: vi.admin.dashboard.progress,
      cell: (row) => row.progress,
    },
    {
      key: "actions",
      header: "",
      cell: () => (
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="sm" title={vi.admin.galleries.menuView}>
            <Eye className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" title={vi.admin.galleries.menuCopyLink}>
            <Copy className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" title={vi.admin.galleries.menuRemind}>
            <Bell className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" title={vi.admin.galleries.menuExport}>
            <Download className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" title={vi.admin.galleries.menuExtend}>
            <CalendarPlus className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" title={vi.admin.galleries.menuReopen}>
            <Unlock className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <DataTable columns={columns} data={mockData} />
    </div>
  );
}
