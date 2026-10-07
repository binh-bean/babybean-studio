/**
 * BB-380 — ghi một dòng nhật ký khi KHÁCH tải ảnh gốc về máy (`/api/img/<id>?tai=1`).
 *
 * Trước BB-380 app không ghi lượt tải ở đâu cả, nên số "% khách tải ảnh trước khi
 * chốt" (Sáu con số điều hành) không đo được. Tải cả bộ là hàng trăm lượt gọi —
 * chỉ ghi MỘT dòng cho mỗi (bộ, link) trong `CUA_SO_PHUT` phút để bảng nhật ký
 * không phình trên gói free. Nhân viên tải không ghi (route chỉ gọi ở nhánh khách).
 *
 * Hỏng thì thôi: không bao giờ làm hỏng lượt tải ảnh của khách.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { HANH_DONG_TAI_ANH } from "./hang-so";

export const CUA_SO_PHUT = 30;

/**
 * Phép thử đơn vị (Vitest) KHÔNG BAO GIỜ ghi lượt tải vào bb-dev — kể cả phép thử đã
 * mở cờ `CHO_PHEP_GOI_MANG_TRONG_PHEP_THU` để canh bộ đệm ảnh (bb-286): chúng gọi
 * route ảnh với bộ ảnh Fixture và không dọn nhật ký. Logic ghi được thử trực tiếp
 * trên `ghiLuotTaiAnh` với máy khách giả.
 */
export function nenGhiLuotTai(): boolean {
  return !process.env.VITEST && process.env.NODE_ENV !== "test";
}

export async function ghiLuotTaiAnh(
  admin: SupabaseClient,
  p: { galleryId: string; branchId: string | null; shareLinkId: string | null; now?: Date },
): Promise<"da-ghi" | "da-co" | "loi"> {
  try {
    const now = p.now ?? new Date();
    const tu = new Date(now.getTime() - CUA_SO_PHUT * 60_000).toISOString();
    let q = admin
      .from("activity_logs")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", "gallery")
      .eq("entity_id", p.galleryId)
      .eq("action", HANH_DONG_TAI_ANH)
      .gte("created_at", tu);
    if (p.shareLinkId) q = q.eq("actor_id", p.shareLinkId);
    const { count, error } = await q;
    if (error) return "loi";
    if ((count ?? 0) > 0) return "da-co";
    const { error: e2 } = await admin.from("activity_logs").insert({
      branch_id: p.branchId,
      actor_type: "customer",
      actor_id: p.shareLinkId,
      action: HANH_DONG_TAI_ANH,
      entity_type: "gallery",
      entity_id: p.galleryId,
      metadata: {},
    });
    return e2 ? "loi" : "da-ghi";
  } catch {
    return "loi";
  }
}
