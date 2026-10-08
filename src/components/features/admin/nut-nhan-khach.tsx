"use client";

/**
 * Nút "Nhắn khách" — BB-331, mở rộng BB-404.
 *
 * Mở link chat RIÊNG của từng khách (ô Lark "👑 Khách Hàng" → "link chat", lookup
 * "Chat với khách" ở Hậu Kỳ; đồng bộ PHẦN URL vào `customers.facebook`) ở TAB MỚI.
 * KHÔNG nhầm với `branch.chatUrl` (kênh chat chung của chi nhánh, màn khách).
 *
 * BB-404 (anh 08/10): khách chưa có link → nút XÁM "Chưa có link chat" kèm gợi ý
 * "Đồng bộ từ Lark", không ẩn hẳn — để nhân viên biết đang thiếu. Chỗ phụ đã có
 * nút chính ngay bên cạnh (vd khối link gia đình trong chi tiết bộ) truyền
 * `anKhiTrong` để khỏi vẽ hai ô xám.
 *
 * Chỉ nhận http(s) (`linkChatKhach`) — dữ liệu từ Lark đi thẳng vào `href`.
 * Bấm nút không lan lên dòng/thẻ cha (nhiều danh sách bấm cả dòng để mở hồ sơ).
 */
import * as React from "react";
import { MessageCircle } from "lucide-react";
import { linkChatKhach } from "@/lib/lien-lac/link-chat-khach";

export const CHU_NHAN_KHACH = {
  nhan: "Nhắn khách",
  moTa: "Mở cuộc trò chuyện với khách (link chat từ Lark)",
  chuaCo: "Chưa có link chat",
  goiY: "Đồng bộ từ Lark",
  goiYDayDu: "Chưa có link chat — bấm “Đồng bộ ngay” ở màn Khách hàng để lấy từ Lark",
} as const;

/** Trang có nút "Đồng bộ ngay" khách hàng (`POST /api/admin/customers/dong-bo`). */
const TRANG_DONG_BO = "/admin/customers";

function chanLan(e: React.MouseEvent) {
  e.stopPropagation();
}

export function NutNhanKhach({
  url,
  gonNho = false,
  anKhiTrong = false,
}: {
  url: string | null | undefined;
  /** Chỉ icon (dòng danh sách/thẻ). */
  gonNho?: boolean;
  /** Không có link thì không vẽ gì (chỗ phụ, đã có nút chính cạnh đó). */
  anKhiTrong?: boolean;
}) {
  const href = linkChatKhach(url);

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="nut-nhan-khach"
        title={CHU_NHAN_KHACH.moTa}
        aria-label={CHU_NHAN_KHACH.nhan}
        onClick={chanLan}
        className={
          gonNho
            ? "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--bb-fg)] transition hover:bg-[var(--bb-surface-2)]"
            : "inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[var(--bb-border)] px-3 text-xs font-medium text-[var(--bb-fg)] transition hover:bg-[var(--bb-surface-2)]"
        }
      >
        <MessageCircle className={gonNho ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
        {!gonNho && CHU_NHAN_KHACH.nhan}
      </a>
    );
  }

  if (anKhiTrong) return null;

  if (gonNho) {
    return (
      <button
        type="button"
        aria-disabled="true"
        data-testid="nut-nhan-khach-trong"
        title={CHU_NHAN_KHACH.goiYDayDu}
        onClick={chanLan}
        className="inline-flex h-8 w-8 shrink-0 cursor-not-allowed items-center justify-center rounded-md text-[var(--bb-fg-muted)] opacity-50"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{`${CHU_NHAN_KHACH.chuaCo} — ${CHU_NHAN_KHACH.goiY}`}</span>
      </button>
    );
  }

  return (
    <span className="inline-flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1" data-testid="nut-nhan-khach-trong">
      <span
        aria-disabled="true"
        title={CHU_NHAN_KHACH.goiYDayDu}
        className="inline-flex h-8 cursor-not-allowed items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-[var(--bb-border)] px-3 text-xs font-medium text-[var(--bb-fg-muted)] opacity-70"
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        {CHU_NHAN_KHACH.chuaCo}
      </span>
      <a
        href={TRANG_DONG_BO}
        onClick={chanLan}
        data-testid="goi-y-dong-bo-lark"
        title={CHU_NHAN_KHACH.goiYDayDu}
        className="whitespace-nowrap text-xs text-[var(--bb-fg-muted)] underline underline-offset-2 hover:text-[var(--bb-fg)]"
      >
        {CHU_NHAN_KHACH.goiY}
      </a>
    </span>
  );
}
