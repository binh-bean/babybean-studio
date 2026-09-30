/**
 * BB-331 — "Link chat với khách" từ Lark.
 *
 * Ô "Chat với khách" của bảng Hậu Kỳ (dạng [{ link, text }], text là TÊN
 * khách) đã được đồng bộ PHẦN URL vào `customers.facebook`
 * (`scripts/sync-lark-hauky.mjs`, `src/lib/lark/sync-retouch.ts`). Nút
 * "Nhắn khách" mở đúng link đó ở tab mới.
 *
 * Chỉ nhận http(s) — dữ liệu đi từ Lark vào `href`, một chuỗi `javascript:`
 * lọt vào là chạy mã trên màn quản trị.
 */
export function linkChatKhach(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
