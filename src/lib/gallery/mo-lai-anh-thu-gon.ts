/**
 * BB-359 (2b) — khách mở một bộ ảnh ĐÃ THU GỌN (BB-357: danh sách ảnh của bộ đã
 * giao/lưu trữ/hết hạn > 6 tháng bị rút còn bìa + ảnh đã chọn…) thì app tự Đồng bộ
 * lại từ Drive ở nền. Anh chốt 02/10/2026: link app của gia đình phải mở được lâu dài.
 *
 * Bốn lớp chặn:
 *   1. Chỉ phiên khách của CHÍNH bộ đó (mã bộ lấy từ phiên đã ký, không từ dữ liệu gửi
 *      lên) — route gọi `requireGallerySession(VAI_MO_LAI_ANH)`. BB-360 (anh 02/10): ông bà
 *      mở bằng link mời gia đình (vai `viewer`…) cũng kích được — trước chỉ `owner`.
 *   2. Khoá + tần suất: hàm SQL `nhan_mo_lai_anh` (0088) nhận việc bằng MỘT câu UPDATE
 *      có điều kiện — mỗi bộ tối đa một lượt mỗi 10 phút, dù bao nhiêu thẻ/máy cùng mở.
 *   3. Hạn mức Drive: tối đa 3 bộ cùng mở lại một lúc trên toàn studio ('ban' → máy
 *      khách thử lại sau); lời gọi Drive vẫn đi qua `driveFetch` (lùi lại khi 429/5xx).
 *   4. Bộ không thu gọn: route trả ngay, không đụng Drive. Màn khách chỉ gọi route
 *      này khi `/api/g/gallery` báo `thuGon: true` — bộ bình thường không thêm lượt nào.
 *
 * Chưa áp 0088 (cột/hàm chưa có) thì mọi câu ở đây báo "không thu gọn" — tính năng
 * nằm im, không lỗi.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SHARE_ROLES, type ShareRole } from "@/types/domain";

/**
 * BB-360 — vai được kích "mở lại toàn bộ ảnh": MỌI vai của link gia đình (ba mẹ và người
 * thân). Việc này chỉ nạp lại danh sách ảnh của chính bộ đó, không đổi lựa chọn; chặn trùng
 * và hạn mức Drive vẫn do `nhan_mo_lai_anh` (khoá + 10 phút/bộ + tối đa 3 bộ) lo.
 */
export const VAI_MO_LAI_ANH: readonly ShareRole[] = SHARE_ROLES;

export type KetQuaNhanMoLai = "khong_thu_gon" | "dang_mo" | "ban" | "da_nhan";

const HOP_LE: readonly KetQuaNhanMoLai[] = ["khong_thu_gon", "dang_mo", "ban", "da_nhan"];

/** Bộ này có đang ở trạng thái "danh sách ảnh đã thu gọn" không. Lỗi/chưa áp 0088 → false. */
export async function boDangThuGon(db: SupabaseClient, galleryId: string): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("galleries")
      .select("danh_sach_thu_gon_luc")
      .eq("id", galleryId)
      .maybeSingle();
    if (error || !data) return false;
    return (data as { danh_sach_thu_gon_luc: string | null }).danh_sach_thu_gon_luc != null;
  } catch {
    return false;
  }
}

/** Gọi hàm SQL nhận việc. Hàm chưa có (chưa áp 0088) hay trả lạ → "khong_thu_gon". */
export async function nhanMoLaiAnh(db: SupabaseClient, galleryId: string): Promise<KetQuaNhanMoLai> {
  try {
    const { data, error } = await db.rpc("nhan_mo_lai_anh", { p_gallery_id: galleryId });
    if (error) return "khong_thu_gon";
    return HOP_LE.includes(data as KetQuaNhanMoLai) ? (data as KetQuaNhanMoLai) : "khong_thu_gon";
  } catch {
    return "khong_thu_gon";
  }
}
