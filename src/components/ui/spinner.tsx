import * as React from "react";
import { Loader2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";
import { vi } from "../../i18n";

const spinnerVariants = cva("animate-spin text-[var(--bb-primary)]", {
  variants: {
    size: {
      sm: "h-4 w-4",
      default: "h-6 w-6",
      lg: "h-8 w-8",
      xl: "h-12 w-12",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export interface SpinnerProps
  extends React.HTMLAttributes<SVGSVGElement>,
    VariantProps<typeof spinnerVariants> {
  label?: string;
}

function Spinner({
  className,
  size,
  label = vi.ui.spinner.label,
  ...props
}: SpinnerProps) {
  return (
    <div role="status" className="inline-flex items-center justify-center">
      <Loader2
        className={cn(spinnerVariants({ size }), className)}
        {...props}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export { Spinner, spinnerVariants };
