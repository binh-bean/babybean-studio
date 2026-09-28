/**
 * BB-294 (mục cũ #40) — màu nền avatar chữ cái đầu trong danh sách Khách hàng
 * (quản trị) trước đây LUÔN xám (`--bb-surface-2`/`--bb-fg-muted`) bất kể
 * khách nào — người chấm độc lập ghi "avatar xám một màu". Hàm dưới đây xoay
 * vòng các cặp nền/chữ có sẵn trong bảng màu thương hiệu (không bịa màu mới,
 * chỉ dùng token đã có trong src/styles/tokens.css) theo băm tên khách —
 * cùng một khách luôn ra cùng một màu (deterministic), kể cả qua các trang
 * phân trang khác nhau.
 *
 * BB-303 (bản vẽ BB-301, khach-hang.png; admin duyệt 28/09/2026): mở rộng từ
 * BA lên BỐN màu thương hiệu — bản vẽ ghi rõ "avatar chữ cái dùng 4 màu
 * thương hiệu, cố định theo chữ cái nên mỗi người luôn một màu". Thêm đúng
 * MỘT cặp mới (mực đậm/kem — đảo màu của cặp `m3`, tương phản đã có sẵn ở nơi
 * khác trong tokens.css: `--bb-fg` trên `--bb-cream`), giữ nguyên ba cặp cũ để
 * không đổi màu của các khách đã quen thấy.
 */

export interface MauAvatar {
  bg: string;
  fg: string;
}

/** Kem đậm (sidebar) · sage nhạt (accent-soft) · hồng đất (primary) · mực/kem (đảo màu) — bốn token pastel sẵn có, tương phản đã kiểm ở tokens.css. */
export const BANG_MAU_AVATAR: readonly MauAvatar[] = [
  { bg: "var(--bb-sidebar-bg)", fg: "var(--bb-fg)" },
  { bg: "var(--bb-accent-soft)", fg: "var(--bb-accent-soft-fg)" },
  { bg: "var(--bb-primary)", fg: "var(--bb-primary-fg)" },
  { bg: "var(--bb-fg)", fg: "var(--bb-cream)" },
];

/** Băm chuỗi đơn giản (djb2-lite) — chỉ cần ổn định và rẻ, không cần chống va chạm mật mã. */
export function bamChuoi(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function mauAvatar(seed: string): MauAvatar {
  return BANG_MAU_AVATAR[bamChuoi(seed) % BANG_MAU_AVATAR.length]!;
}

export function mauAvatarStyle(seed: string): { backgroundColor: string; color: string } {
  const { bg, fg } = mauAvatar(seed);
  return { backgroundColor: bg, color: fg };
}
