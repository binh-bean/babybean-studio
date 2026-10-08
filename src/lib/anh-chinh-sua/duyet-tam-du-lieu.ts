/**
 * BB-401 vòng 2 — đọc/ghi bảng 0108 `anh_chinh_duyet_tam` ("Duyệt tấm này" của ba mẹ).
 *
 * Chưa áp 0108 → đọc trả `null`, ghi trả "chua_co_bang": app chạy tiếp, màn khách giữ dấu
 * duyệt trên máy (localStorage), màn quản trị không hiện dòng "Khách đã duyệt n/N tấm".
 * Chỉ gọi bằng client service_role SAU khi route đã xét phiên/quyền.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { laLoiChuaCoBang } from "./du-lieu";
import type { DongDuyetTam } from "./duyet-tung-tam";

export const BANG_DUYET_TAM = "anh_chinh_duyet_tam";

/** Mọi dấu duyệt của bộ; `null` = chưa áp 0108. Lỗi khác thì ném (route trả 500 chung). */
export async function docDuyetTam(db: SupabaseClient, galleryId: string): Promise<DongDuyetTam[] | null> {
  const { data, error } = await db.from(BANG_DUYET_TAM).select("photo_id, khoa, duyet_luc").eq("gallery_id", galleryId);
  if (error) {
    if (laLoiChuaCoBang(error)) return null;
    throw error;
  }
  return (data ?? []) as DongDuyetTam[];
}

/** Ghi (duyệt) hoặc xoá (bỏ duyệt) dấu của một tấm. */
export async function ghiDuyetTam(
  db: SupabaseClient,
  p: { galleryId: string; photoId: string; khoa: string; duyet: boolean; luc: string },
): Promise<"ok" | "chua_co_bang"> {
  const { error } = p.duyet
    ? await db
        .from(BANG_DUYET_TAM)
        .upsert({ gallery_id: p.galleryId, photo_id: p.photoId, khoa: p.khoa, duyet_luc: p.luc }, { onConflict: "gallery_id,photo_id" })
    : await db.from(BANG_DUYET_TAM).delete().eq("gallery_id", p.galleryId).eq("photo_id", p.photoId);
  if (error) {
    if (laLoiChuaCoBang(error)) return "chua_co_bang";
    throw error;
  }
  return "ok";
}
