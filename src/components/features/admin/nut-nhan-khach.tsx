/**
 * Nút "Nhắn khách" — BB-331. Mở link "Chat với khách" (ô Lark Hậu Kỳ, đồng
 * bộ vào `customers.facebook`) ở TAB MỚI. Không có link thì không vẽ gì —
 * không có nút chết.
 */
import { MessageCircle } from "lucide-react";
import { linkChatKhach } from "@/lib/lien-lac/link-chat-khach";

export function NutNhanKhach({ url, gonNho = false }: { url: string | null | undefined; gonNho?: boolean }) {
  const href = linkChatKhach(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="nut-nhan-khach"
      title="Mở cuộc trò chuyện với khách (link từ Lark)"
      aria-label="Nhắn khách"
      className={
        gonNho
          ? "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--bb-fg)] transition hover:bg-[var(--bb-surface-2)]"
          : "inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[var(--bb-border)] px-3 text-xs font-medium text-[var(--bb-fg)] transition hover:bg-[var(--bb-surface-2)]"
      }
    >
      <MessageCircle className={gonNho ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
      {!gonNho && "Nhắn khách"}
    </a>
  );
}
