/**
 * BB-385 — gói chụp và giá ảnh chọn thêm theo gói. Hàm THUẦN (dùng được cả ở
 * trình duyệt: thuật sĩ tạo bộ ảnh, màn "Gói chụp").
 *
 * Anh (Bản yêu cầu): "một file chỉnh là 50k, chưa có quyết định thay đổi nhưng
 * cứ để dự trù phương án để sau này có thể thay đổi nếu có quyết định."
 *
 * ---------------------------------------------------------------------------
 * Luật giá cho MỘT bộ ảnh MỚI (thứ tự ưu tiên, `giaAnhThemChoBoMoi`)
 * ---------------------------------------------------------------------------
 *   1. Số CSKH gõ tay ở thuật sĩ (ô "Giá ảnh chọn thêm") — người tạo bộ quyết.
 *   2. Giá RIÊNG của gói (bảng `goi_chup_gia_anh_them`, migration 0100) — Admin
 *      đặt ở màn Gói chụp. Chưa đặt = không có.
 *   3. Giá CHUNG (`settings.gallery.extra_photo_price_default`, migration 0065).
 *   4. 50.000 ₫ (`GIA_ANH_CHON_THEM_MAC_DINH`) — thiếu mọi thứ ở trên.
 *
 * ---------------------------------------------------------------------------
 * Đổi giá KHÔNG hồi tố
 * ---------------------------------------------------------------------------
 * Giá được CHÉP vào `galleries.extra_photo_price` đúng một lần, lúc tạo bộ. Mọi
 * phép tính tiền của bộ (màn khách, `calc_extra_amount`, `v_over_quota_unbilled`,
 * số lúc chốt `snapshot_extra_amount`) đọc cột đó, không đọc lại giá gói/giá
 * chung. Nên đổi giá ở màn Gói chụp chỉ áp cho bộ TẠO SAU lúc đổi — bộ đang chọn
 * dở và bộ đã chốt giữ nguyên giá khách đã thấy. Route sửa giá chỉ ghi bảng
 * `goi_chup_gia_anh_them` / `settings`, không bao giờ ghi `galleries`.
 */

import { maGoiLark } from "./goi-chup-lark";
import { GIA_ANH_CHON_THEM_MAC_DINH } from "./gia-anh-chon-them";

export { GIA_ANH_CHON_THEM_MAC_DINH, maGoiLark };

/** Trần giá một ảnh — cùng số với ô Cài đặt (`settings/schema.ts`). */
export const GIA_ANH_THEM_TOI_DA = 10_000_000;

/**
 * Đọc một giá đã lưu (jsonb của settings, numeric của Postgres trả về dạng số
 * hoặc chuỗi). Hợp lệ = số nguyên 0…10.000.000; mọi thứ khác → null.
 */
export function docGia(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > GIA_ANH_THEM_TOI_DA) return null;
  return n;
}

/** Giá một ảnh chọn thêm cho MỘT bộ ảnh SẮP TẠO — xem luật ưu tiên ở đầu tệp. */
export function giaAnhThemChoBoMoi(p: {
  giaNhapTay?: unknown;
  giaRiengCuaGoi?: unknown;
  giaChung?: unknown;
}): number {
  return docGia(p.giaNhapTay) ?? docGia(p.giaRiengCuaGoi) ?? docGia(p.giaChung) ?? GIA_ANH_CHON_THEM_MAC_DINH;
}

/**
 * Gói chính của ô "Gói chụp" bên Lark: mục ĐẦU ("Baby 02, Thêm set chụp" →
 * "Baby 02"). Cùng luật với POST /api/admin/galleries.
 */
export function goiChinhCuaO(goiChup: string): string {
  return goiChup.split(",")[0]?.trim() || goiChup.trim();
}

/** Giá riêng của gói (theo mã `LARK-…`) từ bảng giá đã đọc; không có → undefined. */
export function giaRiengTheoTenGoi(
  bangGia: Record<string, number> | null | undefined,
  tenGoi: string | null | undefined,
): number | undefined {
  if (!bangGia || !tenGoi || !tenGoi.trim()) return undefined;
  const v = bangGia[maGoiLark(goiChinhCuaO(tenGoi))];
  return docGia(v) ?? undefined;
}

// ---------------------------------------------------------------------------
// Màn "Gói chụp": tổng hợp từ danh mục + dòng hợp đồng (dữ liệu Lark)
// ---------------------------------------------------------------------------

export interface SanPhamDong {
  id: string;
  name: string;
  kind: string;
  list_price: number | string | null;
  is_active: boolean;
}

export interface DongHopDongDong {
  id: string;
  gallery_id: string;
  product_id: string;
  parent_item_id: string | null;
  quantity: number;
}

export interface GoiChupHang {
  /** `LARK-…` — khoá của giá riêng. */
  maGoi: string;
  ten: string;
  /** Giá niêm yết quan sát được từ hóa đơn Lark (`products.list_price`); null = chưa từng bán. */
  giaGoi: number | null;
  /** Số ảnh chỉnh ("Edit file") thường gặp trong các hợp đồng của gói; null = chưa có hợp đồng. */
  soAnhChinh: number | null;
  /** Sản phẩm đi kèm thường gặp: "Makeup ×1", "Gỗ 15x21 ×1"… */
  sanPhamDiKem: string[];
  /** Số hợp đồng có thành phần KHÁC thành phần thường gặp (CSKH sửa tay, khuyến mãi…). */
  soHopDongKhac: number;
  /** Số bộ ảnh dùng gói (dòng hợp đồng hoặc `galleries.package_id`). */
  soBoAnh: number;
  dangBan: boolean;
  /** Có trong danh mục Lark (`products`) hay chỉ là gói tạo khi tạo bộ ảnh. */
  coTrongDanhMuc: boolean;
  /** Giá ảnh chọn thêm riêng của gói; null = dùng giá chung. */
  giaAnhThemRieng: number | null;
  /** Giá thật áp cho bộ MỚI của gói (riêng → chung → 50.000). */
  giaAnhThemApDung: number;
}

function cheDoHay<T>(cac: T[], khoa: (x: T) => string): { giaTri: T | null; khac: number } {
  if (cac.length === 0) return { giaTri: null, khac: 0 };
  const dem = new Map<string, { n: number; x: T }>();
  for (const x of cac) {
    const k = khoa(x);
    const cu = dem.get(k);
    if (cu) cu.n += 1;
    else dem.set(k, { n: 1, x });
  }
  let tot: { n: number; x: T } | null = null;
  for (const v of dem.values()) if (!tot || v.n > tot.n) tot = v;
  return { giaTri: tot!.x, khac: cac.length - tot!.n };
}

/**
 * Dựng bảng của màn Gói chụp. Thuần: không gọi mạng, không gọi DB.
 *
 *   · Gói = sản phẩm `shoot_package` của danh mục Lark, cộng các gói `LARK-…`
 *     trong bảng `packages` (tạo khi tạo bộ ảnh) chưa khớp tên với danh mục.
 *   · Số ảnh chỉnh + sản phẩm đi kèm = thành phần THƯỜNG GẶP NHẤT của các dòng
 *     hợp đồng có gói đó (Lark "Chi Tiết Gói Chụp"); Lark không có bảng "gói
 *     gồm gì" riêng, mỗi hợp đồng tự ghi thành phần.
 */
export function tongHopGoiChup(input: {
  sanPham: SanPhamDong[];
  dongHopDong: DongHopDongDong[];
  /** Bảng `packages`: chỉ dùng gói `LARK-…` và để đếm bộ ảnh theo `package_id`. */
  goiApp: { id: string; code: string; name: string; is_active: boolean }[];
  boAnhTheoGoiApp: { package_id: string | null; id: string }[];
  bangGiaRieng: Record<string, number>;
  giaChung: unknown;
}): GoiChupHang[] {
  const spTheoId = new Map(input.sanPham.map((p) => [p.id, p]));
  const conTheoCha = new Map<string, DongHopDongDong[]>();
  for (const d of input.dongHopDong) {
    if (!d.parent_item_id) continue;
    const ds = conTheoCha.get(d.parent_item_id) ?? [];
    ds.push(d);
    conTheoCha.set(d.parent_item_id, ds);
  }

  // Bộ ảnh theo mã gói: qua dòng hợp đồng (cha là gói) và qua packages.package_id.
  const boTheoMa = new Map<string, Set<string>>();
  const themBo = (ma: string, boId: string) => {
    const s = boTheoMa.get(ma) ?? new Set<string>();
    s.add(boId);
    boTheoMa.set(ma, s);
  };
  const thanhPhanTheoMa = new Map<string, { soAnh: number; diKem: string[] }[]>();
  for (const d of input.dongHopDong) {
    if (d.parent_item_id) continue;
    const sp = spTheoId.get(d.product_id);
    if (!sp || sp.kind !== "shoot_package") continue;
    const ma = maGoiLark(sp.name);
    themBo(ma, d.gallery_id);
    let soAnh = 0;
    const diKem: string[] = [];
    for (const con of conTheoCha.get(d.id) ?? []) {
      const spCon = spTheoId.get(con.product_id);
      if (!spCon) continue;
      if (spCon.kind === "edited_photo") soAnh += Math.max(0, con.quantity);
      else diKem.push(`${spCon.name} ×${con.quantity}`);
    }
    diKem.sort((a, b) => a.localeCompare(b, "vi"));
    const ds = thanhPhanTheoMa.get(ma) ?? [];
    ds.push({ soAnh, diKem });
    thanhPhanTheoMa.set(ma, ds);
  }
  const maTheoGoiApp = new Map(input.goiApp.map((g) => [g.id, maGoiLark(g.name)]));
  for (const b of input.boAnhTheoGoiApp) {
    const ma = b.package_id ? maTheoGoiApp.get(b.package_id) : undefined;
    if (ma) themBo(ma, b.id);
  }

  const hang = new Map<string, GoiChupHang>();
  const dungHang = (ma: string, ten: string, giaGoi: number | null, dangBan: boolean, coTrongDanhMuc: boolean) => {
    const tp = cheDoHay(thanhPhanTheoMa.get(ma) ?? [], (x) => `${x.soAnh}|${x.diKem.join(";")}`);
    const rieng = docGia(input.bangGiaRieng[ma]);
    hang.set(ma, {
      maGoi: ma,
      ten,
      giaGoi,
      soAnhChinh: tp.giaTri ? tp.giaTri.soAnh : null,
      sanPhamDiKem: tp.giaTri?.diKem ?? [],
      soHopDongKhac: tp.khac,
      soBoAnh: boTheoMa.get(ma)?.size ?? 0,
      dangBan,
      coTrongDanhMuc,
      giaAnhThemRieng: rieng,
      giaAnhThemApDung: giaAnhThemChoBoMoi({ giaRiengCuaGoi: rieng, giaChung: input.giaChung }),
    });
  };

  for (const sp of input.sanPham) {
    if (sp.kind !== "shoot_package") continue;
    const ma = maGoiLark(sp.name);
    const cu = hang.get(ma);
    // Hai dòng danh mục cùng tên (chi nhánh khác nhau): giữ dòng đang bán.
    if (cu && (cu.dangBan || !sp.is_active)) continue;
    dungHang(ma, sp.name.trim(), docGia(sp.list_price), sp.is_active, true);
  }
  for (const g of input.goiApp) {
    if (!g.code.startsWith("LARK-")) continue;
    const ma = maGoiLark(g.name);
    if (hang.has(ma)) continue;
    dungHang(ma, g.name.trim(), null, g.is_active, false);
  }

  return [...hang.values()].sort(
    (a, b) => Number(b.dangBan) - Number(a.dangBan) || b.soBoAnh - a.soBoAnh || a.ten.localeCompare(b.ten, "vi"),
  );
}

/** Lỗi "chưa có bảng/cột" của Postgres/PostgREST — migration chưa áp. */
export function laLoiChuaApMigration(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && ["42P01", "42703", "PGRST204", "PGRST205", "PGRST200"].includes(code);
}
