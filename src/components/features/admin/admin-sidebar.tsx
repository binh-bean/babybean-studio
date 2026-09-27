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
  Store,
  ListChecks,
  UserCog,
  ChevronLeft,
  ChevronRight,
  History,
  BarChart3
} from "lucide-react";
import { demSoCanXuLy } from "@/lib/utils/can-xu-ly";

// Re-export — BB-283: công thức đếm giờ sống ở src/lib/utils/can-xu-ly.ts
// (dùng chung với dashboard.tsx), giữ tên xuất ở đây để không phải sửa nơi
// đã import từ admin-sidebar.tsx.
export { demSoCanXuLy };

/**
 * Menu quản trị, sắp theo TƯ DUY QUẢN TRỊ HỆ THỐNG, không theo thứ tự ngày
 * mục được thêm vào — đó là lỗi chủ studio nêu ra 27/09/2026: "đang lộn xộn
 * không logic từ tư duy quản trị hệ thống".
 *
 * Bốn nhóm, theo bản chất công việc chứ không theo màn hình:
 * - Tổng quan: một cửa sổ nhìn nhanh cả hệ thống.
 * - Vận hành: việc HẰNG NGÀY của CSKH — bộ ảnh, khách hàng, hàng đợi việc cần
 *   xử lý (BB-280 gộp ba trang báo cáo lỗi cũ thành một trang ba tab, xem
 *   src/app/(admin)/admin/viec-can-xu-ly/page.tsx).
 * - Báo cáo: xem số, không thao tác.
 * - Hệ thống: cấu hình bền — chi nhánh, nhân sự/vai trò, cài đặt, nhật ký.
 *   Nhóm này chỉ chủ studio/quản trị hệ thống mới thấy trọn vẹn.
 *
 * `ready: false` = trang chưa tồn tại. Hiện mờ và không bấm được, thay vì dẫn
 * người ta tới lỗi 404 — trước đây "Khách hàng" và "Cài đặt" đều nằm trong menu
 * mà bấm vào là trang trắng.
 *
 * `ownerOnly` theo docs/05-rbac.md §2: chỉ owner và admin đụng được nhân sự.
 *
 * `hiddenForRoles` là chiều ngược lại: mục ai cũng vào được TRỪ vài vai. Viết
 * riêng thay vì liệt kê vai được phép, để thêm một vai mới sau này không âm
 * thầm khoá mất mục của họ.
 */
interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  ready: boolean;
  ownerOnly?: boolean;
  hiddenForRoles?: string[];
}

interface NavGroup {
  key: string;
  /** Tiêu đề nhóm nhỏ trong sidebar — ẩn khi thu gọn, ẩn khi nhóm rỗng theo vai. */
  label: string;
  items: NavItem[];
}

/**
 * Xuất ra để `tests/unit/admin-sidebar-menu.test.ts` kiểm được LOGIC LỌC
 * (bốn nhóm, đúng thứ tự, ai xem được gì) mà không cần dựng cả cây React —
 * đây là dữ liệu thuần + hàm thuần, không đụng hook nào.
 */
export const navGroups: NavGroup[] = [
  {
    key: "tong-quan",
    label: "Tổng quan",
    items: [{ name: "Bảng điều khiển", href: "/admin", icon: LayoutDashboard, ready: true }],
  },
  {
    key: "van-hanh",
    label: "Vận hành",
    items: [
      { name: "Bộ ảnh", href: "/admin/galleries", icon: Images, ready: true },
      {
        name: "Khách hàng",
        href: "/admin/customers",
        icon: Users,
        ready: true,
        hiddenForRoles: ["photoshop_ctv"],
      },
      {
        // BB-280: gộp ba hàng đợi cũ (Bộ ảnh lỗi tải / Link sắp hết hạn / Ảnh
        // vượt hạn mức) vào MỘT trang ba tab, thay vì ba mục menu rời rạc.
        // photoshop_ctv chỉ thấy tab "Ảnh vượt hạn mức" bên trong — lọc theo
        // vai nằm trong viec-can-xu-ly.tsx, không phải ở đây.
        name: "Việc cần xử lý",
        href: "/admin/viec-can-xu-ly",
        icon: ListChecks,
        ready: true,
      },
    ],
  },
  {
    key: "bao-cao",
    label: "Báo cáo",
    items: [
      {
        name: "Báo cáo điều hành",
        href: "/admin/bao-cao",
        icon: BarChart3,
        ready: true,
        hiddenForRoles: ["photoshop_ctv"],
      },
    ],
  },
  {
    key: "he-thong",
    label: "Hệ thống",
    items: [
      { name: "Chi nhánh", href: "/admin/branches", icon: Store, ready: true },
      {
        // BB-280: gộp "Nhân sự" và "Vai trò" thành một trang hai tab.
        name: "Nhân sự & vai trò",
        href: "/admin/staff",
        icon: UserCog,
        ready: true,
        ownerOnly: true,
      },
      { name: "Cài đặt", href: "/admin/settings", icon: Settings, ready: true, ownerOnly: true },
      {
        name: "Nhật ký thao tác",
        href: "/admin/reports/nhat-ky",
        icon: History,
        ready: true,
        hiddenForRoles: ["photoshop_ctv"],
      },
    ],
  },
];

export function mucDuocXem(item: NavItem, role: string | undefined, canSeeStaff: boolean): boolean {
  if (item.ownerOnly && !canSeeStaff) return false;
  if (role && item.hiddenForRoles?.includes(role)) return false;
  return true;
}

/**
 * Đường dẫn của mục "Việc cần xử lý" — mục duy nhất mang huy hiệu số trong
 * sidebar (BB-283, điểm 1 của bản vẽ quan-tri-menu-nhom.png).
 */
const HREF_VIEC_CAN_XU_LY = "/admin/viec-can-xu-ly";

interface AdminSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  role?: string;
  /** Số hiện trên huy hiệu "Việc cần xử lý" — `null`/`undefined` = ẩn huy hiệu. */
  canXuLyCount?: number | null;
}

export function NavLinks({
  isCollapsed,
  onClick,
  role,
  canXuLyCount,
}: {
  isCollapsed?: boolean;
  onClick?: () => void;
  role?: string;
  canXuLyCount?: number | null;
}) {
  const pathname = usePathname();
  const canSeeStaff = role === "owner" || role === "admin";

  return (
    <nav className="space-y-[18px] p-2">
      {navGroups.map((group) => {
        const items = group.items.filter((item) => mucDuocXem(item, role, canSeeStaff));
        // Nhóm rỗng thì ẩn cả tiêu đề nhóm — một tiêu đề đứng trên khoảng
        // trống không nói gì với người đọc, chỉ làm menu trông thiếu chăm sóc.
        if (items.length === 0) return null;

        return (
          <div key={group.key} className="space-y-1">
            {!isCollapsed && (
              <div
                data-testid="nav-group-label"
                className="px-3 pb-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-[var(--bb-fg-muted)]"
              >
                {group.label}
              </div>
            )}
            {items.map((item) => {
              const isActive =
                item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              const huyHieu =
                item.href === HREF_VIEC_CAN_XU_LY && typeof canXuLyCount === "number" && canXuLyCount > 0
                  ? canXuLyCount
                  : null;

              // Chưa làm xong thì không cho bấm. Một mục menu dẫn tới trang
              // trắng làm người dùng tưởng hệ thống hỏng chứ không nghĩ là
              // chưa có.
              if (!item.ready) {
                return (
                  <span
                    key={item.href}
                    aria-disabled="true"
                    title={isCollapsed ? `${item.name} — sắp có` : undefined}
                    className="flex h-[38px] cursor-not-allowed items-center gap-3 rounded-[10px] px-3 text-sm font-medium text-[var(--bb-fg-muted)] opacity-50"
                  >
                    <item.icon size={18} strokeWidth={1.5} className={cn("shrink-0", isCollapsed && "mx-auto")} />
                    {!isCollapsed && (
                      <span className="flex w-full items-center justify-between gap-2">
                        {item.name}
                        <span className="text-[10px] uppercase tracking-wide">sắp có</span>
                      </span>
                    )}
                  </span>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClick}
                  className={cn(
                    "flex h-[38px] items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors",
                    // Bản vẽ quan-tri-menu-nhom.png: mục đang chọn trong thanh bên là
                    // viên sage NHẠT (--bb-accent-soft), không phải hồng đất — hồng để
                    // dành cho nút hành động chính.
                    isActive
                      ? "bg-[var(--bb-accent-soft)] text-[var(--bb-accent-soft-fg)]"
                      : "text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)]"
                  )}
                  title={isCollapsed ? item.name : undefined}
                >
                  <item.icon size={18} strokeWidth={1.5} className={cn("shrink-0", isCollapsed && "mx-auto")} />
                  {!isCollapsed && (
                    <span className="flex w-full items-center justify-between gap-2">
                      {item.name}
                      {huyHieu !== null && (
                        <span
                          data-testid="badge-viec-can-xu-ly"
                          className="ml-auto rounded-full bg-[var(--bb-danger)] px-2 py-0.5 text-[11px] font-medium leading-none text-white tabular-nums"
                        >
                          {huyHieu}
                        </span>
                      )}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

export function AdminSidebar({ isCollapsed, onToggle, role, canXuLyCount }: AdminSidebarProps) {
  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-[var(--bb-border)] bg-[var(--bb-sidebar-bg)] transition-all duration-300",
        isCollapsed ? "w-16" : "w-[248px]"
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between px-4 pb-[22px] pt-[22px]",
          isCollapsed && "justify-center px-2"
        )}
      >
        {!isCollapsed && (
          <span className="font-display whitespace-nowrap overflow-hidden text-[18px] tracking-[0.14em] text-[var(--bb-fg)]">
            BABY BEAN
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="shrink-0"
          title={isCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          aria-label={isCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <NavLinks isCollapsed={isCollapsed} role={role} canXuLyCount={canXuLyCount} />
      </div>
    </aside>
  );
}
