/**
 * BB-374 — đọc/ghi "Ảnh album không chỉnh sửa" phía máy chủ. Luật thuần ở
 * `anh-album-khong-chinh.ts`; tệp này chỉ gom nguyên liệu từ cơ sở dữ liệu.
 *
 * Chạy được khi CHƯA áp 0092/0093:
 *   · không lọc `kind = 'album_unedited'` trong SQL (enum chưa có giá trị đó → 22P02) —
 *     đọc mọi dòng hợp đồng của bộ rồi so loại trong TypeScript;
 *   · bảng `anh_album_khong_chinh` chưa có → coi như chưa chọn tấm nào (`coBang: false`).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { laLoiChuaApMigration } from "@/lib/gallery/dot-chon-server";
import { laSanPhamAlbumKhongChinh } from "@/lib/gallery/anh-album-khong-chinh";

export const BANG_ANH_ALBUM_KHONG_CHINH = "anh_album_khong_chinh";

type DongHang = { quantity: number | string | null; products?: { kind?: string | null } | { kind?: string | null }[] | null };

/** Số suất "Ảnh album không chỉnh sửa" của MỖI bộ (tổng quantity mọi dòng loại này, cả hai tầng). */
export async function docSoSuatAlbumKhongChinhNhieuBo(
  admin: SupabaseClient,
  galleryIds: string[],
): Promise<Map<string, number>> {
  const ketQua = new Map<string, number>();
  const ids = [...new Set(galleryIds)];
  if (ids.length === 0) return ketQua;
  const { data, error } = await admin
    .from("gallery_items")
    .select("gallery_id, quantity, products(kind)")
    .in("gallery_id", ids);
  if (error) throw error;
  for (const r of (data ?? []) as unknown as (DongHang & { gallery_id: string })[]) {
    const p = Array.isArray(r.products) ? r.products[0] : r.products;
    if (!laSanPhamAlbumKhongChinh(p?.kind ?? null)) continue;
    const q = Number(r.quantity);
    if (!Number.isInteger(q) || q <= 0) continue;
    ketQua.set(String(r.gallery_id), (ketQua.get(String(r.gallery_id)) ?? 0) + q);
  }
  return ketQua;
}

export async function docSoSuatAlbumKhongChinh(admin: SupabaseClient, galleryId: string): Promise<number> {
  return (await docSoSuatAlbumKhongChinhNhieuBo(admin, [galleryId])).get(galleryId) ?? 0;
}

/** Tấm đã chọn "cho album · không chỉnh" của MỘT lượt chọn, theo thứ tự chọn. */
export async function docAnhAlbumKhongChinh(
  admin: SupabaseClient,
  selectionId: string,
): Promise<{ coBang: boolean; photoIds: string[] }> {
  const { data, error } = await admin
    .from(BANG_ANH_ALBUM_KHONG_CHINH)
    .select("photo_id, created_at")
    .eq("selection_id", selectionId)
    .order("created_at", { ascending: true });
  if (error) {
    if (laLoiChuaApMigration(error)) return { coBang: false, photoIds: [] };
    throw error;
  }
  return { coBang: true, photoIds: ((data ?? []) as { photo_id: string }[]).map((r) => String(r.photo_id)) };
}

/**
 * Tấm "không chỉnh" của LƯỢT CHỌN CHÍNH (`is_primary`) — thứ CSKH/thợ làm theo — kèm tên
 * tệp, sắp theo thứ tự ảnh trong thư mục (như danh sách xuất).
 */
export async function docAnhAlbumKhongChinhCuaBo(
  admin: SupabaseClient,
  galleryId: string,
): Promise<{ coBang: boolean; soSuat: number; anh: { photoId: string; fileName: string }[] }> {
  const soSuat = await docSoSuatAlbumKhongChinh(admin, galleryId);
  // Bộ không có suất (gần như mọi bộ) thì thôi — không tốn thêm hai lượt hỏi cho màn chi tiết/tệp xuất.
  if (soSuat === 0) return { coBang: true, soSuat, anh: [] };
  const { data: luot, error: eLuot } = await admin
    .from("selections")
    .select("id")
    .eq("gallery_id", galleryId)
    .eq("is_primary", true)
    .maybeSingle();
  if (eLuot) throw eLuot;
  if (!luot) return { coBang: true, soSuat, anh: [] };
  const { data, error } = await admin
    .from(BANG_ANH_ALBUM_KHONG_CHINH)
    .select("photo_id, photos(file_name, sort_index)")
    .eq("selection_id", luot.id);
  if (error) {
    if (laLoiChuaApMigration(error)) return { coBang: false, soSuat, anh: [] };
    throw error;
  }
  type Dong = { photo_id: string; photos?: { file_name?: string | null; sort_index?: number | null } | null };
  const anh = ((data ?? []) as unknown as Dong[])
    .map((r) => ({
      photoId: String(r.photo_id),
      fileName: String(r.photos?.file_name ?? ""),
      sort: Number(r.photos?.sort_index ?? 0),
    }))
    .sort((a, b) => a.sort - b.sort || a.fileName.localeCompare(b.fileName, "vi", { numeric: true }))
    .map(({ photoId, fileName }) => ({ photoId, fileName }));
  return { coBang: true, soSuat, anh };
}

/**
 * Thả tim (thành ẢNH CHỈNH SỬA) thì tấm đó rời suất "không chỉnh" — một tấm không thể là
 * cả hai. Gọi SAU khi lượt thả tim đã ghi xong. Bảng chưa có (0093 chưa áp) thì thôi.
 */
export async function goKhoiAlbumKhongChinhKhiThaTim(
  admin: SupabaseClient,
  selectionId: string,
  photoIds: string[],
): Promise<void> {
  if (photoIds.length === 0) return;
  const { error } = await admin
    .from(BANG_ANH_ALBUM_KHONG_CHINH)
    .delete()
    .eq("selection_id", selectionId)
    .in("photo_id", photoIds);
  if (error && !laLoiChuaApMigration(error)) throw error;
}
