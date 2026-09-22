/**
 * Hạn chốt của bộ ảnh: đọc từ cài đặt, một chỗ duy nhất.
 *
 * OWNER: DEV-BE. Task BB-068.
 *
 * ---------------------------------------------------------------------------
 * Vì sao phải có tệp này
 * ---------------------------------------------------------------------------
 * Dòng `gallery.default_due_days` nằm trong màn Cài đặt, ghi rõ "Bao nhiêu ngày
 * kể từ lúc GỬI LINK thì khách phải chốt". Nhưng đo ngày 22/09/2026 trên
 * bb-dev: **488/488 bộ ảnh có `due_at` rỗng**, và không đường nào ghi
 * `galleries.sent_at`.
 *
 * Nên chuỗi này đứt từ đầu tới cuối mà mọi khâu đều báo xanh:
 *
 *   - Chủ studio đổi số 7 thành 10 trong Cài đặt → không có gì đổi.
 *   - `expire_overdue_galleries()` lọc `due_at < now()`, mà `due_at` luôn rỗng
 *     → lượt cron hằng ngày trả "expiredGalleries: 0" mãi mãi, trông như
 *     "hôm nay không có bộ nào tới hạn".
 *   - Màn khách không hiện hạn nào, màn quản trị cột "Hạn" luôn trống, và
 *     Bảng điều khiển sắp xếp theo `due_at` thì không có gì để sắp.
 *
 * Mốc tính là **lúc tạo link gửi khách**, không phải lúc tạo bộ ảnh: bộ ảnh
 * sinh ra từ đường đồng bộ Lark ngay khi thợ chỉnh xong, còn khách chỉ bắt đầu
 * đếm ngày từ lúc CSKH gửi link cho họ. Đúng như câu mô tả trong màn Cài đặt.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Dùng khi chưa có dòng cài đặt nào — cùng số với `db/seed`. */
export const HAN_CHOT_MAC_DINH = 7;

/**
 * Số ngày khách có để chốt, kể từ lúc nhận link.
 *
 * Không ném: đường gọi là lúc CSKH bấm "Tạo link gửi khách". Cài đặt đọc hụt
 * thì lấy mặc định rồi đi tiếp, chứ không chặn việc gửi ảnh cho khách.
 */
export async function soNgayHanChot(
  admin: SupabaseClient,
  branchId?: string | null,
): Promise<number> {
  const doc = async (bId: string | null) => {
    let q = admin.from("settings").select("value").eq("key", "gallery.default_due_days");
    q = bId === null ? q.is("branch_id", null) : q.eq("branch_id", bId);
    const { data } = await q.maybeSingle();
    const v = (data as { value?: unknown } | null)?.value;
    return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 90 ? v : null;
  };

  // Chi nhánh trước, chung sau — cùng luật với `timWebhook` của đường Lark.
  if (branchId) {
    const rieng = await doc(branchId);
    if (rieng !== null) return rieng;
  }
  return (await doc(null)) ?? HAN_CHOT_MAC_DINH;
}

/** Mốc hạn chốt tính từ bây giờ, dạng ISO. */
export function hanChotTuHomNay(soNgay: number): string {
  const han = new Date();
  han.setDate(han.getDate() + soNgay);
  return han.toISOString();
}
