import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";
import { Card, CardContent } from "./card";

const statCardVariants = cva(
  "transition-all relative overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-[var(--bb-border)]",
        urgent: "border-[var(--bb-danger)]/50 bg-[var(--bb-danger)]/5",
        warning: "border-[var(--bb-warning)]/50 bg-[var(--bb-warning)]/5",
        success: "border-[var(--bb-success)]/50 bg-[var(--bb-success)]/5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface StatCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statCardVariants> {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string | number;
    positive?: boolean;
    label?: string;
  };
}

function StatCard({
  title,
  value,
  description,
  icon,
  trend,
  variant,
  className,
  ...props
}: StatCardProps) {
  return (
    <Card className={cn(statCardVariants({ variant }), className)} {...props}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <p className="text-sm font-medium text-[var(--bb-fg-muted)]">{title}</p>
          {icon && (
            <div className="h-5 w-5 text-[var(--bb-fg-muted)] flex items-center justify-center">
              {icon}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <div className="text-2xl font-bold tracking-tight text-[var(--bb-fg)]">
            {value}
          </div>
          {(description || trend) && (
            <div className="flex items-center text-xs text-[var(--bb-fg-muted)] gap-1.5">
              {trend && (
                <span
                  className={cn(
                    "font-semibold",
                    trend.positive
                      ? "text-[var(--bb-success)]"
                      : "text-[var(--bb-danger)]"
                  )}
                >
                  {trend.positive ? "+" : ""}
                  {trend.value}
                </span>
              )}
              {description && <span>{description}</span>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { StatCard, statCardVariants };
