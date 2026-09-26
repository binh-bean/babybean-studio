import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";

/**
 * BB-250/252 — lời báo "Sản phẩm của bé đã về". Một chỗ duy nhất cho chữ, để
 * đường hook (tức thì) và cron 08:00 (lưới đỡ) nói cùng một câu.
 * Không bao giờ ném (guiThongBaoBoAnh tự nuốt lỗi và ghi log).
 */
export async function baoHinhDaVe(galleryId: string): Promise<void> {
  await guiThongBaoBoAnh(createAdminClient(), galleryId, {
    tieuDe: "Sản phẩm của bé đã về",
    noiDung: "Mời ba mẹ ghé studio nhận ảnh nhé.",
    loai: "hinh_da_ve",
  });
}
