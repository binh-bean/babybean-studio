/**
 * BB-397 — kiểm khách DỰ PHÒNG bằng hoá đơn gốc của bộ ảnh.
 *
 * Vì sao: khách của bộ đến từ Lark nhưng `customers.lark_customer_key` vẫn NULL (thuật sĩ tạo
 * bộ, gắn dòng Hậu Kỳ cho bộ tạo tay… không đặt khoá — xem docs/27 §"Khớp khách"). Khi đó
 * `kiemKhachHoaDon` trả `bo_chua_co_khoa` và CSKH bị chặn, dù hoá đơn phát sinh cùng khách với
 * hoá đơn gói chụp của chính bộ đó (08/10: HD_…#5278 cùng khách với HD_…#5261).
 *
 * Luật:
 *   · Khách của bộ ĐÃ có khoá → so như cũ (`kiemKhachHoaDon`). Không dùng dự phòng.
 *   · Chưa có khoá → đọc (qua `NguonHoaDon`) hoá đơn GỐC của bộ (`lark_contract_code` +
 *     `lark_contract_codes`), lấy khoá khách nguồn của chúng:
 *       - trùng khoá hoá đơn phát sinh → `khop_qua_hoa_don_goc` + lệnh NỐI khoá vào khách;
 *       - khác → `khac_khach` (chặn như cũ);
 *       - không có hoá đơn gốc / gốc không có khách / các gốc lệch khách nhau → giữ
 *         `bo_chua_co_khoa` (chỉ Admin/Quản lý ép gán, như cũ).
 *   · Nối khoá chỉ khi chưa khách nào khác giữ khoá đó (chỉ mục duy nhất `uq_customers_lark_key`).
 *     Khách khác đã giữ → vẫn khớp, KHÔNG nối, cảnh báo "có thể trùng khách".
 *
 * Tệp THUẦN (không import phía máy chủ): phép thử truyền nguồn giả + hàm tra khách giả.
 */
import { kiemKhachHoaDon, type KetQuaKhach } from "@/lib/hoa-don/doi-chieu-hoa-don";
import { chuanHoaMaHoaDon, type HoaDonChuan, type NguonHoaDon } from "@/lib/hoa-don/nguon-hoa-don";

export type KetQuaKhachMoRong = KetQuaKhach | "khop_qua_hoa_don_goc";

/** Hai kết quả cho qua (không cần ép gán). */
export function laKhopKhach(k: KetQuaKhachMoRong | undefined): boolean {
  return k === "khop" || k === "khop_qua_hoa_don_goc";
}

/** Trần số hoá đơn gốc đọc cho một bộ (bộ gom nhiều hợp đồng hiếm khi quá 2–3). */
export const TRAN_HOA_DON_GOC = 5;

export type LyDoKhongCoKhoaGoc = "khong_co_hoa_don_goc" | "goc_khong_co_khach" | "goc_nhieu_khach";

export type KhoaGoc =
  | { ok: true; khoa: string; maGoc: string[] }
  | { ok: false; lyDo: LyDoKhongCoKhoaGoc; maGoc: string[] };

/**
 * Đọc khoá khách nguồn từ các hoá đơn gốc. Mã sai dạng bị bỏ; mã nguồn không có (null) bị bỏ.
 * Nguồn hỏng/chậm → ném `LoiNguonHoaDon` (người gọi quyết).
 */
export async function docKhoaKhachHoaDonGoc(nguon: NguonHoaDon, cacMaGoc: readonly (string | null | undefined)[]): Promise<KhoaGoc> {
  const ma = [...new Set(cacMaGoc.map((m) => chuanHoaMaHoaDon(m)).filter((m): m is string => Boolean(m)))].slice(0, TRAN_HOA_DON_GOC);
  if (ma.length === 0) return { ok: false, lyDo: "khong_co_hoa_don_goc", maGoc: [] };
  const ds = await Promise.all(ma.map((m) => nguon.layHoaDon(m)));
  const coThat = ds.filter((h): h is HoaDonChuan => h !== null);
  const maGoc = coThat.map((h) => h.ma);
  if (coThat.length === 0) return { ok: false, lyDo: "khong_co_hoa_don_goc", maGoc };
  const khoa = new Set(coThat.map((h) => (h.khoaKhachNguon ?? "").trim()).filter(Boolean));
  if (khoa.size === 0) return { ok: false, lyDo: "goc_khong_co_khach", maGoc };
  const [motKhoa] = [...khoa];
  if (khoa.size > 1 || !motKhoa) return { ok: false, lyDo: "goc_nhieu_khach", maGoc };
  return { ok: true, khoa: motKhoa, maGoc };
}

/** Kiểm khách một hoá đơn, có dự phòng bằng khoá khách của hoá đơn gốc. */
export function kiemKhachCoDuPhong(hd: HoaDonChuan, khoaKhachBo: string | null | undefined, khoaGoc: string | null): KetQuaKhachMoRong {
  const k = kiemKhachHoaDon(hd, khoaKhachBo);
  if (k !== "bo_chua_co_khoa" || !khoaGoc) return k;
  const h = (hd.khoaKhachNguon ?? "").trim();
  if (!h) return "hoa_don_khong_co_khach";
  return h === khoaGoc.trim() ? "khop_qua_hoa_don_goc" : "khac_khach";
}

export type LenhNoiKhoa =
  | { loai: "noi"; customerId: string; khoa: string }
  | { loai: "trung_khach"; customerId: string; khoa: string; khachGiuKhoa: string };

/** Nối khoá khi khách của bộ chưa có khoá và chưa ai giữ khoá đó; khách khác giữ → cảnh báo. */
export function quyetDinhNoiKhoa(p: {
  customerId: string | null;
  khoaKhachBo: string | null | undefined;
  khoa: string | null;
  khachGiuKhoa: string | null;
}): LenhNoiKhoa | null {
  if (!p.customerId || !p.khoa || (p.khoaKhachBo ?? "").trim()) return null;
  if (p.khachGiuKhoa && p.khachGiuKhoa !== p.customerId) {
    return { loai: "trung_khach", customerId: p.customerId, khoa: p.khoa, khachGiuKhoa: p.khachGiuKhoa };
  }
  if (p.khachGiuKhoa === p.customerId) return null;
  return { loai: "noi", customerId: p.customerId, khoa: p.khoa };
}

export const CAU_TRUNG_KHACH =
  "Có thể trùng khách: một khách khác trên app đã mang mã khách Lark này — app vẫn cho khớp nhưng không nối. Admin kiểm và gộp khách giúp.";

export interface KetQuaKhachBo {
  theoMa: Record<string, KetQuaKhachMoRong>;
  /** null = không cần đọc hoá đơn gốc (khách đã có khoá, hoặc không có khách). */
  khoaGoc: KhoaGoc | null;
  lenhNoi: LenhNoiKhoa | null;
}

/**
 * Kiểm khách cho MỌI hoá đơn của bộ. Chỉ đọc hoá đơn gốc khi cần (khách có, chưa có khoá, và
 * có hoá đơn rơi vào `bo_chua_co_khoa`). `timKhachGiuKhoa` chỉ được gọi khi có khớp qua gốc.
 */
export async function kiemKhachChoBo(p: {
  hoaDons: readonly HoaDonChuan[];
  customerId: string | null;
  khoaKhachBo: string | null;
  maGoc: readonly (string | null | undefined)[];
  nguon: NguonHoaDon;
  timKhachGiuKhoa: (khoa: string) => Promise<string | null>;
}): Promise<KetQuaKhachBo> {
  const theoMa: Record<string, KetQuaKhachMoRong> = {};
  for (const hd of p.hoaDons) theoMa[hd.ma] = kiemKhachHoaDon(hd, p.khoaKhachBo);
  const canDuPhong = Boolean(p.customerId) && !(p.khoaKhachBo ?? "").trim() && Object.values(theoMa).includes("bo_chua_co_khoa");
  if (!canDuPhong) return { theoMa, khoaGoc: null, lenhNoi: null };

  const khoaGoc = await docKhoaKhachHoaDonGoc(p.nguon, p.maGoc);
  if (!khoaGoc.ok) return { theoMa, khoaGoc, lenhNoi: null };
  for (const hd of p.hoaDons) theoMa[hd.ma] = kiemKhachCoDuPhong(hd, p.khoaKhachBo, khoaGoc.khoa);

  const coKhop = Object.values(theoMa).includes("khop_qua_hoa_don_goc");
  const coKhac = Object.values(theoMa).includes("khac_khach");
  // Chỉ nối khi MỌI hoá đơn đang xét đều không bị chặn "khách khác" (lượt này sẽ bị chặn).
  if (!coKhop || coKhac) return { theoMa, khoaGoc, lenhNoi: null };
  const khachGiuKhoa = await p.timKhachGiuKhoa(khoaGoc.khoa);
  return {
    theoMa,
    khoaGoc,
    lenhNoi: quyetDinhNoiKhoa({ customerId: p.customerId, khoaKhachBo: p.khoaKhachBo, khoa: khoaGoc.khoa, khachGiuKhoa }),
  };
}
