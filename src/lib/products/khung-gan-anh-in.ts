/**
 * BB-398 — KHUNG CÓ HAI CÁCH BÁN (anh 08/10/2026), luật THUẦN dùng chung cho
 * cửa hàng (màn khách), `/api/g/addons` (máy chủ kiểm lại) và màn quản trị.
 *
 *   (a) KHUNG LẺ — bán như cũ, KHÔNG chọn ảnh: một dòng `selection_addons` không
 *       `photo_id`, không `gan_voi_addon_id`. Studio giao riêng khung.
 *   (b) KHUNG GẮN DÒNG IN — "khách đã mua thêm một ảnh 40×60 Gỗ đã chọn hình, giờ
 *       mua thêm khung cho chính tấm đó": dòng khung có `gan_voi_addon_id` = id
 *       dòng in (migration 0104), cùng `photo_id` với dòng in.
 *
 * Luật (b) — máy chủ kiểm, giao diện chỉ phản chiếu:
 *   1. Dòng in cùng LƯỢT CHỌN (không đoán id dòng của nhà khác).
 *   2. Dòng gắn vào phải là ẢNH IN (`kind = print`) — không gắn khung vào khung,
 *      album, file chỉnh.
 *   3. Chất liệu bọc được (`coTheBocKhung`): UV là ảnh giấy → TỪ CHỐI.
 *   4. Khổ khung = khổ in (so theo khổ chuẩn hoá, "60x40" = "40x60").
 *   5. Số khung gắn một dòng in ≤ số lượng in của dòng đó.
 */

import { vi } from "@/i18n/vi";
import { coTheBocKhung, nhomSanPham } from "./nhom-san-pham";

/** "40×60", "60 x 40", "40X60 cm" → "40x60" (số nhỏ trước). Không đọc được → `null`. */
export function chuanKhoIn(size: string | null | undefined): string | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?\s*$/i.exec(size ?? "");
  if (!m) return null;
  const a = Number(m[1]!.replace(",", "."));
  const b = Number(m[2]!.replace(",", "."));
  if (!(a > 0 && b > 0)) return null;
  return `${Math.min(a, b)}x${Math.max(a, b)}`;
}

/** Hai khổ có phải cùng một khổ không (cả hai phải đọc được). */
export function cungKho(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = chuanKhoIn(a);
  return ka !== null && ka === chuanKhoIn(b);
}

export interface SanPhamXetKhung {
  kind: string | null;
  material: string | null;
  size: string | null;
}

/**
 * Nhóm nào BẮT BUỘC chọn ảnh khi đặt mua thêm (route `/api/g/addons`, nhánh một dòng).
 * Từ BB-398 chỉ còn ẢNH IN; khung bán lẻ được không ảnh. (`canGanAnh` ở nhom-san-pham.ts
 * vẫn nói khung CÓ THỂ gắn ảnh — gắn được, không bắt buộc.)
 */
export function batBuocChonAnh(nhom: string | null): boolean {
  return nhom === "anh_in";
}

/** Sản phẩm có phải KHUNG không (nhóm "khung" theo chất liệu "Khung …"). */
export function laKhung(sp: Pick<SanPhamXetKhung, "kind" | "material">): boolean {
  return nhomSanPham(sp.kind, sp.material) === "khung";
}

/** Một dòng in có bọc khung được không: hàng in (`print`), không UV, khổ đọc được. */
export function dongInBocKhungDuoc(sp: SanPhamXetKhung): boolean {
  if (sp.kind !== "print") return false;
  if (nhomSanPham(sp.kind, sp.material) !== "anh_in") return false;
  if (!coTheBocKhung(sp.material)) return false;
  return chuanKhoIn(sp.size) !== null;
}

export type LyDoTuChoiKhung =
  | "khong_phai_khung"
  | "khong_thay_dong_in"
  | "khac_luot_chon"
  | "khong_phai_anh_in"
  | "uv_khong_boc"
  | "kho_lech"
  | "vuot_so_luong";

/** Lời báo khách khi máy chủ từ chối — chuỗi ở `vi.gallery.loiBean.khungTuChoi` (giọng Bean). */
export const LOI_KHUNG: Record<LyDoTuChoiKhung, string> = vi.gallery.loiBean.khungTuChoi;

export interface DongInXet {
  id: string;
  selectionId: string;
  photoId: string | null;
  quantity: number;
  sanPham: SanPhamXetKhung;
}

/**
 * Kiểm một lượt ĐẶT khung gắn dòng in. `soLuong` là số khung TUYỆT ĐỐI muốn gắn
 * (route nhận tổng, không cộng dồn); `0` là bỏ — luôn hợp lệ khi dòng in tồn tại.
 */
export function kiemKhungGanIn(input: {
  selectionId: string;
  sanPhamKhung: SanPhamXetKhung;
  dongIn: DongInXet | null;
  soLuong: number;
}): { ok: true } | { ok: false; lyDo: LyDoTuChoiKhung } {
  const { selectionId, sanPhamKhung, dongIn, soLuong } = input;
  if (!laKhung(sanPhamKhung)) return { ok: false, lyDo: "khong_phai_khung" };
  if (!dongIn) return { ok: false, lyDo: "khong_thay_dong_in" };
  if (dongIn.selectionId !== selectionId) return { ok: false, lyDo: "khac_luot_chon" };
  if (soLuong === 0) return { ok: true };
  if (dongIn.sanPham.kind !== "print" || nhomSanPham(dongIn.sanPham.kind, dongIn.sanPham.material) !== "anh_in") {
    return { ok: false, lyDo: "khong_phai_anh_in" };
  }
  if (!coTheBocKhung(dongIn.sanPham.material)) return { ok: false, lyDo: "uv_khong_boc" };
  if (!cungKho(sanPhamKhung.size, dongIn.sanPham.size)) return { ok: false, lyDo: "kho_lech" };
  if (soLuong > dongIn.quantity) return { ok: false, lyDo: "vuot_so_luong" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Màn khách — lối "Đóng khung ảnh đã đặt in"
// ---------------------------------------------------------------------------

export interface DongGioXetKhung {
  id: string;
  productId: string;
  photoId: string | null;
  quantity: number;
  ganVoiAddonId: string | null;
  kind: string | null;
  material: string | null;
  size: string | null;
}

export interface KhungTrongDanhMuc {
  productId: string;
  name: string;
  material: string | null;
  size: string | null;
  unitPrice: number;
}

export interface DongInChoKhung {
  dongIn: DongGioXetKhung;
  /** Khung đúng khổ đang bán (rẻ nhất trước) — rỗng = chưa có khung khổ này. */
  khungVua: KhungTrongDanhMuc[];
  /** Tổng số khung đã gắn dòng in này (mọi kiểu khung). */
  soKhungDaGan: number;
  /** Đã đủ khung (= số lượng in) — hiện "Đã có khung". */
  daDuKhung: boolean;
}

/**
 * Các dòng in ba mẹ đã đặt mà BỌC KHUNG ĐƯỢC (không UV, hàng in, có ảnh), kèm khung
 * đúng khổ trong danh mục và số khung đã gắn. Thứ tự giữ theo giỏ.
 */
export function dongInChoDongKhung(
  gio: readonly DongGioXetKhung[],
  danhMucKhung: readonly KhungTrongDanhMuc[],
): DongInChoKhung[] {
  return gio
    .filter((d) => !d.ganVoiAddonId && d.photoId && dongInBocKhungDuoc(d))
    .map((d) => {
      const soKhungDaGan = gio
        .filter((k) => k.ganVoiAddonId === d.id)
        .reduce((t, k) => t + k.quantity, 0);
      const khungVua = danhMucKhung
        .filter((k) => cungKho(k.size, d.size))
        .slice()
        .sort((a, b) => a.unitPrice - b.unitPrice || a.name.localeCompare(b.name, "vi"));
      return { dongIn: d, khungVua, soKhungDaGan, daDuKhung: soKhungDaGan >= d.quantity };
    });
}

/** Số khung gắn theo một dòng in — để báo khi dòng in bị bỏ (cascade xoá khung). */
export function soKhungGanTheo(
  gio: readonly { ganVoiAddonId?: string | null; quantity: number }[],
  idDongIn: string,
): number {
  return gio.filter((k) => k.ganVoiAddonId === idDongIn).reduce((t, k) => t + k.quantity, 0);
}

// ---------------------------------------------------------------------------
// Màn quản trị / thợ — nhãn dòng khung
// ---------------------------------------------------------------------------

export interface DongQuanTriXetKhung {
  id: string;
  photoId: string | null;
  ganVoiAddonId: string | null;
  kind: string | null;
  material: string | null;
  size: string | null;
}

/**
 * Nhãn cho thợ của MỘT dòng mua thêm: dòng khung gắn in → "Khung cho: <tệp> · <chất liệu> <khổ>";
 * khung không ảnh → "Khung lẻ"; khung gắn thẳng ảnh (cách cũ / in trong gói) → "Khung cho: <tệp>".
 * Dòng không phải khung → `null`.
 */
export function nhanKhungChoTho(
  dong: DongQuanTriXetKhung,
  tatCa: readonly DongQuanTriXetKhung[],
  tenTep: (photoId: string) => string | null | undefined,
): string | null {
  if (!laKhung(dong)) return null;
  if (dong.ganVoiAddonId) {
    const dongIn = tatCa.find((d) => d.id === dong.ganVoiAddonId);
    const tep = (dongIn?.photoId ? tenTep(dongIn.photoId) : null) ?? (dong.photoId ? tenTep(dong.photoId) : null) ?? "(chưa rõ tệp)";
    const chiTiet = dongIn ? [dongIn.material, dongIn.size].filter(Boolean).join(" ") : "";
    return chiTiet ? `Khung cho: ${tep} · ${chiTiet}` : `Khung cho: ${tep}`;
  }
  if (!dong.photoId) return "Khung lẻ";
  return `Khung cho: ${tenTep(dong.photoId) ?? "(chưa rõ tệp)"}`;
}

// ---------------------------------------------------------------------------
// BB-398 vòng 3 — đóng khung trong ĐỢT MUA THÊM (đợt ≥ 2)
// ---------------------------------------------------------------------------

/**
 * Tấm in thuộc đợt nào thì được đóng khung trong một đợt mua thêm:
 *   - đợt 1 (lượt chọn gốc) — luôn được;
 *   - đợt ≥ 2 chỉ khi đợt đó ĐÃ XÁC NHẬN. Đợt còn chờ có thể bị CSKH trả lại — dòng in
 *     bị xoá kéo theo khung gắn ở đợt sau (khoá ngoại `on delete cascade`) trong khi bản
 *     chụp tiền của đợt sau vẫn ghi khung đó. Chặn từ đầu để hai đợt không lệch nhau.
 * Dòng in còn nằm trong GIỎ đợt đang chọn (chưa lưu, chưa có id) đóng khung SAU khi chốt
 * và Bean xác nhận đợt đó.
 */
export function dotDuocDongKhung(
  dotCuaDongIn: number,
  cacDot: ReadonlyArray<{ soDot: number; trangThai: string }>,
): boolean {
  if (dotCuaDongIn <= 1) return true;
  return cacDot.some((d) => d.soDot === dotCuaDongIn && d.trangThai === "da_xac_nhan");
}

export interface DongKhungMoiTrongDot {
  productId: string;
  ganVoiAddonId: string;
  soLuong: number;
}

/**
 * Kiểm MỌI dòng khung gắn in của một lượt chốt đợt. `soLuong` cho `kiemKhungGanIn` = khung
 * ĐÃ gắn dòng in đó (mọi đợt trước) + khung mới trong đợt này (cộng mọi kiểu khung) — không
 * vượt số tấm in. Trả lý do đầu tiên bị từ chối, hoặc ok.
 */
export function kiemKhungGanInTrongDot(input: {
  selectionId: string;
  dongMoi: readonly DongKhungMoiTrongDot[];
  sanPham: ReadonlyMap<string, SanPhamXetKhung>;
  dongIn: ReadonlyMap<string, DongInXet & { dot: number }>;
  /** Số khung đã gắn từng dòng in (mọi đợt đã lưu). */
  daGan: ReadonlyMap<string, number>;
  dotDuoc: (dot: number) => boolean;
}): { ok: true } | { ok: false; lyDo: LyDoTuChoiKhung | "dot_chua_xac_nhan" } {
  const moiTheoIn = new Map<string, number>();
  for (const d of input.dongMoi) moiTheoIn.set(d.ganVoiAddonId, (moiTheoIn.get(d.ganVoiAddonId) ?? 0) + d.soLuong);
  for (const d of input.dongMoi) {
    const sp = input.sanPham.get(d.productId);
    const dongIn = input.dongIn.get(d.ganVoiAddonId) ?? null;
    const kq = kiemKhungGanIn({
      selectionId: input.selectionId,
      sanPhamKhung: sp ?? { kind: null, material: null, size: null },
      dongIn,
      soLuong: (input.daGan.get(d.ganVoiAddonId) ?? 0) + (moiTheoIn.get(d.ganVoiAddonId) ?? 0),
    });
    if (!kq.ok) return kq;
    if (dongIn && !input.dotDuoc(dongIn.dot)) return { ok: false, lyDo: "dot_chua_xac_nhan" };
  }
  return { ok: true };
}
