import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--bb-primary)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--bb-primary)] text-[var(--bb-primary-fg)]",
        accent:
          "bg-[var(--bb-accent)] text-white",
        secondary:
          "bg-[var(--bb-surface-2)] text-[var(--bb-fg)]",
        outline:
          "text-[var(--bb-fg)] border border-[var(--bb-border)]",
        success:
          "bg-[var(--bb-success)]/15 text-[var(--bb-success)] border border-[var(--bb-success)]/30",
        warning:
          "bg-[var(--bb-warning)]/15 text-[var(--bb-warning)] border border-[var(--bb-warning)]/30",
        danger:
          "bg-[var(--bb-danger)]/15 text-[var(--bb-danger)] border border-[var(--bb-danger)]/30",
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
