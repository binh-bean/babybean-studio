/**
 * BB-382 — ai được MỞ màn chi tiết một bộ ảnh, và mở ra thì được BẤM gì.
 *
 * Bối cảnh: cột "Link quản lý bộ ảnh" bên Lark (Hậu Kỳ) trỏ thẳng vào
 * `/admin/galleries/<id>` cho MỌI dòng, và nhân viên mọi vai bấm vào để kiểm sản
 * phẩm — không chỉ Admin. Trước bản vá này:
 *   · route GET chi tiết chỉ xét chi nhánh, nên CTV chỉnh ảnh (không có
 *     `galleries:all_in_branch`) đọc được MỌI bộ trong chi nhánh, trái với luật
 *     RLS `galleries_select` (0056: chỉ bộ có `editor_id` = mình);
 *   · màn hình bày đủ nút ghi (xác nhận thanh toán, đổi link, gửi khách…) cho
 *     cả vai không có quyền — bấm rồi mới bị route từ chối.
 *
 * Hàm ở đây hỏi BỘ QUYỀN (ADR-0007), không hỏi tên vai: vai tự tạo cũng đi
 * đúng đường. Không đổi ma trận quyền — chỉ đọc nó.
 */

export type LyDoChanBoAnh = "chua-co-quyen-xem" | "khac-chi-nhanh" | "chua-duoc-giao";

interface PhienToiThieu {
  staffId: string;
  permissions: string[];
  branchIds: string[];
}

interface BoAnhToiThieu {
  branch_id: string;
  editor_id: string | null;
}

/**
 * `null` = được xem. Thứ tự xét: quyền xem → chi nhánh → được giao.
 * Cùng luật với RLS `galleries_select` (db/migrations/0056): thấy được bộ khi
 * đúng chi nhánh VÀ (thấy mọi bộ trong chi nhánh HOẶC là người được giao).
 */
export function xetQuyenXemBoAnh(staff: PhienToiThieu, bo: BoAnhToiThieu): LyDoChanBoAnh | null {
  const q = staff.permissions;
  if (!q.includes("galleries:read")) return "chua-co-quyen-xem";
  if (q.includes("system:superuser")) return null;
  if (!staff.branchIds.includes(bo.branch_id)) return "khac-chi-nhanh";
  if (!q.includes("galleries:all_in_branch") && bo.editor_id !== staff.staffId) return "chua-duoc-giao";
  return null;
}

/** Câu màn hình nói với nhân viên — ngắn, nói lý do và nói phải làm gì. */
export const CAU_CHAN_BO_ANH: Record<LyDoChanBoAnh, { tieuDe: string; giaiThich: string }> = {
  "chua-co-quyen-xem": {
    tieuDe: "Vai của bạn chưa có quyền xem bộ ảnh",
    giaiThich: "Nhờ Admin cấp quyền “Xem danh sách và chi tiết album” cho vai của bạn.",
  },
  "khac-chi-nhanh": {
    tieuDe: "Bộ ảnh này thuộc chi nhánh khác",
    giaiThich: "Bạn chỉ xem được bộ ảnh của chi nhánh mình. Cần xem thì nhờ Admin thêm chi nhánh cho bạn.",
  },
  "chua-duoc-giao": {
    tieuDe: "Bạn chưa được giao bộ này",
    giaiThich: "Vai của bạn chỉ xem được bộ ảnh mình được giao chỉnh. Nhờ CSKH hoặc Admin giao bộ này cho bạn.",
  },
};

/**
 * Nút nào hiện trên màn chi tiết. Mỗi cờ khớp ĐÚNG quyền mà route API của nút
 * đó đòi (xem `requirePermission` trong src/app/api/admin/galleries/[id]/**) —
 * màn hình chỉ thôi bày ra thứ chắc chắn bị từ chối; route vẫn là ranh giới.
 */
/**
 * BB-383 (anh chốt 06/10) — hai thao tác tách khỏi `galleries:write` để cấp
 * riêng cho thợ, không phải cho họ quyền sửa cả bộ ảnh:
 *   · "Đồng bộ ảnh" (route `[id]/sync`, và "Kiểm tra lại" một bộ) — thợ chụp
 *     bấm được bằng quyền `galleries:sync` có sẵn từ 0052;
 *   · "Gửi khách duyệt" ảnh chỉnh (route `[id]/anh-chinh-sua/gui-khach`) —
 *     thợ chỉnh bấm được bằng quyền mới `anh_chinh:gui_khach` (migration 0099).
 * Ai có `galleries:write` vẫn bấm được cả hai như trước — không ai mất quyền.
 */
export const QUYEN_GUI_KHACH_DUYET = "anh_chinh:gui_khach";
export const CAC_QUYEN_DONG_BO: readonly string[] = ["galleries:sync", "galleries:write"];
export const CAC_QUYEN_GUI_KHACH_DUYET: readonly string[] = [QUYEN_GUI_KHACH_DUYET, "galleries:write"];

/**
 * BB-383b (anh chốt 07/10: "Chỉ sửa thông tin bộ, không tiền") — thợ chụp sửa
 * THÔNG TIN bộ ảnh mà không có `galleries:write`. Ba route nhận quyền này HOẶC
 * `galleries:write`: `[id]/drive` (thư mục ảnh gốc), `[id]/ten-be` (tên bé),
 * `[id]/bia` (ảnh bìa, tiêu đề, lời chào). Mọi route tiền / xác nhận / dòng
 * hàng / hợp đồng / gửi khách vẫn đòi `galleries:write` (hoặc quyền riêng của nó).
 */
export const QUYEN_SUA_THONG_TIN = "galleries:edit_info";
export const CAC_QUYEN_SUA_THONG_TIN: readonly string[] = [QUYEN_SUA_THONG_TIN, "galleries:write"];

/** Có ít nhất một quyền trong danh sách. */
export function coMotTrongCacQuyen(permissions: string[], cacQuyen: readonly string[]): boolean {
  return cacQuyen.some((q) => permissions.includes(q));
}

export interface QuyenThaoTacBoAnh {
  /** `galleries:write` — dòng hàng, thu tiền, xác nhận, hợp đồng, gắn Lark, mua thêm. */
  ghi: boolean;
  /** `galleries:edit_info` HOẶC `galleries:write` — đổi thư mục, tên bé, bìa (BB-383b). */
  suaThongTin: boolean;
  /** `galleries:sync` HOẶC `galleries:write` — nút "Đồng bộ ảnh"/"Kiểm tra lại" (BB-383). */
  dongBo: boolean;
  /** `anh_chinh:gui_khach` HOẶC `galleries:write` — nút "Gửi khách duyệt" ảnh chỉnh (BB-383). */
  guiAnhChinh: boolean;
  /** `galleries:share` — tạo/gia hạn link, chuẩn bị ảnh bìa, link gia đình. */
  guiLink: boolean;
  /** `galleries:reopen` */
  moLai: boolean;
  /** `deliveries:write` */
  daGiao: boolean;
  /** `galleries:export` — khối "Xuất danh sách ảnh đã chọn". */
  xuat: boolean;
}

export function quyenThaoTacBoAnh(permissions: string[]): QuyenThaoTacBoAnh {
  return {
    ghi: permissions.includes("galleries:write"),
    suaThongTin: coMotTrongCacQuyen(permissions, CAC_QUYEN_SUA_THONG_TIN),
    dongBo: coMotTrongCacQuyen(permissions, CAC_QUYEN_DONG_BO),
    guiAnhChinh: coMotTrongCacQuyen(permissions, CAC_QUYEN_GUI_KHACH_DUYET),
    guiLink: permissions.includes("galleries:share"),
    moLai: permissions.includes("galleries:reopen"),
    daGiao: permissions.includes("deliveries:write"),
    xuat: permissions.includes("galleries:export"),
  };
}

/** Đường dẫn quay lại sau đăng nhập — giữ đúng id/mã hoá đơn trên địa chỉ. */
export function duongDanSauDangNhap(idTrenDiaChi: string): string {
  let id = idTrenDiaChi;
  try {
    id = decodeURIComponent(idTrenDiaChi);
  } catch {
    // Chuỗi % hỏng — dùng nguyên văn.
  }
  return `/login?next=${encodeURIComponent(`/admin/galleries/${encodeURIComponent(id)}`)}`;
}
