import * as React from "react";
import { ImageOff } from "lucide-react";
import { cn } from "./utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 rounded-[var(--bb-radius)] border border-dashed border-[var(--bb-border)] bg-[var(--bb-surface)]/50 my-4",
        className
      )}
      {...props}
    >
      <div className="mb-4 rounded-full bg-[var(--bb-surface-2)] p-4 text-[var(--bb-primary)]">
        {icon || <ImageOff className="h-8 w-8 stroke-[1.5]" />}
      </div>
      <h3 className="text-base font-semibold text-[var(--bb-fg)] mb-1">
        {title}
      </h3>
      {description && (
        <p className="max-w-md text-sm text-[var(--bb-fg-muted)] mb-4">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export { EmptyState };
