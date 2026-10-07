/**
 * BB-385 — phần ĐỌC/GHI cơ sở dữ liệu của giá ảnh chọn thêm theo gói. Chỉ route
 * API gọi (client service_role). Luật giá nằm ở `gia-goi-chup.ts` (thuần).
 *
 * Migration 0100 (bảng `goi_chup_gia_anh_them`) có thể CHƯA áp: mọi hàm đọc gặp
 * lỗi "chưa có bảng" thì trả bảng giá rỗng + cờ `chuaApMigration` — giá rơi về
 * giá chung (mặc định 50.000 ₫), không 500.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  laLoiChuaApMigration,
  docGia,
  type SanPhamDong,
  type DongHopDongDong,
} from "./gia-goi-chup";

export const BANG_GIA_RIENG = "goi_chup_gia_anh_them";
export const KHOA_GIA_CHUNG = "gallery.extra_photo_price_default";

export interface BangGiaRieng {
  bang: Record<string, number>;
  chuaApMigration: boolean;
}

export async function docBangGiaRieng(admin: SupabaseClient): Promise<BangGiaRieng> {
  const { data, error } = await admin.from(BANG_GIA_RIENG).select("ma_goi, gia_anh_them");
  if (error) {
    if (laLoiChuaApMigration(error)) return { bang: {}, chuaApMigration: true };
    throw error;
  }
  const bang: Record<string, number> = {};
  for (const r of (data ?? []) as { ma_goi: string; gia_anh_them: unknown }[]) {
    const g = docGia(r.gia_anh_them);
    if (g !== null) bang[r.ma_goi] = g;
  }
  return { bang, chuaApMigration: false };
}

/** Giá chung đang lưu (chưa áp luật rơi về) — null khi chưa có dòng / giá lạ. */
export async function docGiaChung(admin: SupabaseClient): Promise<number | null> {
  const { data } = await admin
    .from("settings")
    .select("value")
    .eq("key", KHOA_GIA_CHUNG)
    .is("branch_id", null)
    .maybeSingle();
  return docGia((data as { value?: unknown } | null)?.value);
}

const TRANG = 1000;
const TRANG_TOI_DA = 40;

/** Đọc hết một bảng theo trang (PostgREST trả tối đa 1.000 dòng một lần). */
async function docHet<T>(
  doc: (tu: number, den: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const ket: T[] = [];
  for (let i = 0; i < TRANG_TOI_DA; i++) {
    const { data, error } = await doc(i * TRANG, i * TRANG + TRANG - 1);
    if (error) throw error;
    const ds = (data ?? []) as T[];
    ket.push(...ds);
    if (ds.length < TRANG) break;
  }
  return ket;
}

export interface DuLieuManGoiChup {
  sanPham: SanPhamDong[];
  dongHopDong: DongHopDongDong[];
  goiApp: { id: string; code: string; name: string; is_active: boolean }[];
  boAnhTheoGoiApp: { package_id: string | null; id: string }[];
}

export async function docDuLieuManGoiChup(admin: SupabaseClient): Promise<DuLieuManGoiChup> {
  const [sanPham, dongHopDong, goiApp, boAnhTheoGoiApp] = await Promise.all([
    docHet<SanPhamDong>((tu, den) =>
      admin.from("products").select("id, name, kind, list_price, is_active").order("id").range(tu, den),
    ),
    docHet<DongHopDongDong>((tu, den) =>
      admin
        .from("gallery_items")
        .select("id, gallery_id, product_id, parent_item_id, quantity")
        .order("id")
        .range(tu, den),
    ),
    docHet<{ id: string; code: string; name: string; is_active: boolean }>((tu, den) =>
      admin.from("packages").select("id, code, name, is_active").order("id").range(tu, den),
    ),
    docHet<{ package_id: string | null; id: string }>((tu, den) =>
      admin.from("galleries").select("id, package_id").not("package_id", "is", null).order("id").range(tu, den),
    ),
  ]);
  return { sanPham, dongHopDong, goiApp, boAnhTheoGoiApp };
}
