import React from "react";
import { cn } from "./utils";

export const CUSTOMER_STEPS = [
  { step: 1, label: "Đã chụp xong" },
  { step: 2, label: "Ảnh đã sẵn sàng, mời bạn chọn" },
  { step: 3, label: "Bạn đang chọn ảnh" },
  { step: 4, label: "Đã chốt, đang chỉnh ảnh" },
  { step: 5, label: "Ảnh chỉnh xong" },
  { step: 6, label: "Đang in và giao" },
] as const;

export function CustomerProgress({ currentStep, className }: { currentStep: number, className?: string }) {
  return (
    <div className={cn("w-full py-4", className)}>
      {/* Mobile view */}
      <div className="md:hidden flex flex-col gap-2">
        <div className="font-semibold text-sm text-muted-foreground">Bước {currentStep}/6</div>
        <div className="text-lg font-bold">
          {CUSTOMER_STEPS.find((s) => s.step === currentStep)?.label}
        </div>
        <div className="flex gap-1 mt-2">
          {CUSTOMER_STEPS.map((s) => (
            <div 
              key={s.step} 
              className={cn(
                "h-1.5 flex-1 rounded-full",
                s.step <= currentStep ? "bg-primary" : "bg-muted"
              )} 
            />
          ))}
        </div>
      </div>

      {/* Desktop view */}
      <div className="hidden md:flex flex-row justify-between relative px-8">
        <div className="absolute top-4 left-10 right-10 h-[2px] bg-muted -z-10" />
        <div 
          className="absolute top-4 left-10 h-[2px] bg-primary -z-10 transition-all" 
          style={{ width: `calc(${((Math.max(1, currentStep) - 1) / 5) * 100}% - 2.5rem)` }}
        />
        
        {CUSTOMER_STEPS.map((s) => {
          const isActive = s.step === currentStep;
          const isCompleted = s.step < currentStep;
          return (
            <div key={s.step} className="flex flex-col items-center gap-2 w-28 text-center bg-background">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 bg-background z-10",
                isActive ? "border-primary text-primary" : 
                isCompleted ? "bg-primary border-primary text-primary-foreground" : "border-muted text-muted-foreground"
              )}>
                {isCompleted ? "✓" : s.step}
              </div>
              <span className={cn(
                "text-xs leading-tight",
                isActive ? "font-bold text-foreground" : "text-muted-foreground"
              )}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

