/**
 * Các tab của "Việc cần xử lý" + cách đếm — MỘT chỗ cho cả trang lẫn huy hiệu
 * menu. BB-327.
 *
 * Chủ studio 29/09/2026: menu "Việc cần xử lý" hiện 208 nhưng vào trang thì
 * không có 208 việc. Nguyên nhân: huy hiệu cộng theo công thức của khối "Cần
 * xử lý ngay" ở Bàn làm việc (bộ chưa có ảnh, chưa có hạn mức, Lark báo
 * đỏ/tím… — những loại KHÔNG có tab nào trong trang này), còn trang thì liệt
 * kê năm hàng đợi khác. Nay huy hiệu = TỔNG số dòng của đúng các tab trang
 * này hiện cho vai đang đăng nhập, đếm bằng đúng các route mà từng tab tải —
 * việc đã xử lý rời route thì cũng rời huy hiệu.
 */

/** Sự kiện cửa sổ: một việc vừa được xử lý — trang và huy hiệu menu đếm lại. */
export const SU_KIEN_VIEC_DOI = "viecCanXuLyDoi";

export type TabViecCanXuLy =
  | "loi-dong-bo"
  | "link-sap-het-han"
  | "over-quota"
  | "yeu-cau-mo-lai"
  | "khach-mua-them"
  | "quen-mat-khau";

export interface DinhNghiaTabViec {
  value: TabViecCanXuLy;
  label: string;
  api: string;
  /** Vai bị chặn XEM tab này (giữ đúng luật hiển thị của các menu cũ, BB-280). */
  hiddenForRoles?: string[];
  /** Đếm số việc từ `data` của đáp trả `api`. */
  demSo: (data: unknown) => number;
}

const demItems = (data: unknown) => {
  const d = data as { items?: unknown[] } | null;
  return d?.items?.length ?? 0;
};

export const TABS_VIEC_CAN_XU_LY: DinhNghiaTabViec[] = [
  {
    value: "loi-dong-bo",
    label: "Bộ ảnh lỗi tải",
    api: "/api/admin/reports/loi-dong-bo",
    hiddenForRoles: ["photoshop_ctv"],
    demSo: (data) => {
      const d = data as { summary?: { galleryCount?: number } } | null;
      return d?.summary?.galleryCount ?? 0;
    },
  },
  {
    value: "link-sap-het-han",
    label: "Link sắp hết hạn",
    api: "/api/admin/reports/link-sap-het-han",
    hiddenForRoles: ["photoshop_ctv"],
    demSo: demItems,
  },
  {
    value: "over-quota",
    label: "Ảnh vượt hạn mức",
    api: "/api/admin/reports/over-quota",
    // Không hiddenForRoles: menu cũ cho MỌI vai thấy mục này — giữ nguyên.
    demSo: demItems,
  },
  {
    value: "yeu-cau-mo-lai",
    label: "Yêu cầu mở lại",
    api: "/api/admin/reports/yeu-cau-mo-lai",
    hiddenForRoles: ["photoshop_ctv"],
    demSo: demItems,
  },
  {
    value: "khach-mua-them",
    label: "Khách mua thêm",
    api: "/api/admin/reports/dot-chon-cho-xac-nhan",
    hiddenForRoles: ["photoshop_ctv"],
    demSo: (data) => {
      const d = data as { items?: unknown[]; viecDot1?: unknown[] } | null;
      return (d?.items?.length ?? 0) + (d?.viecDot1?.length ?? 0);
    },
  },
  {
    // BB-327 — nhân viên báo quên mật khẩu. Route tự trả rỗng cho vai không
    // có quyền `staff:manage`, nên tab chỉ hiện với người đặt lại được.
    value: "quen-mat-khau",
    label: "Quên mật khẩu",
    api: "/api/admin/reports/quen-mat-khau",
    hiddenForRoles: ["photoshop_ctv"],
    demSo: demItems,
  },
];

export function tabsChoVai(role?: string): DinhNghiaTabViec[] {
  return TABS_VIEC_CAN_XU_LY.filter((tab) => !(role && tab.hiddenForRoles?.includes(role)));
}

/** Cộng số việc các tab. Tab tải hỏng (undefined) coi là 0 — huy hiệu là phụ. */
export function tongViecCanXuLy(demSo: Partial<Record<TabViecCanXuLy, number>>): number {
  return Object.values(demSo).reduce<number>((t, n) => t + (typeof n === "number" && n > 0 ? n : 0), 0);
}
