"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "./utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked);
    };

    return (
      <label className="inline-flex items-center justify-center cursor-pointer select-none relative">
        <input
          type="checkbox"
          className="peer sr-only"
          ref={ref}
          checked={checked}
          disabled={disabled}
          onChange={handleChange}
          {...props}
        />
        <span
          className={cn(
            "peer h-5 w-5 shrink-0 rounded-[4px] border border-[var(--bb-border)] bg-[var(--bb-surface)] transition-all flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--bb-primary)] peer-focus-visible:ring-offset-2 peer-checked:bg-[var(--bb-primary)] peer-checked:border-[var(--bb-primary)] peer-checked:text-[var(--bb-primary-fg)] peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
            className
          )}
        >
          {checked ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : null}
        </span>
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
