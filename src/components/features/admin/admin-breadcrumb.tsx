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
  if (path === "admin") return "Bàn làm việc";
  if (path === "galleries") return "Quản lý bộ ảnh";
  if (path === "customers") return "Khách hàng";
  if (path === "settings") return "Cài đặt";
  // BB-280: /admin/staff giờ là trang gộp "Nhân sự & vai trò" (hai tab); giữ
  // "roles" cũ lại phòng khi còn liên kết cũ nào đó chưa qua redirect.
  if (path === "staff") return "Nhân sự & vai trò";
  if (path === "roles") return "Nhân sự & vai trò";
  if (path === "branches") return "Chi nhánh";
  if (path === "reports") return "Báo cáo";
  if (path === "bao-cao") return "Báo cáo điều hành";
  // BB-280: gộp ba trang báo cáo lỗi cũ vào một trang ba tab.
  if (path === "viec-can-xu-ly") return "Việc cần xử lý";
  if (path === "nhat-ky") return "Nhật ký thao tác";
  if (path === "over-quota") return "Ảnh vượt hạn mức";
  if (path === "loi-dong-bo") return "Bộ ảnh lỗi tải";
  if (path === "link-sap-het-han") return "Link sắp hết hạn";
  if (path === "create") return "Tạo bộ ảnh mới";
  // BB-313 (ảnh chụp app thật, Đợt 9, mục 1) — đoạn cuối `/admin/galleries/…`
  // có thể là MÃ HỢP ĐỒNG thay vì uuid (route đọc theo mã khi không khớp
  // `LA_MA`, xem `[id]/page.tsx`), và mã dạng "HD_20260911#5087" luôn đi qua
  // `encodeURIComponent` trước khi ghép vào URL (dấu `#` phải mã hoá, không
  // thì trình duyệt cắt mất phần sau nó) — `usePathname()` trả nguyên văn
  // đoạn đường dẫn đã mã hoá đó ("HD_20260911%235087"), không tự giải mã
  // giúp. Giải mã lại ở đây để breadcrumb hiện đúng "#", không phải "%23".
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
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
    <nav aria-label="Breadcrumb" className="hidden sm:flex items-center text-[13px] text-[var(--bb-fg-muted)] space-x-1">
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
