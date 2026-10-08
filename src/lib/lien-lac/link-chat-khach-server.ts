/**
 * BB-404 — đọc link chat RIÊNG của nhiều khách trong MỘT truy vấn (không N+1), cho
 * các API quản trị trả dòng bộ ảnh/khách (`chatUrl` → nút "Nhắn khách").
 *
 * Chỉ dùng ở API QUẢN TRỊ. API khách (`/api/g/**`, `/api/k/**`) không được gọi —
 * link chat của khách không trả ra màn khách.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { linkChatKhach } from "@/lib/lien-lac/link-chat-khach";

export async function layLinkChatTheoKhach(
  admin: SupabaseClient,
  customerIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string | null>> {
  const ids = [...new Set(customerIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
  const kq = new Map<string, string | null>();
  if (ids.length === 0) return kq;
  const { data, error } = await admin.from("customers").select("id, facebook").in("id", ids);
  if (error) {
    // Thiếu link chat không được làm hỏng cả màn — nút chỉ hiện xám.
    console.error(JSON.stringify({ evt: "link_chat_khach.doc_loi", loi: error.message }));
    return kq;
  }
  for (const r of (data ?? []) as { id: unknown; facebook: unknown }[]) {
    kq.set(String(r.id), linkChatKhach(r.facebook));
  }
  return kq;
}

/** Số id mỗi lượt `.in()` — giữ địa chỉ PostgREST ngắn. */
const LO = 150;

/**
 * BB-404 — link chat của khách theo TỪNG BỘ ẢNH, cho các hàng đợi "Việc cần xử lý"
 * (trả kèm `chatTheoBo` cạnh `nha`). Một truy vấn mỗi lô (galleries ⋈ customers),
 * không N+1. Không bao giờ ném lỗi — lỗi thì trả rỗng, nút chỉ hiện xám.
 */
export async function layLinkChatTheoBo(
  admin: SupabaseClient,
  galleryIds: ReadonlyArray<string | null | undefined>,
): Promise<Record<string, string | null>> {
  const ids = [...new Set(galleryIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
  const kq: Record<string, string | null> = {};
  try {
    for (let i = 0; i < ids.length; i += LO) {
      const { data, error } = await admin
        .from("galleries")
        .select("id, customers(facebook)")
        .in("id", ids.slice(i, i + LO));
      if (error) throw error;
      for (const g of (data ?? []) as { id: unknown; customers: unknown }[]) {
        const kh = Array.isArray(g.customers) ? g.customers[0] : g.customers;
        kq[String(g.id)] = linkChatKhach((kh as { facebook?: unknown } | null)?.facebook);
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ evt: "link_chat_khach.doc_theo_bo_loi", loi: (e as { message?: string } | null)?.message ?? String(e) }));
  }
  return kq;
}
