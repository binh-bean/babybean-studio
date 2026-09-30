/**
 * BB-332 — MỘT hàm cho trạng thái bộ ảnh của app ↔ cột "Trạng Thái" bảng Hậu Kỳ
 * trên Lark. Màn quản trị và màn khách (BB-329) cùng gọi `trangThaiBoAnh()`,
 * không tự suy nhãn riêng nữa.
 *
 * Bảng ánh xạ đầy đủ (nguồn cho tài liệu vận hành): docs/27-trang-thai-app-lark.md.
 * Sửa hàm này thì sửa bảng đó trong cùng lần thay đổi.
 *
 * HÀM THUẦN: không gọi mạng, không đụng cơ sở dữ liệu.
 *
 * Luật của chủ studio (30/09/2026, yêu cầu zqqwhwi9 + w3ung0bb):
 *   Mới nhập → (có link Drive) Lỗi tải | Sẵn sàng → Lark "Đã gửi file gốc" →
 *   Chờ khách chọn → khách bấm chốt → Chờ studio xác nhận → CSKH xác nhận →
 *   Đã chọn hình (xếp hàng chỉnh) → Lark "Đang làm" → Đang chỉnh sửa → …
 *
 * Hai điều cố ý:
 *   1. Lark ≥ "Đã chọn hình" là nguồn chuẩn (BB-285), TRỪ `awaiting_approval`:
 *      lúc đó màn khách có nút duyệt/xin sửa sống của app.
 *   2. "Đang chỉnh sửa" CHỈ khi Lark ở "Đang làm" trở đi. CSKH xác nhận mà Lark
 *      chưa "Đang làm" thì bộ ảnh đang XẾP HÀNG — khách không được thấy "đang
 *      chỉnh" khi chưa ai chỉnh.
 */
import { giaiDoanCua } from "@/lib/lark/trang-thai-hau-ky";
import { maLarkConHieuLuc } from "@/lib/gallery-status";

export type MaTrangThaiBoAnh =
  | "moi_nhap"
  | "dang_tai"
  | "loi_tai"
  | "cho_tao_link"
  | "san_sang"
  | "cho_khach_chon"
  | "cho_studio_xac_nhan"
  | "da_chon_hinh"
  | "dang_chinh_sua"
  | "leader_kiem"
  | "cho_khach_duyet"
  | "dang_sua_theo_yeu_cau"
  | "da_chot_cho_in"
  | "dang_in"
  | "hinh_da_ve"
  | "da_giao"
  | "da_cham_soc"
  | "het_han"
  | "luu_tru";

/** Các bước của thanh tiến độ bên khách (BB-329 vẽ theo mảng này). */
export const BUOC_KHACH = [
  "Chọn ảnh",
  "Studio xác nhận",
  "Chỉnh sửa",
  "Duyệt ảnh",
  "In & giao",
] as const;

interface DinhNghia {
  quanTri: string;
  khach: string;
  /** Chỉ số trong BUOC_KHACH; null = khách chưa thấy bộ ảnh ở trạng thái này. */
  buocKhach: number | null;
}

/** Bảng nhãn — docs/27 chép từ đây. */
export const TRANG_THAI_BO_ANH: Record<MaTrangThaiBoAnh, DinhNghia> = {
  moi_nhap: { quanTri: "Mới nhập", khach: "Studio đang chuẩn bị ảnh", buocKhach: null },
  dang_tai: { quanTri: "Đang tải ảnh", khach: "Studio đang chuẩn bị ảnh", buocKhach: null },
  loi_tai: { quanTri: "Lỗi tải", khach: "Studio đang chuẩn bị ảnh", buocKhach: null },
  cho_tao_link: { quanTri: "Chờ tạo Link app", khach: "Studio đang chuẩn bị ảnh", buocKhach: null },
  san_sang: { quanTri: "Sẵn sàng", khach: "Mời ba mẹ chọn ảnh", buocKhach: 0 },
  cho_khach_chon: { quanTri: "Chờ khách chọn", khach: "Mời ba mẹ chọn ảnh", buocKhach: 0 },
  cho_studio_xac_nhan: {
    quanTri: "Chờ studio xác nhận",
    khach: "Đang chờ studio xác nhận",
    buocKhach: 1,
  },
  da_chon_hinh: {
    quanTri: "Đã chọn hình · chờ chỉnh sửa",
    khach: "Studio đã ghi nhận yêu cầu",
    buocKhach: 1,
  },
  dang_chinh_sua: { quanTri: "Đang chỉnh sửa", khach: "Đang chỉnh sửa", buocKhach: 2 },
  leader_kiem: { quanTri: "Leader đang kiểm ảnh", khach: "Đang chỉnh sửa", buocKhach: 2 },
  cho_khach_duyet: {
    quanTri: "Chờ khách duyệt",
    khach: "Ảnh đã chỉnh xong, mời ba mẹ duyệt",
    buocKhach: 3,
  },
  dang_sua_theo_yeu_cau: {
    quanTri: "Đang sửa theo yêu cầu",
    khach: "Đang sửa theo yêu cầu của ba mẹ",
    buocKhach: 3,
  },
  da_chot_cho_in: { quanTri: "Đã chốt, chờ in", khach: "Đã chốt ảnh, đang chuẩn bị in", buocKhach: 4 },
  dang_in: { quanTri: "Đã gửi in", khach: "Đang in", buocKhach: 4 },
  hinh_da_ve: { quanTri: "Ảnh đã về, chờ giao", khach: "Sản phẩm đã về, mời ba mẹ ghé nhận", buocKhach: 4 },
  da_giao: { quanTri: "Đã giao", khach: "Đã giao", buocKhach: 4 },
  da_cham_soc: { quanTri: "Đã chăm sóc khách", khach: "Đã giao", buocKhach: 4 },
  het_han: { quanTri: "Link đã hết hạn", khach: "Link đã hết hạn", buocKhach: 0 },
  luu_tru: { quanTri: "Đã lưu trữ", khach: "Bộ ảnh không còn mở", buocKhach: null },
};

/** Giai đoạn Lark (trang-thai-hau-ky.ts) → trạng thái app, từ "Đã chọn hình" trở đi. */
const THEO_GIAI_DOAN_LARK: Record<number, MaTrangThaiBoAnh> = {
  2: "da_chon_hinh",
  3: "dang_chinh_sua",
  4: "leader_kiem",
  5: "cho_khach_duyet",
  6: "dang_sua_theo_yeu_cau",
  7: "da_chot_cho_in",
  8: "dang_in",
  9: "hinh_da_ve",
  10: "da_giao",
  11: "da_cham_soc",
};

export interface DauVaoTrangThai {
  /** galleries.status; null = chưa có bộ ảnh (bản ghi mới từ Lark). */
  status: string | null;
  /** galleries.lark_trang_thai — MÃ lựa chọn (optDAI9nFV…), không phải tên. */
  larkTrangThai?: string | null;
  larkTrangThaiTu?: string | Date | null;
  reopenedAt?: string | Date | null;
  /** Bộ ảnh neo vào một dòng Hậu Kỳ (lark_hauky_record_id có giá trị). */
  coBanGhiLark?: boolean;
  /** Có link thư mục Drive. */
  coDriveLink: boolean;
  /** Link Drive đã thuộc một bộ/bản ghi khác (luồng BB-325 hỏi nhân viên chọn). */
  linkTrung?: boolean;
  /** Có Link app (share link còn dùng được). */
  coLinkApp: boolean;
}

export interface TrangThaiBoAnh extends DinhNghia {
  ma: MaTrangThaiBoAnh;
  /** Giai đoạn Lark đã dùng; null = nhãn theo app. */
  giaiDoanLark: number | null;
}

function ra(ma: MaTrangThaiBoAnh, giaiDoanLark: number | null = null): TrangThaiBoAnh {
  return { ma, giaiDoanLark, ...TRANG_THAI_BO_ANH[ma] };
}

/**
 * Trạng thái + nhãn hai màn của một bộ ảnh (hoặc một bản ghi Lark chưa thành
 * bộ ảnh khi `status = null`).
 */
export function trangThaiBoAnh(v: DauVaoTrangThai): TrangThaiBoAnh {
  const s = v.status;
  if (s === null) return ra(v.coDriveLink && v.linkTrung ? "loi_tai" : "moi_nhap");
  if (s === "archived") return ra("luu_tru");

  const ma = maLarkConHieuLuc({
    lark_trang_thai: v.larkTrangThai ?? null,
    lark_trang_thai_tu: v.larkTrangThaiTu ?? null,
    reopened_at: v.reopenedAt ?? null,
  });
  const gd = giaiDoanCua(ma);

  // Lark là nguồn từ "Đã chọn hình" trở đi (BB-285), trừ lúc app đang chờ duyệt.
  if (gd !== null && gd >= 2 && s !== "awaiting_approval") {
    // App đã ghi "đã giao" mà Lark còn chậm: tin app, không lùi nhãn.
    if (s === "delivered" && gd < 10) return ra("da_giao");
    return ra(THEO_GIAI_DOAN_LARK[gd] ?? "da_chon_hinh", gd);
  }

  switch (s) {
    case "draft":
    case "syncing":
      if (!v.coDriveLink) return ra("moi_nhap");
      return ra(v.linkTrung ? "loi_tai" : "dang_tai");
    case "sync_error":
      return ra("loi_tai");
    case "ready":
      if (v.linkTrung) return ra("loi_tai");
      if (!v.coLinkApp) return ra("cho_tao_link");
      // Neo Lark mà Lark chưa "Đã gửi file gốc" → Sẵn sàng; bộ cũ không neo Lark
      // thì app không biết gì hơn → coi như đã gửi khách.
      if (v.coBanGhiLark && gd === null) return ra("san_sang");
      return ra("cho_khach_chon", gd);
    case "in_review":
    case "reopened":
      return ra("cho_khach_chon", gd);
    case "submitted":
      return ra("cho_studio_xac_nhan");
    case "in_retouch":
      // CSKH đã xác nhận, Lark chưa "Đang làm" → xếp hàng, KHÔNG "đang chỉnh".
      return ra("da_chon_hinh");
    case "awaiting_approval":
      return ra("cho_khach_duyet");
    case "approved":
      return ra("da_chot_cho_in");
    case "delivered":
      return ra("da_giao");
    case "expired":
      return ra("het_han");
    default:
      return ra("moi_nhap");
  }
}
