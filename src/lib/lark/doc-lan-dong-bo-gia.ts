/**
 * Đọc mốc "lần đồng bộ giá gần nhất" (BB-343) cho màn Cài đặt.
 *
 * Tách khỏi component vì component không được nhập `createAdminClient` (eslint);
 * trang Cài đặt đã kiểm quyền `settings:system` trước khi dựng khối này.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { KHOA_LAN_DONG_BO_GAN_NHAT } from "@/lib/lark/dong-bo-gia-san-pham";

export interface LanDongBoGanNhat {
  luc: string;
  soGiaDoi: number;
}

/** null khi chưa có lần nào, hoặc không đọc được (chỉ mất dòng "gần nhất", nút vẫn dùng được). */
export async function docLanDongBoGiaGanNhat(): Promise<LanDongBoGanNhat | null> {
  try {
    const { data } = await createAdminClient()
      .from("settings")
      .select("value")
      .eq("key", KHOA_LAN_DONG_BO_GAN_NHAT)
      .is("branch_id", null)
      .maybeSingle();
    const v = data?.value as { luc?: unknown; soGiaDoi?: unknown } | null | undefined;
    if (v && typeof v.luc === "string") return { luc: v.luc, soGiaDoi: Number(v.soGiaDoi ?? 0) };
  } catch {
    // xem chú thích hàm
  }
  return null;
}
