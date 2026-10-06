/**
 * BB-334B — phần THUẦN của trang gia đình `/k/<mã>` và `/k/<mã>/<n>`:
 * tra bộ theo số thứ tự, chọn thẻ lớn, tên bộ, ngày chụp, màu chip.
 *
 * OWNER: DEV-FE. Dữ liệu vào là đúng hình `GET /api/k/<mã>` (docs/29 §2.1).
 * Nhãn trạng thái KHÔNG viết ở đây — lấy nguyên `trangThai.khach` của máy chủ
 * (`trangThaiKhach()`, BB-353).
 */
import type { BoAnhGiaDinh } from "@/lib/gia-dinh/bo-anh-gia-dinh";
import { tenBoThanThien } from "@/lib/utils/ten-bo-than-thien";

export type { BoAnhGiaDinh };

/** Phản hồi `GET /api/k/<mã>` (phần `data`). */
export interface NhaGiaDinh {
  loaiLink: "gia_dinh" | "theo_bo";
  vai: "owner" | "viewer" | "co_editor" | "suggester";
  tenNha: string;
  tenNgan: string;
  manifest: string;
  kenhTucThi: string[];
  boAnh: BoAnhGiaDinh[];
}

/**
 * Bộ thứ `n` của nhà (đoạn cuối địa chỉ `/k/<mã>/<n>`). Chỉ nhận số nguyên
 * dương viết thường ("2"); "02", "2a", "-1", "" → null (không đoán).
 */
export function traBoTheoSoThuTu(ds: readonly BoAnhGiaDinh[], n: string | number): BoAnhGiaDinh | null {
  const chu = String(n).trim();
  if (!/^[1-9]\d{0,4}$/.test(chu)) return null;
  const so = Number(chu);
  return ds.find((b) => b.soThuTu === so) ?? null;
}

/** Đường dẫn khách tới bộ thứ n. */
export function duongDanBo(ma: string, soThuTu: number): string {
  return `/k/${encodeURIComponent(ma)}/${soThuTu}`;
}

export function duongDanNha(ma: string): string {
  return `/k/${encodeURIComponent(ma)}`;
}

/**
 * "Bé Mít · Thôi nôi"; chưa gắn bé thì chỉ tên bộ.
 *
 * BB-370 — `tieuDe` (galleries.title) thường là MÃ HOÁ ĐƠN đồng bộ từ Lark
 * ("HD_20260909#5067"): không bao giờ in ra cho khách — dùng ngày chụp thay
 * ("Bé Mít · 13/09/2026", "Buổi chụp 13/09/2026"). Luật ở `tenBoThanThien`.
 */
export function tenBoHienThi(
  bo: Pick<BoAnhGiaDinh, "tenBe" | "tieuDe"> & { ngayChup?: string | null },
): string {
  return tenBoThanThien({ tenBe: bo.tenBe, tieuDe: bo.tieuDe, ngayChup: bo.ngayChup ?? null });
}

/** "2026-09-12" → "12.09.2026" (đúng kiểu bản vẽ). Sai dạng → null. */
export function ngayChupHienThi(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
}

/** Bộ đang cần BA MẸ làm (chọn ảnh, duyệt ảnh chỉnh). */
export function canBaMeLam(bo: Pick<BoAnhGiaDinh, "buocTiepTheo">): boolean {
  return bo.buocTiepTheo.ma === "chon_anh" || bo.buocTiepTheo.ma === "duyet_anh";
}

const MA_XONG = new Set(["da_giao", "da_cham_soc", "het_han", "luu_tru"]);

/**
 * Màu chip theo "ai đang cầm việc" (bản vẽ bb334.css):
 * `can` ba mẹ cần làm · `cho` Bean đang làm · `xong` đã xong.
 */
export function loaiChip(bo: Pick<BoAnhGiaDinh, "buocTiepTheo" | "trangThai">): "can" | "cho" | "xong" {
  if (canBaMeLam(bo)) return "can";
  if (MA_XONG.has(bo.trangThai.ma)) return "xong";
  return "cho";
}

/**
 * Thứ tự hiện: bộ CẦN ba mẹ làm đứng đầu (thẻ lớn), còn lại giữ thứ tự máy
 * chủ (mới nhất trước). `theLon` = bộ được làm thẻ lớn trên điện thoại: bộ cần
 * làm đầu tiên; nhà chỉ có một bộ thì chính bộ đó (anh chốt Q3 ★).
 */
export function xepBoTrenTrang(ds: readonly BoAnhGiaDinh[]): { theLon: BoAnhGiaDinh | null; conLai: BoAnhGiaDinh[] } {
  const canLam = ds.find(canBaMeLam) ?? null;
  const theLon = canLam ?? (ds.length === 1 ? (ds[0] ?? null) : null);
  return { theLon, conLai: ds.filter((b) => b !== theLon) };
}
