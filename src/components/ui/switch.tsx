"use client";

import * as React from "react";
import { cn } from "./utils";

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked);
    };

    return (
      <label className="inline-flex items-center cursor-pointer select-none relative">
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
            "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-[var(--bb-border)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--bb-primary)] peer-focus-visible:ring-offset-2 peer-checked:bg-[var(--bb-primary)] peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
            className
          )}
        >
          <span
            className={cn(
              "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
              checked ? "translate-x-5" : "translate-x-0"
            )}
          />
        </span>
      </label>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
