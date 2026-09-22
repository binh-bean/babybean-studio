/**
 * Ghi một dòng vào nhật ký thao tác.
 *
 * OWNER: DEV-BE. Task BB-052.
 *
 * ---------------------------------------------------------------------------
 * Vì sao gom thành một hàm
 * ---------------------------------------------------------------------------
 * Rà soát ngày 22/09/2026 trên 34 đường API có ghi dữ liệu: **sáu đường không
 * ghi nhật ký gì cả** — sửa dòng hàng hợp đồng (tiền), mở lại bộ ảnh đã chốt,
 * chuyển file đã chỉnh cho khách, đồng bộ lại ảnh từ Drive, khách đặt ảnh vào
 * sản phẩm in, và khách duyệt hay yêu cầu sửa ảnh.
 *
 * Bốn đường đầu là thao tác của nhân viên trên tiền và trên quyết định của
 * khách. Sáu tháng sau, câu hỏi "ai mở lại bộ này" hay "ai sửa dòng hàng từ
 * 2 triệu xuống 1 triệu" không có chỗ nào trả lời được.
 *
 * Gom thành một hàm vì luật ghi có hai vế dễ quên, và quên vế nào cũng hỏng:
 *
 *  1. **Không bao giờ ném.** Hàm này luôn đứng SAU việc nghiệp vụ đã xong. Ném
 *     ở đây là biến một việc đã thành công thành lỗi 500 trước mặt người dùng
 *     — và tệ hơn, người ta sẽ bấm lại, làm việc đó chạy hai lần.
 *  2. **Hỏng thì phải kêu.** Nuốt lỗi im lặng thì nhật ký rỗng dần mà không ai
 *     biết, đúng bệnh BB-190: `/api/g/submit` ghi trượt cột suốt nhiều tuần vì
 *     `supabase-js` trả lỗi trong `{ error }` chứ không ném, và mã cũ bỏ qua.
 *
 * Những đường ghi nhật ký có sẵn từ trước vẫn giữ câu `insert` tại chỗ: chúng
 * đang chạy đúng và có phép thử neo vào đúng hình dạng metadata của chúng.
 * Đường mới thì dùng hàm này.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DongNhatKy {
  /** Ai làm: nhân viên, khách qua link, hay máy chạy nền. */
  actorType: "staff" | "customer" | "system";
  actorId?: string | null;
  /** Nhãn đọc được khi không có id — ví dụ tên vai, hay "cron". */
  actorLabel?: string | null;
  branchId?: string | null;
  /** Tên thao tác, dạng `nhom.hanh_dong` — xem bảng trong docs/04 mục 4.3. */
  action: string;
  entityType?: string;
  entityId?: string | null;
  /** Bộ ảnh liên quan, để màn nhật ký lọc theo bộ (migration 0051). */
  galleryId?: string | null;
  /**
   * Không nhét dữ liệu cá nhân vào đây: nhật ký đọc được bởi nhiều vai hơn
   * bảng khách hàng (docs/12). Ghi số lượng, mã, trạng thái — đừng ghi tên
   * khách hay số điện thoại.
   */
  metadata?: Record<string, unknown>;
}

export async function ghiNhatKy(dong: DongNhatKy): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("activity_logs").insert({
      actor_type: dong.actorType,
      actor_id: dong.actorId ?? null,
      actor_label: dong.actorLabel ?? null,
      branch_id: dong.branchId ?? null,
      action: dong.action,
      entity_type: dong.entityType ?? null,
      entity_id: dong.entityId ?? null,
      gallery_id: dong.galleryId ?? null,
      metadata: dong.metadata ?? {},
    });
    if (error) {
      console.error(
        JSON.stringify({ evt: "activity_logs.ghi_hut", action: dong.action, loi: error.message }),
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "activity_logs.ghi_hut",
        action: dong.action,
        loi: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
