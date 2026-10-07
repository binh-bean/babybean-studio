/**
 * BB-371 — cổng ảnh phía KHÁCH, hàm thuần (không mạng, không DB).
 *
 * Hai route đọc ảnh cho khách dùng đúng các hàm này, để phép thử đơn vị canh
 * được luật (và kiểm ngược được) mà không phải chạm bb-dev:
 *   - `/api/g/photos` (lưới chọn ảnh gốc) → `locLuoiAnhGoc`
 *   - `/api/img/[photoId]` (byte ảnh)    → `quyetDinhAnhChoKhach`
 */

import { laThuMucChinhSua } from "./nhan-dien";
import { KHOA_TRONG_GOI, khachThayAnhChinhTheoDot, type MocDot } from "./theo-dot";

/**
 * Lưới chọn ảnh gốc: bỏ MỌI ảnh trong thư mục ảnh chỉnh sửa — đã gửi hay chưa.
 * Khách xem ảnh chỉnh ở khối riêng ("Ảnh đã chỉnh"), không bao giờ trong lưới chọn.
 */
export function locLuoiAnhGoc<T extends { subfolder: string | null }>(trang: readonly T[]): T[] {
  return trang.filter((p) => !laThuMucChinhSua(p.subfolder));
}

export interface DauVaoAnhKhach {
  /** Phiên khách: bộ đã ký (link theo bộ) và/hoặc khách (link gia đình). */
  phienGalleryId: string | null | undefined;
  phienCustomerId: string | null | undefined;
  /** Tấm ảnh: thuộc bộ nào, bộ đó của khách nào, trạng thái bộ. */
  anhGalleryId: string;
  boCustomerId: string | null | undefined;
  trangThaiBo: string;
  subfolder: string | null | undefined;
  anhTaoLuc: string | null | undefined;
  /** Mốc CSKH "Gửi khách duyệt" (chỉ cần khi tấm là ảnh chỉnh). */
  guiLuc: string | null | undefined;
  /** BB-377 — đợt của tấm ảnh chỉnh ("goc" | "dot:N" | "mt:<id>"); thiếu = trong gói. */
  khoa?: string;
  /** BB-377 — mốc từng đợt mua thêm; thiếu/null = chưa áp 0095 (luật cũ). */
  mocDot?: ReadonlyMap<string, MocDot> | null;
}

/**
 * - `cam`  (403): tấm ảnh không thuộc bộ/nhà của phiên này.
 * - `an`   (404): đúng bộ của mình, nhưng là ảnh chỉnh CSKH chưa gửi (hoặc về sau lần gửi;
 *               BB-377: ảnh mua thêm theo mốc gửi của ĐÚNG đợt nó).
 * - `cho_xem`.
 */
export function quyetDinhAnhChoKhach(v: DauVaoAnhKhach): "cho_xem" | "cam" | "an" {
  // BB-334A — link theo bộ: đúng bộ đã ký. Link gia đình: đúng khách; `customer_id`
  // rỗng hai đầu KHÔNG được coi là khớp (bộ mồ côi không mở cho mọi phiên).
  const laLinkTheoBoAnh = !v.phienCustomerId;
  const dungChu = laLinkTheoBoAnh
    ? !!v.phienGalleryId && v.phienGalleryId === v.anhGalleryId
    : !!v.phienCustomerId && v.phienCustomerId === v.boCustomerId;
  if (!dungChu) return "cam";
  if (
    laThuMucChinhSua(v.subfolder) &&
    !khachThayAnhChinhTheoDot({
      trangThaiBo: v.trangThaiBo,
      khoa: v.khoa ?? KHOA_TRONG_GOI,
      mocChung: v.guiLuc,
      mocDot: v.mocDot ?? null,
      anhTaoLuc: v.anhTaoLuc,
    })
  )
    return "an";
  return "cho_xem";
}
