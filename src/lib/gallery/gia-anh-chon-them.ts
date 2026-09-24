/**
 * Giá một ảnh chọn thêm mặc định: đọc từ cài đặt, một chỗ duy nhất.
 *
 * OWNER: DEV-BE. Task BB-214(c).
 *
 * ---------------------------------------------------------------------------
 * Vì sao có tệp này
 * ---------------------------------------------------------------------------
 * Cùng luật với `src/lib/gallery/han-chot.ts` (BB-068): số tiền này ĐIỀU
 * KHIỂN thứ khách phải trả cho ảnh vượt hạn mức, và trước BB-214c nó bị chép
 * tay ra ba chỗ (mỗi gói tự có cột `extra_photo_price`, thuật sĩ tạo bộ ảnh có
 * `useState(50000)`, hàm SQL `create_gallery_bundle` rơi về giá của gói) —
 * không chỗ nào là "cài đặt" theo nghĩa chủ studio sửa được ở một nơi.
 *
 * Hàm này chỉ dùng ở NƠI ĐỌC ĐỂ HIỂN THỊ (options cho thuật sĩ). Nguồn sự
 * thật cho việc TẠO bộ ảnh vẫn là hàm SQL `create_gallery_bundle` (migration
 * 0065) — nó tự đọc `settings` bằng câu SQL riêng, không gọi hàm Node này,
 * vì mọi việc phải nằm trong CÙNG một transaction. Hai nơi đọc cùng một khoá
 * `gallery.extra_photo_price_default`, không đồng bộ bằng cách gọi chéo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Dùng khi chưa có dòng cài đặt nào — cùng số với `db/seed`. */
export const GIA_ANH_CHON_THEM_MAC_DINH = 50_000;

export async function giaAnhChonThemMacDinh(admin: SupabaseClient): Promise<number> {
  const { data } = await admin
    .from("settings")
    .select("value")
    .eq("key", "gallery.extra_photo_price_default")
    .is("branch_id", null)
    .maybeSingle();

  const v = (data as { value?: unknown } | null)?.value;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : GIA_ANH_CHON_THEM_MAC_DINH;
}
