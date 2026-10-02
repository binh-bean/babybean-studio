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
  | "quen-mat-khau"
  | "lark-da-xoa";

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
    // BB-337 — "Khách gửi ảnh chọn": mỗi BỘ ẢNH một dòng (đợt 1 chờ xác nhận +
    // đợt mua thêm + nhờ studio chọn giúp). Giữ `value` cũ để link cũ không vỡ.
    value: "khach-mua-them",
    label: "Khách gửi ảnh chọn",
    api: "/api/admin/reports/dot-chon-cho-xac-nhan",
    hiddenForRoles: ["photoshop_ctv"],
    demSo: (data) => {
      const d = data as { boAnh?: unknown[]; items?: unknown[]; viecDot1?: unknown[] } | null;
      if (Array.isArray(d?.boAnh)) return d.boAnh.length;
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
  {
    // BB-332 — bộ ảnh đã gửi khách mà dòng Hậu Kỳ bị xoá bên Lark (không tự xoá).
    value: "lark-da-xoa",
    label: "Dòng Lark đã bị xoá",
    api: "/api/admin/reports/lark-da-xoa",
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

// ---------------------------------------------------------------------------
// BB-359 — MỘT kết quả đếm cho BỐN chỗ hiển thị
// ---------------------------------------------------------------------------
// Vòng 8 (người chấm A, Q-1): cùng một Bàn làm việc mà huy hiệu menu "3", dòng
// phụ "2 việc cần làm hôm nay", thẻ "Cần xử lý ngay" chỉ có "Khách gửi ảnh chọn 2"
// (thiếu "Ảnh vượt hạn mức 1"). Ba chỗ đếm bằng ba công thức: huy hiệu = các tab
// (BB-327), thẻ = `demSoCanXuLy` (BB-283/285: bộ chưa có ảnh, chưa có hạn mức, Lark
// đỏ/tím… — không có tab nào), dòng phụ = "Việc hôm nay" (hạn chọn ảnh).
//
// Nay CẢ BỐN — huy hiệu menu, dòng phụ lời chào, thẻ "Cần xử lý ngay", số trên từng
// tab — đọc CÙNG MỘT `KetQuaDemViec`, do `demViecCanXuLy` tính một lần ở
// `AdminLayoutShell` và chia qua React context (dem-viec-context.tsx). Không chỗ nào
// tự cộng lại.

export interface DongViecCanXuLy {
  tab: TabViecCanXuLy;
  nhan: string;
  soLuong: number;
  /** Bấm dòng mở đúng tab. */
  href: string;
}

export interface KetQuaDemViec {
  /** Số việc của TỪNG tab hiện cho vai này (tab tải hỏng thì không có khoá). */
  theoTab: Partial<Record<TabViecCanXuLy, number>>;
  /** Tổng — số trên huy hiệu menu và dòng phụ. Luôn = tổng `soLuong` của `dong`. */
  tong: number;
  /** Mỗi tab có số > 0 là MỘT dòng, theo thứ tự tab — thẻ "Cần xử lý ngay". */
  dong: DongViecCanXuLy[];
  /** Route quên mật khẩu báo người này không có quyền — trang ẩn tab đó. */
  khongCoQuyenQuenMk: boolean;
}

/** Dựng kết quả từ số từng tab. Thuần — phép thử gọi thẳng. */
export function ketQuaDemViec(
  demSo: Partial<Record<TabViecCanXuLy, number>>,
  role?: string,
  khongCoQuyenQuenMk = false,
): KetQuaDemViec {
  const dong: DongViecCanXuLy[] = [];
  for (const tab of tabsChoVai(role)) {
    if (tab.value === "quen-mat-khau" && khongCoQuyenQuenMk) continue;
    const n = demSo[tab.value];
    if (typeof n === "number" && n > 0) {
      dong.push({ tab: tab.value, nhan: tab.label, soLuong: n, href: `/admin/viec-can-xu-ly?tab=${tab.value}` });
    }
  }
  return {
    theoTab: demSo,
    tong: dong.reduce((t, d) => t + d.soLuong, 0),
    dong,
    khongCoQuyenQuenMk,
  };
}

/**
 * Tải số của mọi tab (đúng route từng tab tải) rồi dựng `KetQuaDemViec`. Không tab
 * nào trả được thì `null` (huy hiệu ẩn, không bịa số 0). `goi` = `fetch` — phép thử
 * giả ở biên giới mạng.
 */
export async function demViecCanXuLy(
  role?: string,
  goi: (url: string, init?: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
): Promise<KetQuaDemViec | null> {
  const demSo: Partial<Record<TabViecCanXuLy, number>> = {};
  let coNguonNaoOk = false;
  let khongCoQuyenQuenMk = false;
  await Promise.all(
    tabsChoVai(role).map(async (tab) => {
      try {
        const res = await goi(tab.api, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.data) return;
        coNguonNaoOk = true;
        if (tab.value === "quen-mat-khau" && json.data.coQuyen === false) khongCoQuyenQuenMk = true;
        demSo[tab.value] = tab.demSo(json.data);
      } catch {
        // Một tab hỏng thì coi là 0 — huy hiệu là phụ.
      }
    }),
  );
  if (!coNguonNaoOk) return null;
  return ketQuaDemViec(demSo, role, khongCoQuyenQuenMk);
}
