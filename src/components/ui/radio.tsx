"use client";

import * as React from "react";
import { cn } from "./utils";

interface RadioGroupContextValue {
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue>({});

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  (
    { className, name, value: controlledValue, defaultValue, onValueChange, disabled, children, ...props },
    ref
  ) => {
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : uncontrolledValue;

    const onChange = (val: string) => {
      if (!isControlled) {
        setUncontrolledValue(val);
      }
      onValueChange?.(val);
    };

    return (
      <RadioGroupContext.Provider value={{ name, value, onChange, disabled }}>
        <div
          role="radiogroup"
          className={cn("grid gap-2", className)}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      </RadioGroupContext.Provider>
    );
  }
);
RadioGroup.displayName = "RadioGroup";

export interface RadioGroupItemProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  value: string;
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, disabled: itemDisabled, ...props }, ref) => {
    const context = React.useContext(RadioGroupContext);
    const checked = context.value === value;
    const disabled = itemDisabled || context.disabled;

    return (
      <label className="inline-flex items-center cursor-pointer select-none relative">
        <input
          type="radio"
          name={context.name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={() => context.onChange?.(value)}
          className="peer sr-only"
          ref={ref}
          {...props}
        />
        <span
          className={cn(
            "peer aspect-square h-5 w-5 rounded-full border border-[var(--bb-border)] bg-[var(--bb-surface)] text-[var(--bb-primary)] ring-offset-background flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--bb-primary)] peer-focus-visible:ring-offset-2 peer-checked:border-[var(--bb-primary)] peer-disabled:cursor-not-allowed peer-disabled:opacity-50 transition-colors",
            className
          )}
        >
          {checked && (
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--bb-primary)]" />
          )}
        </span>
      </label>
    );
  }
);
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
