/**
 * BB-370 — tên bộ ảnh THÂN THIỆN cho màn khách (ô chuyển bộ, danh sách buổi
 * chụp, trang gia đình). KHÔNG BAO GIỜ trả mã hoá đơn.
 *
 * OWNER: DEV-FE. Hàm thuần — chạy được cả máy chủ lẫn trình duyệt.
 *
 * Vì sao có tệp này: `galleries.title` đồng bộ từ Lark là MÃ HOÁ ĐƠN
 * ("HD_20260909#5067" — gần như mọi bộ trên bb-dev, 06/10/2026). Ô chuyển bộ
 * của màn khách in thẳng `title` nên ba mẹ thấy mã hoá đơn (anh khoanh đỏ, ảnh
 * 3b8e6719). Tên bộ cho khách dựng từ tên bé + tên buổi chụp / ngày chụp.
 */

/**
 * Chuỗi có chứa mã hoá đơn / mã hợp đồng nội bộ không.
 * Mẫu thật: "HD_20260909#5067", "HD_20260909#5067 + HD_20260910#5071",
 * "<tên> · HD_20260901#1234_12345,HD_…". Bắt: `HD` + số dài, hoặc `#` + số.
 */
export function laMaHoaDon(s: string | null | undefined): boolean {
  const chu = (s ?? "").trim();
  if (!chu) return false;
  return /\bHD[_\-\s]?\d{6,}/i.test(chu) || /#\d{3,}/.test(chu);
}

/** Tiêu đề bộ dùng được cho khách: bỏ hẳn nếu là (hoặc có chứa) mã hoá đơn. */
export function tieuDeChoKhach(tieuDe: string | null | undefined): string | null {
  const chu = (tieuDe ?? "").trim();
  if (!chu || laMaHoaDon(chu)) return null;
  return chu;
}

/** "2026-09-13" → "13/09/2026". Sai dạng → null. */
export function ngayNgan(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

export interface DauVaoTenBo {
  /** Tên gọi bé đã tính sẵn ("Bé Mít", hoặc họ tên đầy đủ). */
  tenBe?: string | null;
  /** `galleries.title` — có thể là mã hoá đơn. */
  tieuDe?: string | null;
  /** Loại / tên buổi chụp (Thôi nôi, Newborn…) nếu có. */
  loaiBuoi?: string | null;
  /** Ngày chụp ISO (yyyy-mm-dd…). */
  ngayChup?: string | null;
}

/**
 * Tên bộ cho khách:
 *   - có bé:   "Bé Mít · Thôi nôi" / "Bé Mít · 13/09/2026" / "Bé Mít"
 *   - không bé: "Thôi nôi" / "Buổi chụp 13/09/2026" / "Buổi chụp"
 * Tên buổi = loại buổi chụp, rồi tới tiêu đề (nếu KHÔNG phải mã hoá đơn).
 * Tiêu đề đã có tên bé ("Bé Mít thôi nôi") thì không ghép lại tên bé.
 */
export function tenBoThanThien(v: DauVaoTenBo): string {
  const be = v.tenBe?.trim() || "";
  const buoi = v.loaiBuoi?.trim() || tieuDeChoKhach(v.tieuDe) || "";
  const ngay = ngayNgan(v.ngayChup);

  if (be) {
    if (buoi && buoi.toLocaleLowerCase("vi").includes(be.toLocaleLowerCase("vi"))) return buoi;
    if (buoi) return `${be} · ${buoi}`;
    if (ngay) return `${be} · ${ngay}`;
    return be;
  }
  if (buoi) return buoi;
  if (ngay) return `Buổi chụp ${ngay}`;
  return "Buổi chụp";
}
