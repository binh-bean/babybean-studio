import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--bb-primary)] focus:ring-offset-2",
  {
    variants: {
      /* BB-318 (Q-b) — MỘT kiểu huy hiệu cho cả quản trị: nền nhạt (token ở
         độ trong suốt thấp) + chữ đậm CÙNG TÔNG, không viền, không nền đặc.
         Trước đây có 4 kiểu (nền đặc hồng cam, nền đặc xanh sage, viền, be).
         Chỉ dùng token sẵn có, không thêm màu mới. */
      variant: {
        default:
          "bg-[var(--bb-primary)]/25 text-[color-mix(in_srgb,var(--bb-primary)_35%,var(--bb-fg))]",
        accent:
          "bg-[var(--bb-accent)]/25 text-[var(--bb-accent-fg)]",
        /* BB-283: chip sage NHẠT cho chip "% so kỳ trước" khi biến động tốt. */
        "soft-accent":
          "bg-[var(--bb-accent-soft)] text-[var(--bb-accent-soft-fg)]",
        secondary:
          "bg-[var(--bb-surface-2)] text-[var(--bb-fg)]",
        /* Trung tính: nền be nhạt + chữ mực; dùng cho số đếm, nhãn phụ. */
        outline:
          "bg-[var(--bb-surface-2)] text-[var(--bb-fg-muted)]",
        success:
          "bg-[var(--bb-success)]/15 text-[color-mix(in_srgb,var(--bb-success)_70%,black)]",
        /* Cảnh báo dùng tông đất nung của hệ (--bb-danger), không dùng cam.
           BB-323 (axe, bb-277): chữ --bb-danger THUẦN trên nền --bb-danger/10
           chỉ đạt 3,97:1 ở cỡ 12px ("Khách đang chọn ảnh", chi tiết bộ ảnh) —
           dưới ngưỡng 4,5 của WCAG AA. Chữ nay pha 70% --bb-danger + 30%
           --bb-fg (cùng cách pha của biến thể `default`, không thêm màu mới):
           trên nền trang --bb-bg đạt 5,58:1 (/10) và 5,23:1 (/15); ca xấu
           nhất — nền /15 trên thẻ --bb-surface-2 — vẫn 4,82:1 (trước: 3,44). */
        warning:
          "bg-[var(--bb-danger)]/10 text-[color-mix(in_srgb,var(--bb-danger)_70%,var(--bb-fg))]",
        danger:
          "bg-[var(--bb-danger)]/15 text-[color-mix(in_srgb,var(--bb-danger)_70%,var(--bb-fg))]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
