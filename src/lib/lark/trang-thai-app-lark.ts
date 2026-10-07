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
import { vi } from "@/i18n/vi";
import type { KhoiVungDuyet } from "@/lib/anh-chinh-sua/vong-duyet";

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
  "Bean xác nhận",
  "Chỉnh sửa",
  "Duyệt ảnh",
  "In & giao",
] as const;

interface DinhNghia {
  quanTri: string;
  /** Nhãn khách thấy (tiêu đề thẻ tiến trình) — giọng Bean, kết bằng "ạ" (BB-353). */
  khach: string;
  /**
   * BB-353 — câu trạng thái trên BÌA (gắn tên bé vào `{be}`). Cùng một dòng với
   * `khach`, nên bìa và thẻ tiến trình không thể nói hai trạng thái khác nhau.
   */
  bia: string;
  /** Chỉ số trong BUOC_KHACH; null = khách chưa thấy bộ ảnh ở trạng thái này. */
  buocKhach: number | null;
}

/** Bảng nhãn — docs/27 chép từ đây. */
export const TRANG_THAI_BO_ANH: Record<MaTrangThaiBoAnh, DinhNghia> = {
  moi_nhap: { quanTri: "Mới nhập", khach: "Bean đang chuẩn bị ảnh ạ", bia: "Bean đang chuẩn bị ảnh của {be} ạ.", buocKhach: null },
  dang_tai: { quanTri: "Đang tải ảnh", khach: "Bean đang chuẩn bị ảnh ạ", bia: "Bean đang chuẩn bị ảnh của {be} ạ.", buocKhach: null },
  loi_tai: { quanTri: "Lỗi tải", khach: "Bean đang chuẩn bị ảnh ạ", bia: "Bean đang chuẩn bị ảnh của {be} ạ.", buocKhach: null },
  cho_tao_link: { quanTri: "Chờ tạo Link app", khach: "Bean đang chuẩn bị ảnh ạ", bia: "Bean đang chuẩn bị ảnh của {be} ạ.", buocKhach: null },
  san_sang: { quanTri: "Sẵn sàng", khach: "Mời ba mẹ chọn ảnh ạ", bia: "Mời ba mẹ chọn ảnh cho {be} ạ.", buocKhach: 0 },
  cho_khach_chon: { quanTri: "Chờ khách chọn", khach: "Mời ba mẹ chọn ảnh ạ", bia: "Mời ba mẹ chọn ảnh cho {be} ạ.", buocKhach: 0 },
  cho_studio_xac_nhan: {
    quanTri: "Chờ studio xác nhận",
    khach: "Bean đang xác nhận danh sách ảnh ạ",
    bia: "Bean đang xác nhận danh sách ảnh của {be} ạ.",
    buocKhach: 1,
  },
  da_chon_hinh: {
    quanTri: "Đã chọn hình · chờ chỉnh sửa",
    khach: "Bean đã nhận danh sách, ảnh đang chờ chỉnh ạ",
    bia: "Bean đã nhận danh sách, ảnh của {be} đang chờ chỉnh ạ.",
    buocKhach: 1,
  },
  dang_chinh_sua: { quanTri: "Đang chỉnh sửa", khach: "Bean đang chỉnh ảnh ạ", bia: "Bean đang chỉnh ảnh của {be} ạ.", buocKhach: 2 },
  leader_kiem: { quanTri: "Leader đang kiểm ảnh", khach: "Bean đang chỉnh ảnh ạ", bia: "Bean đang chỉnh ảnh của {be} ạ.", buocKhach: 2 },
  cho_khach_duyet: {
    quanTri: "Chờ khách duyệt",
    khach: "Ảnh đã chỉnh xong, mời ba mẹ duyệt ạ",
    bia: "Ảnh của {be} đã chỉnh xong, mời ba mẹ duyệt ạ.",
    buocKhach: 3,
  },
  dang_sua_theo_yeu_cau: {
    quanTri: "Đang sửa theo yêu cầu",
    khach: "Bean đang sửa theo yêu cầu của ba mẹ ạ",
    bia: "Bean đang sửa ảnh của {be} theo yêu cầu của ba mẹ ạ.",
    buocKhach: 3,
  },
  da_chot_cho_in: {
    quanTri: "Đã chốt, chờ in",
    khach: "Ảnh đã chốt, Bean đang chuẩn bị in ạ",
    bia: "Ảnh của {be} đã chốt, Bean đang chuẩn bị in ạ.",
    buocKhach: 4,
  },
  dang_in: { quanTri: "Đã gửi in", khach: "Bean đang in sản phẩm ạ", bia: "Bean đang in sản phẩm cho {be} ạ.", buocKhach: 4 },
  hinh_da_ve: {
    quanTri: "Ảnh đã về, chờ giao",
    khach: "Sản phẩm đã về, mời ba mẹ ghé nhận ạ",
    bia: "Sản phẩm của {be} đã về, mời ba mẹ ghé nhận ạ.",
    buocKhach: 4,
  },
  da_giao: { quanTri: "Đã giao", khach: "Ảnh của bé đã hoàn thiện ạ", bia: "Ảnh của {be} đã hoàn thiện ạ.", buocKhach: 4 },
  da_cham_soc: { quanTri: "Đã chăm sóc khách", khach: "Ảnh của bé đã hoàn thiện ạ", bia: "Ảnh của {be} đã hoàn thiện ạ.", buocKhach: 4 },
  het_han: { quanTri: "Link đã hết hạn", khach: "Link đã hết hạn ạ", bia: "Link xem ảnh của {be} đã hết hạn ạ.", buocKhach: 0 },
  luu_tru: { quanTri: "Đã lưu trữ", khach: "Bộ ảnh không còn mở ạ", bia: "Bộ ảnh của {be} không còn mở ạ.", buocKhach: null },
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

/**
 * BB-353 (P0) — MỘT hàm trạng thái cho màn khách. Bìa (`cauBiaKhach`), thẻ
 * tiến trình, màn cảm ơn sau chốt, dải khoá đầu lưới và bìa của người thân
 * được mời đều đọc từ đây — không khối nào tự viết nhãn trạng thái riêng.
 *
 * Màn khách chỉ có `status` + `giaiDoanTienDo` (máy chủ đã tính giai đoạn Lark
 * còn hiệu lực, KHÔNG gửi mã Lark thô). Hàm đưa hai thứ đó về CÙNG bảng
 * `TRANG_THAI_BO_ANH` mà `trangThaiBoAnh()` (màn quản trị) dùng. Luật y như
 * `trangThaiBoAnh()`: giai đoạn Lark ≥ 2 là nguồn chuẩn, trừ lúc app đang chờ
 * duyệt; app đã giao mà Lark còn chậm thì tin app.
 *
 * `khoa`: bộ ảnh đang khoá chọn mà bảng vẫn ở bước "chọn ảnh" (khoá vì quá hạn
 * 60 ngày) → nói thật là đang tạm khoá, không mời chọn tiếp.
 */
export const TAM_KHOA_KHACH: Pick<DinhNghia, "khach" | "bia"> = {
  khach: "Bộ ảnh đang tạm khoá, ba mẹ nhắn Bean để được hỗ trợ ạ",
  bia: "Bộ ảnh của {be} đang tạm khoá, ba mẹ nhắn Bean để được hỗ trợ ạ.",
};

export function trangThaiKhach(
  status: string,
  giaiDoan: number | null,
  tuyChon: { khoa?: boolean } = {},
): TrangThaiBoAnh {
  let kq: TrangThaiBoAnh;
  if (giaiDoan != null && giaiDoan >= 2 && status !== "awaiting_approval") {
    kq = status === "delivered" && giaiDoan < 10 ? ra("da_giao") : ra(THEO_GIAI_DOAN_LARK[giaiDoan] ?? "da_chon_hinh", giaiDoan);
  } else {
    kq = trangThaiBoAnh({ status, coDriveLink: true, coLinkApp: true });
  }
  if (tuyChon.khoa && (kq.buocKhach ?? 0) === 0) return { ...kq, ...TAM_KHOA_KHACH };
  return kq;
}

/** Câu trạng thái trên bìa / màn cảm ơn, gắn tên bé (thiếu tên thì "bé"). */
export function cauBiaKhach(
  status: string,
  giaiDoan: number | null,
  tenBe?: string | null,
  tuyChon: { khoa?: boolean; khoiDuyet?: KhoiVungDuyet } = {},
): string {
  const tt = trangThaiKhach(status, giaiDoan, tuyChon);
  // BB-387 — bước "Duyệt ảnh" mà app CHƯA có ảnh chỉnh (`khoiVungDuyet` = "dang_chuan_bi",
  // BB-384): bìa nói CÙNG lời Bean với vùng duyệt và thẻ hành trình (BB-386), không
  // "đã chỉnh xong, mời ba mẹ duyệt". Luật nằm ở `khoiVungDuyet`; đây chỉ chọn chữ.
  const bia = tt.ma === "cho_khach_duyet" && tuyChon.khoiDuyet === "dang_chuan_bi" ? vi.gallery.anhChinh.chuanBiBia : tt.bia;
  return bia.replace("{be}", tenBe?.trim() || "bé");
}

/**
 * BB-353 — màn cảm ơn hiện NGAY sau khi bấm Xác nhận, lúc dữ liệu bộ ảnh trên
 * máy còn là trạng thái cũ ("ready"/"in_review"). Danh sách đã gửi đi rồi, nên
 * trạng thái nào còn ở bước "chọn ảnh" thì coi là vừa chốt (`submitted`).
 * (Phép thử e2e bắt được: màn cảm ơn từng nói "đang tạm khoá".)
 */
export function trangThaiVuaChot(status: string): string {
  return (trangThaiKhach(status, null).buocKhach ?? 0) > 0 ? status : "submitted";
}
