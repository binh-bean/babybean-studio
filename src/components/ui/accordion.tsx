"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./utils";

interface AccordionContextValue {
  value: string[];
  toggleItem: (value: string) => void;
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

export interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: "single" | "multiple";
  defaultValue?: string | string[];
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
}

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  (
    {
      type = "single",
      defaultValue,
      value: controlledValue,
      onValueChange,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const toArray = (v: string | string[] | undefined): string[] => {
      if (!v) return [];
      return Array.isArray(v) ? v : [v];
    };

    const [uncontrolledValue, setUncontrolledValue] = React.useState<string[]>(
      toArray(defaultValue)
    );
    const isControlled = controlledValue !== undefined;
    const value = isControlled ? toArray(controlledValue) : uncontrolledValue;

    const toggleItem = React.useCallback(
      (itemValue: string) => {
        let nextValue: string[];
        if (type === "single") {
          nextValue = value.includes(itemValue) ? [] : [itemValue];
        } else {
          nextValue = value.includes(itemValue)
            ? value.filter((v) => v !== itemValue)
            : [...value, itemValue];
        }

        if (!isControlled) {
          setUncontrolledValue(nextValue);
        }
        onValueChange?.(type === "single" ? nextValue[0] || "" : nextValue);
      },
      [type, value, isControlled, onValueChange]
    );

    return (
      <AccordionContext.Provider value={{ value, toggleItem }}>
        <div ref={ref} className={cn("divide-y divide-[var(--bb-border)]", className)} {...props}>
          {children}
        </div>
      </AccordionContext.Provider>
    );
  }
);
Accordion.displayName = "Accordion";

interface AccordionItemContextValue {
  value: string;
}

const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(
  null
);

export interface AccordionItemProps
  extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ className, value, children, ...props }, ref) => {
    return (
      <AccordionItemContext.Provider value={{ value }}>
        <div
          ref={ref}
          className={cn("border-b border-[var(--bb-border)]", className)}
          {...props}
        >
          {children}
        </div>
      </AccordionItemContext.Provider>
    );
  }
);
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, onClick, ...props }, ref) => {
  const accordion = React.useContext(AccordionContext);
  const item = React.useContext(AccordionItemContext);
  const isOpen = item && accordion ? accordion.value.includes(item.value) : false;

  return (
    <div className="flex">
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          onClick?.(e);
          if (item) accordion?.toggleItem(item.value);
        }}
        aria-expanded={isOpen}
        className={cn(
          "flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline text-[var(--bb-fg)] [&[aria-expanded=true]>svg]:rotate-180 min-h-[44px]",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 text-[var(--bb-fg-muted)]" />
      </button>
    </div>
  );
});
AccordionTrigger.displayName = "AccordionTrigger";

const AccordionContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const accordion = React.useContext(AccordionContext);
  const item = React.useContext(AccordionItemContext);
  const isOpen = item && accordion ? accordion.value.includes(item.value) : false;

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "overflow-hidden pb-4 pt-0 text-sm text-[var(--bb-fg-muted)] animate-in fade-in-50",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
