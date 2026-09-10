"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";
import { vi } from "../../i18n";

interface SheetContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SheetContext = React.createContext<SheetContextValue | null>(null);

export interface SheetProps {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function Sheet({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
}: SheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  return (
    <SheetContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </SheetContext.Provider>
  );
}

export interface SheetTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const SheetTrigger = React.forwardRef<HTMLButtonElement, SheetTriggerProps>(
  ({ children, onClick, ...props }, ref) => {
    const context = React.useContext(SheetContext);
    return (
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          onClick?.(e);
          context?.onOpenChange(!context.open);
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);
SheetTrigger.displayName = "SheetTrigger";

const SheetClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ children, onClick, ...props }, ref) => {
  const context = React.useContext(SheetContext);
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        onClick?.(e);
        context?.onOpenChange(false);
      }}
      {...props}
    >
      {children}
    </button>
  );
});
SheetClose.displayName = "SheetClose";

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-[var(--bb-surface)] p-6 shadow-2xl transition-transform ease-in-out duration-300 text-[var(--bb-fg)]",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b border-[var(--bb-border)] data-[state=closed]:-translate-y-full data-[state=open]:translate-y-0",
        bottom:
          "inset-x-0 bottom-0 rounded-t-[20px] border-t border-[var(--bb-border)] max-h-[85vh] overflow-y-auto data-[state=closed]:translate-y-full data-[state=open]:translate-y-0",
        left: "inset-y-0 left-0 h-full w-3/4 border-r border-[var(--bb-border)] data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0 sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l border-[var(--bb-border)] data-[state=closed]:translate-x-full data-[state=open]:translate-x-0 sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "bottom",
    },
  }
);

export type SheetContentProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof sheetVariants>;

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ side = "bottom", className, children, ...props }, ref) => {
    const context = React.useContext(SheetContext);
    const open = context?.open;

    React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && open) {
          context?.onOpenChange(false);
        }
      };
      if (open) {
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", handleKeyDown);
      }
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, [open, context]);

    if (!open) return null;

    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in"
          onClick={() => context?.onOpenChange(false)}
          aria-hidden="true"
        />

        {/* Content */}
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          data-state={open ? "open" : "closed"}
          className={cn(sheetVariants({ side }), className)}
          {...props}
        >
          {side === "bottom" && (
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--bb-border)]" />
          )}
          <button
            type="button"
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--bb-primary)] focus:ring-offset-2 p-1"
            onClick={() => context?.onOpenChange(false)}
            aria-label={vi.ui.sheet.closeAria}
          >
            <X className="h-5 w-5" />
          </button>
          {children}
        </div>
      </div>
    );
  }
);
SheetContent.displayName = "SheetContent";

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4",
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-semibold text-[var(--bb-fg)]", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-[var(--bb-fg-muted)]", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
