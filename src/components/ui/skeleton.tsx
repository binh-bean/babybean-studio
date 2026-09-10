import * as React from "react";
import { cn } from "./utils";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--bb-radius-sm)] bg-[var(--bb-surface-2)]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
