import { formatSo } from "@/lib/utils/dinh-dang";
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
  return `${formatSo(Math.round(n))}đ`;
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
  /*
    BB-296 mục #7 — báo cáo chấm độc lập lần 3: dòng "Ba mẹ chốt lựa chọn…"
    hiện người làm là "Ông bà (Mẹ Mai)" dù người chốt là chính ba mẹ. Kiểm
    ngược `src/app/api/g/submit/route.ts` dòng 102: route CHẶN
    `session.role !== "owner"` NGAY TỪ ĐẦU — chỉ link CHÍNH (owner) mới chốt
    được, không có đường nào để link phụ (ông bà) gọi tới đây. Nhưng dòng
    345 của route đó ghi `actor_label: input.confirmedByName` — TÊN BA MẸ TỰ
    GÕ vào ô xác nhận lúc chốt, khác hẳn Ý NGHĨA của `actorLabel` ở các
    action khác (nhãn LINK do CSKH đặt, vd "Ông bà ngoại"). `nguoiTuKhach`
    so khớp chuỗi đó với whitelist "chính chủ" — tên thật gần như không bao
    giờ khớp, nên MỌI lượt chốt đều hiện "Ông bà (tên)". Đây là APP GÁN SAI
    (không phải phép thử đặt tên nhầm) — `selection.submit` LUÔN là chính
    chủ theo đúng luật của route, nên không đi qua `nguoiTuKhach` mà hiện
    thẳng "Ba mẹ (tên xác nhận)".
  */
  if (dong.action === "selection.submit" || dong.action === "selection.round_submit") {
    const ten = (dong.actorLabel ?? "").trim();
    return ten ? `Ba mẹ (${ten})` : "Ba mẹ";
  }
  return nguoiTuKhach(dong.actorLabel);
}

type HamDich = (metadata: Record<string, unknown> | null | undefined) => string;

const TU_DIEN: Record<string, { nhom: NhomHoatDong; cau: HamDich }> = {
  "share_link.created": { nhom: "nhan_vien", cau: () => "Nhân viên tạo link app" },
  "share_link.reopened": { nhom: "nhan_vien", cau: () => "Nhân viên mở khoá lại link cũ" },
  "gallery.retouch_sent": { nhom: "nhan_vien", cau: () => "Nhân viên gửi ảnh đã chỉnh cho khách" },
  "gallery.confirm_retouch": { nhom: "nhan_vien", cau: () => "Nhân viên bắt đầu hậu kỳ ảnh" },
  // BB-379 — CSKH điền tên bé cho bộ chưa có. Không ghép tên bé vào câu (dữ liệu định danh trẻ em).
  "gallery.set_baby": { nhom: "nhan_vien", cau: () => "Nhân viên điền tên bé cho bộ ảnh" },
  "gallery.review_approved": { nhom: "khach", cau: () => "Ba mẹ duyệt ảnh đã chỉnh" },
  "gallery.review_revise": { nhom: "khach", cau: () => "Ba mẹ yêu cầu chỉnh sửa lại" },
  "gallery.reopen": {
    nhom: "nhan_vien",
    // BB-321 — mở lại đợt mua thêm ghi cùng action kèm `soDot` (≥ 2).
    cau: (m) => {
      const dot = so(m, "soDot");
      return dot !== null && dot >= 2 ? `Nhân viên mở lại đợt ${dot}` : "Nhân viên mở lại bộ ảnh";
    },
  },
  "gallery.reopen_requested": { nhom: "khach", cau: () => "Ba mẹ xin mở lại bộ ảnh để sửa" },
  // BB-312 — CSKH từ chối yêu cầu mở lại kèm lý do. Lý do là trường tự do
  // (nhân viên gõ tay) nên KHÔNG ghép vào câu — cùng luật ghi ở đầu tệp.
  "gallery.reopen_rejected": { nhom: "nhan_vien", cau: () => "Nhân viên từ chối yêu cầu mở lại" },
  "gallery.payment_recorded": {
    nhom: "tien",
    cau: (m) => {
      const amount = so(m, "amount") ?? 0;
      return amount < 0
        ? `Nhân viên ghi nhận hoàn ${formatVND(Math.abs(amount))}`
        : `Nhân viên ghi nhận thu ${formatVND(amount)}`;
    },
  },
  // BB-348 — hạn mức tự đổi theo sổ thu (han-muc-thanh-toan.ts); âm = dòng đính chính.
  "gallery.quota_by_payment": {
    nhom: "tien",
    cau: (m) => {
      const n = so(m, "soAnh") ?? 0;
      return n < 0 ? `Hạn mức giảm ${Math.abs(n)} do đính chính thanh toán` : `Hạn mức tăng ${n} do thanh toán`;
    },
  },
  "gallery.item_added": { nhom: "nhan_vien", cau: () => "Nhân viên thêm sản phẩm vào hợp đồng" },
  "gallery.item_changed": { nhom: "nhan_vien", cau: () => "Nhân viên đổi số lượng sản phẩm" },
  "gallery.item_removed": { nhom: "nhan_vien", cau: () => "Nhân viên xoá một sản phẩm" },
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
  /*
    BB-296 mục #7 — báo cáo chấm độc lập lần 3: dòng thời gian ghi "Thao tác
    khác" không nói rõ việc gì. Truy ngược `activity_logs` (`/api/g/addons/
    route.ts`) lộ ra nguyên nhân THẬT — không phải lỗi hiển thị mà là THIẾU
    HẲN hai mục từ điển: nhánh MUA NHIỀU TẤM CÙNG LÚC (BB-279, "Chọn ảnh" rồi
    "Thêm vào giỏ" ở cửa hàng — đúng luồng vừa sửa ở mục #1 của đợt này) ghi
    action `addon.batch_set`/`addon.batch_remove`, KHÁC với `addon.set`/
    `addon.remove` (mua một tấm từ "Đặt in tấm này") đã có sẵn ở trên. Hai
    action này chưa từng có trong từ điển — MỌI lượt mua nhiều tấm từ khi có
    BB-279 (27/09/2026) đều hiện "Thao tác khác" trên dòng thời gian.
  */
  "addon.batch_set": {
    nhom: "khach",
    cau: (m) => {
      const ten = chuoi(m, "productName");
      const soAnh = Array.isArray(m?.["photoIds"]) ? (m!["photoIds"] as unknown[]).length : null;
      if (ten && soAnh) return `Ba mẹ đặt thêm ${ten} cho ${soAnh} tấm`;
      if (ten) return `Ba mẹ đặt thêm ${ten}`;
      return "Ba mẹ đặt thêm sản phẩm cho nhiều tấm";
    },
  },
  "addon.batch_remove": {
    nhom: "khach",
    cau: (m) => {
      const ten = chuoi(m, "productName");
      const soAnh = Array.isArray(m?.["photoIds"]) ? (m!["photoIds"] as unknown[]).length : null;
      if (ten && soAnh) return `Ba mẹ bỏ ${ten} khỏi ${soAnh} tấm`;
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
  // BB-321 — đợt chọn thêm ảnh. Lý do từ chối là trường tự do (nhân viên gõ) nên
  // KHÔNG ghép vào câu — cùng luật ghi ở đầu tệp.
  "selection.round_submit": {
    nhom: "khach",
    cau: (m) => {
      const dot = so(m, "soDot");
      const n = so(m, "soAnh");
      if (dot !== null && n !== null) return `Ba mẹ chốt đợt ${dot} (${n} tấm)`;
      return dot !== null ? `Ba mẹ chốt đợt ${dot}` : "Ba mẹ chốt một đợt chọn thêm";
    },
  },
  "selection.round_confirm": {
    nhom: "nhan_vien",
    cau: (m) => {
      const dot = so(m, "soDot");
      return dot !== null ? `Nhân viên xác nhận đợt ${dot}` : "Nhân viên xác nhận một đợt chọn thêm";
    },
  },
  "selection.round_reject": {
    nhom: "nhan_vien",
    cau: (m) => {
      const dot = so(m, "soDot");
      return dot !== null ? `Nhân viên từ chối đợt ${dot}` : "Nhân viên từ chối một đợt chọn thêm";
    },
  },
  "gallery.cover.change": { nhom: "nhan_vien", cau: () => "Nhân viên đổi bìa bộ ảnh" },
  "gallery.drive_folder.change": { nhom: "nhan_vien", cau: () => "Nhân viên đổi thư mục ảnh gốc" },
  "gallery.export": { nhom: "nhan_vien", cau: () => "Nhân viên xuất báo cáo bộ ảnh" },
  "gallery.sync_requested": { nhom: "nhan_vien", cau: () => "Nhân viên đồng bộ lại ảnh từ Drive" },
  // BB-392 — cron 08:00 thấy thư mục ảnh chỉnh sửa trên Drive, kéo ảnh về (chưa gửi khách).
  "gallery.anh_chinh_tu_quet": {
    nhom: "he_thong",
    cau: () => "Hệ thống thấy thư mục ảnh chỉnh sửa trên Drive, kéo ảnh về — chờ CSKH gửi khách duyệt",
  },
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
