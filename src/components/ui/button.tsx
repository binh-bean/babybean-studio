import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--bb-radius-sm)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--bb-primary)] text-[var(--bb-primary-fg)] shadow hover:opacity-90 active:opacity-100",
        accent:
          "bg-[var(--bb-accent)] text-white shadow hover:opacity-90 active:opacity-100",
        secondary:
          "bg-[var(--bb-surface-2)] text-[var(--bb-fg)] hover:bg-[var(--bb-border)]/60",
        outline:
          "border border-[var(--bb-border)] bg-transparent text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)]",
        ghost:
          "text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)] hover:text-[var(--bb-fg)]",
        danger:
          "bg-[var(--bb-danger)] text-white shadow hover:opacity-90",
        link:
          "text-[var(--bb-primary)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2 min-h-[44px]", // Mobile-first >=44px
        sm: "h-9 rounded-[var(--bb-radius-sm)] px-3 text-xs min-h-[36px]",
        lg: "h-12 rounded-[var(--bb-radius)] px-8 text-base min-h-[48px]",
        icon: "h-11 w-11 min-h-[44px] min-w-[44px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild: _asChild, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
