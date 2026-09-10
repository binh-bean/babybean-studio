import * as React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "./button";
import { cn } from "./utils";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: React.ReactNode;
}

function ErrorState({
  icon,
  title = "Đã xảy ra lỗi",
  description = "Không thể tải dữ liệu, vui lòng thử lại.",
  onRetry,
  retryLabel = "Thử lại",
  action,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 rounded-[var(--bb-radius)] border border-[var(--bb-danger)]/20 bg-[var(--bb-danger)]/5 my-4",
        className
      )}
      {...props}
    >
      <div className="mb-4 rounded-full bg-[var(--bb-danger)]/10 p-4 text-[var(--bb-danger)]">
        {icon || <AlertCircle className="h-8 w-8 stroke-[1.5]" />}
      </div>
      <h3 className="text-base font-semibold text-[var(--bb-fg)] mb-1">
        {title}
      </h3>
      {description && (
        <p className="max-w-md text-sm text-[var(--bb-fg-muted)] mb-4">
          {description}
        </p>
      )}
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          {retryLabel}
        </Button>
      ) : (
        action && <div className="mt-2">{action}</div>
      )}
    </div>
  );
}

export { ErrorState };
