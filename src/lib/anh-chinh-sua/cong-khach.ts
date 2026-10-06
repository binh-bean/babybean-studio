/**
 * BB-371 — cổng ảnh phía KHÁCH, hàm thuần (không mạng, không DB).
 *
 * Hai route đọc ảnh cho khách dùng đúng các hàm này, để phép thử đơn vị canh
 * được luật (và kiểm ngược được) mà không phải chạm bb-dev:
 *   - `/api/g/photos` (lưới chọn ảnh gốc) → `locLuoiAnhGoc`
 *   - `/api/img/[photoId]` (byte ảnh)    → `quyetDinhAnhChoKhach`
 */

import { laThuMucChinhSua, khachThayAnhChinh } from "./nhan-dien";

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
}

/**
 * - `cam`  (403): tấm ảnh không thuộc bộ/nhà của phiên này.
 * - `an`   (404): đúng bộ của mình, nhưng là ảnh chỉnh CSKH chưa gửi (hoặc về sau lần gửi).
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
  if (laThuMucChinhSua(v.subfolder) && !khachThayAnhChinh(v.trangThaiBo, v.guiLuc, v.anhTaoLuc)) return "an";
  return "cho_xem";
}
