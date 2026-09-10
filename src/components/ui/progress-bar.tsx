import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const progressBarVariants = cva(
  "w-full overflow-hidden rounded-full bg-[var(--bb-surface-2)] border border-[var(--bb-border)]/40",
  {
    variants: {
      size: {
        sm: "h-2",
        default: "h-3",
        lg: "h-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

const progressIndicatorVariants = cva(
  "h-full transition-all duration-300 ease-out rounded-full",
  {
    variants: {
      variant: {
        default: "bg-[var(--bb-primary)]",
        accent: "bg-[var(--bb-accent)]",
        success: "bg-[var(--bb-success)]",
        warning: "bg-[var(--bb-warning)]",
        danger: "bg-[var(--bb-danger)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface ProgressBarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressBarVariants>,
    VariantProps<typeof progressIndicatorVariants> {
  value?: number;
  max?: number;
  label?: string;
  showValue?: boolean;
}

const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      className,
      value = 0,
      max = 100,
      size,
      variant,
      label,
      showValue = false,
      ...props
    },
    ref
  ) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    return (
      <div className="w-full space-y-1">
        {(label || showValue) && (
          <div className="flex justify-between text-xs font-medium text-[var(--bb-fg-muted)]">
            {label && <span>{label}</span>}
            {showValue && <span>{Math.round(percentage)}%</span>}
          </div>
        )}
        <div
          ref={ref}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
          className={cn(progressBarVariants({ size, className }))}
          {...props}
        >
          <div
            className={cn(progressIndicatorVariants({ variant }))}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);
ProgressBar.displayName = "ProgressBar";

export { ProgressBar, ProgressBar as Progress };
