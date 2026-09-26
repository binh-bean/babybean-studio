/**
 * Dịch một dòng `activity_logs` thành câu tiếng Việt dễ đọc cho khối "Dòng
 * thời gian hoạt động" ở màn chi tiết bộ ảnh quản trị.
 *
 * OWNER: task BB-259.
 *
 * ---------------------------------------------------------------------------
 * Hàm THUẦN — không gọi mạng, không đọc DB
 * ---------------------------------------------------------------------------
 * Mọi thứ cần để dịch một dòng phải nằm trong tham số truyền vào. Tên nhân
 * viên (`staff_profiles.full_name`) được tra SẴN bởi route gọi hàm này rồi
 * mới truyền xuống — file này không biết Supabase là gì, nên thử được bằng
 * Vitest thường, không cần mock DB.
 *
 * ---------------------------------------------------------------------------
 * KHÔNG đưa dữ liệu cá nhân của khách vào câu
 * ---------------------------------------------------------------------------
 * `metadata` của một số action (vd `mua_them.yeu_cau`) có thể mang tên/SĐT đã
 * che của khách mua thêm — đó là dữ liệu của một NGƯỜI KHÁC, không phải chủ bộ
 * ảnh đang xem màn hình này. Chỉ những trường "an toàn" (số lượng, trạng thái,
 * tên sản phẩm trong catalogue, số tiền) mới được ghép vào câu. Trường tự do
 * do nhân viên gõ tay (`lyDo`, `ghiChuCskh`, `note`, `ghi_chu`…) KHÔNG BAO GIỜ
 * được ghép vào câu — người gõ có thể lỡ tay chép tên khách vào đó.
 */

export type NhomHoatDong = "khach" | "nhan_vien" | "tien" | "he_thong";

/** Dữ liệu tối thiểu để dịch MỘT dòng nhật ký. */
export interface DongNhatKyDeDich {
  action: string;
  actorType: "staff" | "customer" | "system";
  /** Nhãn ghi tại thời điểm log — vai trò/nhãn link, KHÔNG PHẢI tên khách. */
  actorLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Tra sẵn từ `staff_profiles.full_name` khi actorType === "staff". */
  staffFullName?: string | null;
}

export interface KetQuaDich {
  nhom: string;
  cau: string;
}

function so(metadata: Record<string, unknown> | null | undefined, key: string): number | null {
  const v = metadata?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function chuoi(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = metadata?.[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function formatVND(n: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))}đ`;
}

const TEN_TRANG_THAI_MUA_THEM: Record<string, string> = {
  moi: "Mới gửi",
  da_lien_he: "Đã gọi khách",
  da_chot: "Đã chốt",
  huy: "Đã huỷ",
};

/**
 * Câu cho khách (`actorType === "customer"`).
 *
 * `actorLabel` ở các route ghi log là NHÃN LINK chia sẻ (`share_links.label`
 * — "Khách chính", "Ông nội", "Bà ngoại"…), không phải tên riêng của khách.
 * Route `gallery.auth` không ghi actorLabel; addon/mời-người-thân ghi hằng
 * "Customer" làm chỗ trống. Cả ba trường hợp đó đều quy về "Ba mẹ" — chỉ nhãn
 * KHÁC "chính chủ" mới hiện thành "Ông bà (nhãn link)".
 */
function nguoiTuKhach(actorLabel: string | null | undefined): string {
  const nhan = (actorLabel ?? "").trim().toLowerCase();
  const LA_CHINH_CHU = new Set(["", "khách", "khach", "khách chính", "khach chinh", "customer"]);
  if (LA_CHINH_CHU.has(nhan)) return "Ba mẹ";
  return `Ông bà (${(actorLabel ?? "").trim()})`;
}

function nguoiTuNhanVien(staffFullName: string | null | undefined, actorLabel: string | null | undefined): string {
  return staffFullName?.trim() || actorLabel?.trim() || "Nhân viên";
}

/** Suy người thực hiện — dùng trực tiếp bởi route và bởi phép thử. */
export function suyNguoi(dong: DongNhatKyDeDich): string {
  if (dong.actorType === "staff") return nguoiTuNhanVien(dong.staffFullName, dong.actorLabel);
  if (dong.actorType === "system") return "Hệ thống";
  return nguoiTuKhach(dong.actorLabel);
}

type HamDich = (metadata: Record<string, unknown> | null | undefined) => string;

const TU_DIEN: Record<string, { nhom: NhomHoatDong; cau: HamDich }> = {
  "share_link.created": { nhom: "nhan_vien", cau: () => "Nhân viên tạo link gửi khách" },
  "share_link.reopened": { nhom: "nhan_vien", cau: () => "Nhân viên mở khoá lại link cũ" },
  "gallery.retouch_sent": { nhom: "nhan_vien", cau: () => "Nhân viên gửi ảnh đã chỉnh cho khách" },
  "gallery.confirm_retouch": { nhom: "nhan_vien", cau: () => "Nhân viên bắt đầu hậu kỳ ảnh" },
  "gallery.review_approved": { nhom: "khach", cau: () => "Ba mẹ duyệt ảnh đã chỉnh" },
  "gallery.review_revise": { nhom: "khach", cau: () => "Ba mẹ yêu cầu chỉnh sửa lại" },
  "gallery.reopen": { nhom: "nhan_vien", cau: () => "Nhân viên mở lại bộ ảnh" },
  "gallery.reopen_requested": { nhom: "khach", cau: () => "Ba mẹ xin mở lại bộ ảnh để sửa" },
  "gallery.payment_recorded": {
    nhom: "tien",
    cau: (m) => {
      const amount = so(m, "amount") ?? 0;
      return amount < 0
        ? `Nhân viên ghi nhận hoàn ${formatVND(Math.abs(amount))}`
        : `Nhân viên ghi nhận thu ${formatVND(amount)}`;
    },
  },
  "gallery.item_added": { nhom: "nhan_vien", cau: () => "Nhân viên thêm dòng hàng vào hợp đồng" },
  "gallery.item_changed": { nhom: "nhan_vien", cau: () => "Nhân viên đổi số lượng dòng hàng" },
  "gallery.item_removed": { nhom: "nhan_vien", cau: () => "Nhân viên xoá một dòng hàng" },
  "addon.set": {
    nhom: "khach",
    cau: (m) => {
      const ten = chuoi(m, "productName");
      const soLuong = so(m, "quantity");
      if (ten && soLuong) return `Ba mẹ đặt thêm ${soLuong} ${ten}`;
      if (ten) return `Ba mẹ đặt thêm ${ten}`;
      return "Ba mẹ đặt thêm sản phẩm";
    },
  },
  "addon.remove": {
    nhom: "khach",
    cau: (m) => {
      const ten = chuoi(m, "productName");
      return ten ? `Ba mẹ bỏ sản phẩm đặt thêm (${ten})` : "Ba mẹ bỏ sản phẩm đặt thêm";
    },
  },
  "gallery.auth": { nhom: "khach", cau: () => "Ba mẹ mở link lần đầu" },
  "mua_them.yeu_cau": {
    nhom: "khach",
    cau: (m) => {
      const soDong = so(m, "soDong");
      return soDong ? `Ba mẹ gửi yêu cầu mua thêm ${soDong} sản phẩm` : "Ba mẹ gửi yêu cầu mua thêm";
    },
  },
  "mua_them.doi_trang_thai": {
    nhom: "nhan_vien",
    cau: (m) => {
      const den = chuoi(m, "denTrangThai");
      const nhan = den ? TEN_TRANG_THAI_MUA_THEM[den] ?? den : null;
      return nhan
        ? `Nhân viên chuyển yêu cầu mua thêm sang "${nhan}"`
        : "Nhân viên đổi trạng thái yêu cầu mua thêm";
    },
  },
  "moi_nguoi_than.tao": {
    nhom: "khach",
    cau: (m) => {
      const nhan = chuoi(m, "nhan");
      return nhan ? `Ba mẹ mời thêm người thân xem ảnh (${nhan})` : "Ba mẹ mời thêm người thân xem ảnh";
    },
  },
  "moi_nguoi_than.thu_hoi": { nhom: "khach", cau: () => "Ba mẹ thu hồi link người thân" },
  "selection.patch": {
    nhom: "khach",
    cau: (m) => {
      const n = so(m, "applied") ?? 1;
      return `Ba mẹ chọn/bỏ ${n} tấm`;
    },
  },
  "selection.submit": {
    nhom: "khach",
    cau: (m) => {
      const n = so(m, "selectedCount");
      return n !== null ? `Ba mẹ chốt lựa chọn ${n} tấm` : "Ba mẹ chốt lựa chọn ảnh";
    },
  },
  "gallery.cover.change": { nhom: "nhan_vien", cau: () => "Nhân viên đổi bìa bộ ảnh" },
  "gallery.drive_folder.change": { nhom: "nhan_vien", cau: () => "Nhân viên đổi thư mục ảnh gốc" },
  "gallery.export": { nhom: "nhan_vien", cau: () => "Nhân viên xuất báo cáo bộ ảnh" },
  "gallery.sync_requested": { nhom: "nhan_vien", cau: () => "Nhân viên đồng bộ lại ảnh từ Drive" },
};

/**
 * Dịch action + metadata thành { nhom, cau }. Action lạ (chưa có trong từ
 * điển) trả câu chung "Thao tác khác" và đặt CHÍNH action đó vào `nhom` — để
 * còn thấy được tên kỹ thuật ở đâu đó khi cần tra, mà không làm vỡ màn hình.
 */
export function dichHoatDong(action: string, metadata?: Record<string, unknown> | null): KetQuaDich {
  const muc = TU_DIEN[action];
  if (!muc) return { nhom: action, cau: "Thao tác khác" };
  try {
    return { nhom: muc.nhom, cau: muc.cau(metadata) };
  } catch {
    // Một trường metadata sai kiểu không được phép làm vỡ cả màn hình.
    return { nhom: muc.nhom, cau: "Thao tác khác" };
  }
}
