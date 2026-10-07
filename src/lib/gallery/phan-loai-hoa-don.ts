/**
 * BB-381 — "124 bộ ảnh không có tấm nào" (Bản yêu cầu P0). Toán thuần: không DB, không mạng.
 *
 * Nguyên lý anh chốt:
 *   · Hoá đơn KHÔNG có dịch vụ chụp hình → hoá đơn MUA THÊM dịch vụ hậu kỳ (in thêm ảnh,
 *     chỉnh thêm file…) của khách CŨ. Không phải "bộ ảnh rỗng lỗi": gắn vào bộ gốc của
 *     khách, theo dõi tới khi giao, không gửi link cho khách.
 *   · Hoá đơn CÓ gói chụp mà chưa có ảnh → cảnh báo CSKH xử lý (kèm lý do).
 *
 * "Dịch vụ chụp" đọc từ `products.kind` của các dòng hoá đơn (`gallery_items`, kéo từ
 * Lark bằng `keoDongHopDongTuLark`):
 *   · `shoot_package` (Baby/Fam/Newborn/Bầu/Lookbook/…) là gói chụp — TRỪ "Dịch Vụ Bán Lẻ"
 *     (Lark xếp chung nhóm "Chụp / Quay" nhưng là bán lẻ, không có buổi chụp).
 *   · `addon` đạo cụ/set chụp (Bóng bay, Hoa tươi, Thêm set chụp, Thêm thành viên…) chỉ
 *     bán KÈM buổi chụp → tính là chụp. Riêng nhóm addon hậu kỳ (Edit file Ảnh Phóng,
 *     Ghép layout Album, Làm ảnh nhanh, Phụ phí) thì không.
 *   · `print`, `edited_photo`, `service` (Makeup, Dịch vụ Hậu Kỳ), `album_unedited` → hậu kỳ.
 *
 * Bộ CHƯA có dòng hoá đơn nào trong app → "chua_ro" — KHÔNG đoán là hậu kỳ: ẩn nhầm một
 * bộ có gói chụp khỏi hàng cảnh báo là khách chờ ảnh mà không ai biết (đo 06/10: 46/47 bộ
 * rỗng chưa có dòng hoá đơn thực ra có gói chụp bên Lark).
 */

export type LoaiHoaDon = "goi_chup" | "hau_ky" | "chua_ro";

export interface DongSanPham {
  /** `products.kind` — null khi sản phẩm không còn trong danh mục. */
  kind: string | null;
  name: string | null;
}

const ADDON_HAU_KY = /edit\s*file|gh[eé]p\s*layout|l[aà]m\s*[aả]nh\s*nhanh|ph[uụ]\s*ph[ií]/i;
const GOI_KHONG_CHUP = /b[aá]n\s*l[eẻ]/i;

/** Một dòng hoá đơn có phải dịch vụ CHỤP HÌNH không. */
export function laDichVuChup(sp: DongSanPham): boolean {
  const ten = sp.name ?? "";
  if (sp.kind === "shoot_package") return !GOI_KHONG_CHUP.test(ten);
  if (sp.kind === "addon") return !ADDON_HAU_KY.test(ten);
  return false;
}

/** Phân loại MỘT bộ ảnh theo mọi dòng hoá đơn của nó (cả dòng cha lẫn dòng con). */
export function phanLoaiHoaDon(dong: DongSanPham[]): LoaiHoaDon {
  if (dong.length === 0) return "chua_ro";
  return dong.some(laDichVuChup) ? "goi_chup" : "hau_ky";
}

// ---------------------------------------------------------------------------
// Lý do bộ có gói chụp mà chưa có ảnh
// ---------------------------------------------------------------------------

export type LyDoChuaCoAnh = "chua_co_link" | "chua_chia_se" | "thu_muc_rong" | "loi_drive" | "chua_dong_bo";

export interface TrangThaiDrive {
  drive_folder_id: string | null;
  sync_error: string | null;
}

/** Câu `moTaLoi()` (src/lib/drive/sync-gallery.ts) ghi vào `sync_error`. */
const LOI_CHUA_CHIA_SE = /ch[uư]a\s*(đ[uư][oợ]c\s*)?chia\s*s[eẻ]/i;
const LOI_RONG = /kh[oô]ng\s*c[oó]\s*t[aấ]m\s*[aả]nh/i;

export function lyDoChuaCoAnh(g: TrangThaiDrive): LyDoChuaCoAnh {
  if (!g.drive_folder_id?.trim()) return "chua_co_link";
  const loi = g.sync_error?.trim();
  if (!loi) return "chua_dong_bo";
  if (LOI_CHUA_CHIA_SE.test(loi)) return "chua_chia_se";
  if (LOI_RONG.test(loi)) return "thu_muc_rong";
  return "loi_drive";
}

/** Nhãn + hướng dẫn MỘT dòng cho CSKH. */
export const NHAN_LY_DO: Record<LyDoChuaCoAnh, { nhan: string; huongDan: string }> = {
  chua_co_link: {
    nhan: "Chưa có link Drive",
    huongDan: "Dán link thư mục ảnh vào ô Link ảnh của dòng Hậu Kỳ bên Lark, hoặc gắn thư mục ở chi tiết bộ ảnh.",
  },
  chua_chia_se: {
    nhan: "Thư mục chưa chia sẻ",
    huongDan: "Mở thư mục Drive, bật “Bất kỳ ai có đường liên kết đều xem được”, rồi bấm Đồng bộ.",
  },
  thu_muc_rong: {
    nhan: "Thư mục rỗng",
    huongDan: "Thư mục chưa có ảnh — nhắc thợ ảnh tải ảnh gốc lên đúng thư mục, rồi bấm Đồng bộ.",
  },
  loi_drive: {
    nhan: "Lỗi Drive",
    huongDan: "Drive chưa đọc được thư mục — bấm Đồng bộ lại; còn lỗi thì kiểm tra link.",
  },
  chua_dong_bo: {
    nhan: "Chưa đồng bộ ảnh",
    huongDan: "Đã có link nhưng app chưa kéo ảnh lần nào — bấm Đồng bộ.",
  },
};

/** Gom dòng hoá đơn thành chữ ngắn: "UV 13x18 ×2 · Edit file ×5". */
export function tomTatDong(dong: Array<{ name: string | null; quantity: number | null }>): string {
  const gop = new Map<string, number>();
  for (const d of dong) {
    const ten = d.name?.trim();
    if (!ten) continue;
    gop.set(ten, (gop.get(ten) ?? 0) + (d.quantity && d.quantity > 0 ? d.quantity : 1));
  }
  return [...gop.entries()].map(([ten, sl]) => (sl > 1 ? `${ten} ×${sl}` : ten)).join(" · ");
}
