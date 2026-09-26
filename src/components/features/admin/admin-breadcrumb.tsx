"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

// Đoạn đường dẫn là mã (uuid) — ví dụ /admin/galleries/<id>. Hiện mã ra thì
// người đọc chỉ thấy một chuỗi vô nghĩa bị cắt cụt; gọi theo màn cha.
const LA_MA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getBreadcrumbName(path: string, cha?: string) {
  if (LA_MA.test(path)) return cha === "galleries" ? "Chi tiết bộ ảnh" : "Chi tiết";
  if (path === "admin") return "Bảng điều khiển";
  if (path === "galleries") return "Quản lý Bộ ảnh";
  if (path === "customers") return "Khách hàng";
  if (path === "settings") return "Cài đặt";
  if (path === "staff") return "Nhân sự";
  if (path === "roles") return "Vai trò";
  if (path === "branches") return "Chi nhánh";
  if (path === "reports") return "Báo cáo";
  if (path === "nhat-ky") return "Nhật ký thao tác";
  if (path === "over-quota") return "Ảnh vượt hạn mức";
  if (path === "loi-dong-bo") return "Bộ ảnh lỗi tải";
  if (path === "link-sap-het-han") return "Link sắp hết hạn";
  if (path === "create") return "Tạo bộ ảnh mới";
  return path;
}

export function AdminBreadcrumb() {
  const pathname = usePathname();

  const paths = pathname.split("/").filter(Boolean);

  const breadcrumbs = paths.map((path, index) => {
    const href = "/" + paths.slice(0, index + 1).join("/");
    return {
      name: getBreadcrumbName(path, paths[index - 1]),
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

/**
 * Tên của màn đang xem, một chữ duy nhất — dùng cho thanh đầu trang trên điện
 * thoại, nơi không đủ chỗ cho cả đường dẫn.
 *
 * Dùng chung `getBreadcrumbName` với đường dẫn đầy đủ: hai bảng tên cho cùng
 * một màn là hai bảng sẽ trôi khỏi nhau.
 */
export function TenManHinh() {
  const pathname = usePathname();
  const paths = pathname.split("/").filter(Boolean);
  const cuoi = paths[paths.length - 1] ?? "admin";
  return <>{getBreadcrumbName(cuoi, paths[paths.length - 2])}</>;
}
