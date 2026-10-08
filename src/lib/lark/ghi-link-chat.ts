/**
 * BB-404 — ghi link chat RIÊNG của khách (Lark "👑 Khách Hàng" → "link chat";
 * lookup "Chat với khách" ở Hậu Kỳ) vào `customers.facebook` KHI ĐANG TRỐNG.
 *
 * Dùng ở mọi đường tạo/gắn khách từ Lark: thuật sĩ tạo bộ (`POST /api/admin/galleries`),
 * gắn dòng Hậu Kỳ (`.../gan-lark`), đồng bộ Hậu Kỳ (`sync-retouch.ts`, cả nhánh
 * `already_exists`) — nút "Đồng bộ ngay" khách hàng chạy đúng đường đồng bộ đó.
 *
 * Luật:
 *   · chỉ ghi URL http(s) hợp lệ (`linkChatKhach`) — phần `text` của ô Lark là TÊN
 *     KHÁCH, không bao giờ tới đây (`extractChatLink` đã bỏ);
 *   · KHÔNG đè giá trị nhân viên đã sửa tay — chỉ ghi khi NULL hoặc chuỗi trắng;
 *   · ghi có điều kiện (so lại giá trị cũ) để hai lượt cùng lúc không đè nhau;
 *   · lỗi không làm hỏng việc tạo/gắn bộ — người gọi chỉ ghi nhận kết quả.
 *
 * Tên cột `facebook` giữ nguyên (không thêm cột 0109): mọi màn/API quản trị đã đọc
 * cột này qua `linkChatKhach` → `chatUrl`; thêm cột mới chỉ sinh hai nguồn cho cùng
 * một link.
 */
// KHÔNG `import "server-only"`: sync-retouch.ts (nạp tệp này) còn chạy trong script tsx ngoài Next.
import type { SupabaseClient } from "@supabase/supabase-js";
import { linkChatKhach } from "@/lib/lien-lac/link-chat-khach";

export type KetQuaGhiLinkChat = "da_ghi" | "da_co" | "khong_co_link" | "khong_thay_khach" | "loi";

/** Giá trị cũ coi là "trống": null/undefined/chuỗi chỉ có khoảng trắng. */
export function linkChatDangTrong(cu: unknown): boolean {
  return cu == null || (typeof cu === "string" && cu.trim() === "");
}

/** Đường Supabase (route quản trị dùng admin client). */
export async function ghiLinkChatNeuTrong(
  admin: SupabaseClient,
  customerId: string | null | undefined,
  linkTho: unknown,
): Promise<KetQuaGhiLinkChat> {
  const link = linkChatKhach(linkTho);
  if (!customerId || !link) return "khong_co_link";
  try {
    const { data: khach, error: e1 } = await admin.from("customers").select("id, facebook").eq("id", customerId).maybeSingle();
    if (e1) throw e1;
    if (!khach) return "khong_thay_khach";
    const cu = (khach as { facebook?: unknown }).facebook;
    if (!linkChatDangTrong(cu)) return "da_co";
    let q = admin.from("customers").update({ facebook: link }).eq("id", customerId);
    q = cu == null ? q.is("facebook", null) : q.eq("facebook", cu as string);
    const { data, error } = await q.select("id");
    if (error) throw error;
    return (data ?? []).length > 0 ? "da_ghi" : "da_co";
  } catch (e) {
    console.error(JSON.stringify({ evt: "lark.ghi_link_chat.loi", loi: (e as { message?: string } | null)?.message ?? String(e) }));
    return "loi";
  }
}

/** Câu SQL dùng chung cho đường `pg` (đồng bộ Hậu Kỳ): chỉ ghi khi trống. */
export const SQL_GHI_LINK_CHAT_NEU_TRONG = `update customers set facebook = $1
  where id = $2 and nullif(btrim(coalesce(facebook, '')), '') is null`;

/** Đường `pg` (sync-retouch). */
export async function ghiLinkChatNeuTrongPg(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount?: number | null }> },
  customerId: string | null | undefined,
  linkTho: unknown,
): Promise<KetQuaGhiLinkChat> {
  const link = linkChatKhach(linkTho);
  if (!customerId || !link) return "khong_co_link";
  try {
    const kq = await client.query(SQL_GHI_LINK_CHAT_NEU_TRONG, [link, customerId]);
    return (kq.rowCount ?? 0) > 0 ? "da_ghi" : "da_co";
  } catch (e) {
    console.error(JSON.stringify({ evt: "lark.ghi_link_chat.loi", loi: (e as { message?: string } | null)?.message ?? String(e) }));
    return "loi";
  }
}
