"use client";

import * as React from "react";
import { cn } from "./utils";

interface TooltipContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  contentId: string;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

export interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
}

function TooltipProvider({ children }: TooltipProviderProps) {
  return <>{children}</>;
}

export interface TooltipRootProps {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Simple usage fallback
  content?: React.ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}

function Tooltip({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  content,
  className,
  side = "top",
}: TooltipRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const contentId = React.useId();

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange]
  );

  // If simple usage with content prop
  if (content !== undefined) {
    return (
      <TooltipProvider>
        <Tooltip open={open} onOpenChange={handleOpenChange}>
          <TooltipTrigger asChild>{children}</TooltipTrigger>
          <TooltipContent side={side} className={className}>
            {content}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipContext.Provider
      value={{ open, setOpen: handleOpenChange, contentId }}
    >
      <div className="relative inline-flex">{children}</div>
    </TooltipContext.Provider>
  );
}

export interface TooltipTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const TooltipTrigger = React.forwardRef<HTMLButtonElement, TooltipTriggerProps>(
  ({ children, asChild, className, ...props }, ref) => {
    const context = React.useContext(TooltipContext);

    const handlers = {
      onMouseEnter: () => context?.setOpen(true),
      onMouseLeave: () => context?.setOpen(false),
      onFocus: () => context?.setOpen(true),
      onBlur: () => context?.setOpen(false),
      "aria-describedby": context?.open ? context.contentId : undefined,
    };

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<Record<string, unknown>>;
      return React.cloneElement(child, {
        ...handlers,
        ref,
      });
    }

    return (
      <button
        ref={ref}
        type="button"
        className={cn("inline-flex", className)}
        {...handlers}
        {...props}
      >
        {children}
      </button>
    );
  }
);
TooltipTrigger.displayName = "TooltipTrigger";

export interface TooltipContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
}

const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, side = "top", children, ...props }, ref) => {
    const context = React.useContext(TooltipContext);

    if (!context?.open) return null;

    const sideClasses = {
      top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
      bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
      left: "right-full top-1/2 -translate-y-1/2 mr-2",
      right: "left-full top-1/2 -translate-y-1/2 ml-2",
    };

    return (
      <div
        ref={ref}
        id={context.contentId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-[var(--bb-radius-sm)] bg-[var(--bb-fg)] px-2.5 py-1 text-xs text-[var(--bb-bg)] shadow-md animate-in fade-in-0 zoom-in-95",
          sideClasses[side],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
