"use client";

import React, { useState, useRef, useEffect } from "react";
import { vi, interpolate } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";
import { Lock, AlertCircle, Phone } from "lucide-react";

interface PinFormProps {
  token: string;
  hotline?: string;
}

export function PinForm({ token, hotline = "0901 000 001" }: PinFormProps) {
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [lockSeconds, setLockSeconds] = useState<number | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Focus ô đầu tiên khi mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Đếm ngược khi bị khóa PIN
  useEffect(() => {
    if (lockSeconds === null || lockSeconds <= 0) {
      if (isLocked && lockSeconds === 0) {
        setIsLocked(false);
        setLockSeconds(null);
        setErrorMessage(null);
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      }
      return;
    }

    const timer = setInterval(() => {
      setLockSeconds((prev) => {
        if (prev === null || prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockSeconds, isLocked]);

  const submitPin = async (pinString: string) => {
    if (isLoading || isLocked) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin: pinString }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.data?.success) {
        // Chuyển hướng về gallery của khách hàng sau khi xác thực thành công
        window.location.href = `/g/${token}`;
        return;
      }

      const errorCode = data?.error?.code;

      if (errorCode === "PIN_INVALID") {
        const remainingAttempts = data?.error?.details?.remainingAttempts ?? 0;

        // Kích hoạt hiệu ứng rung
        setIsShaking(true);
        if (containerRef.current) {
          containerRef.current.animate(
            [
              { transform: "translateX(0)" },
              { transform: "translateX(-8px)" },
              { transform: "translateX(8px)" },
              { transform: "translateX(-6px)" },
              { transform: "translateX(6px)" },
              { transform: "translateX(0)" },
            ],
            { duration: 400, easing: "ease-in-out" }
          );
        }
        setTimeout(() => setIsShaking(false), 450);

        // Xoá cả 4 ô và focus lại ô đầu tiên
        setPin(["", "", "", ""]);
        inputRefs.current[0]?.focus();

        setErrorMessage(
          interpolate(vi.gallery.pinWrong, { n: remainingAttempts })
        );
      } else if (errorCode === "PIN_LOCKED") {
        const retryAfter = Number(data?.error?.details?.retryAfter) || 900;
        setIsLocked(true);
        setLockSeconds(retryAfter);
        setPin(["", "", "", ""]);

        const minutes = Math.max(1, Math.ceil(retryAfter / 60));
        setErrorMessage(
          interpolate(vi.gallery.pinLocked, { m: minutes })
        );
      } else if (errorCode === "NOT_FOUND" || res.status === 404) {
        // Token sai / link thu hồi / link hết hạn -> CÙNG một thông báo không phân biệt
        setPin(["", "", "", ""]);
        setErrorMessage(vi.gallery.notFoundBody);
      } else if (errorCode === "RATE_LIMITED" || res.status === 429) {
        setErrorMessage(vi.api.rateLimited);
      } else {
        setErrorMessage(vi.api.internal);
      }
    } catch {
      setErrorMessage(vi.common.error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (index: number, value: string) => {
    if (isLocked || isLoading) return;

    // Chỉ nhận ký tự số
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned) {
      const newPin = [...pin];
      newPin[index] = "";
      setPin(newPin);
      return;
    }

    const char = cleaned.slice(-1);
    const newPin = [...pin];
    newPin[index] = char;
    setPin(newPin);

    if (index < 3) {
      inputRefs.current[index + 1]?.focus();
    } else {
      // Đủ 4 số -> tự động submit
      const fullPin = newPin.join("");
      if (fullPin.length === 4) {
        submitPin(fullPin);
      }
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (isLocked || isLoading) return;

    if (e.key === "Backspace") {
      if (!pin[index] && index > 0) {
        const newPin = [...pin];
        newPin[index - 1] = "";
        setPin(newPin);
        inputRefs.current[index - 1]?.focus();
      } else if (pin[index]) {
        const newPin = [...pin];
        newPin[index] = "";
        setPin(newPin);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (isLocked || isLoading) return;

    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 4);

    if (!pasted) return;

    const newPin = ["", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      newPin[i] = pasted[i] ?? "";
    }
    setPin(newPin);

    if (pasted.length === 4) {
      inputRefs.current[3]?.focus();
      submitPin(pasted);
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  };

  const isComplete = pin.join("").length === 4;

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg border-[var(--bb-border)] bg-[var(--bb-surface)]">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bb-surface-2)] text-[var(--bb-primary)]">
          <Lock className="h-7 w-7" />
        </div>
        <CardTitle className="font-display text-2xl font-bold text-[var(--bb-fg)]">
          BabyBean Studio
        </CardTitle>
        <p className="mt-2 text-sm text-[var(--bb-fg-muted)]">
          {vi.gallery.pinTitle}
        </p>
      </CardHeader>

      <CardContent className="space-y-6 pt-2">
        {/* 4 ô nhập PIN */}
        <div
          ref={containerRef}
          className={cn(
            "flex justify-center items-center gap-3 sm:gap-4",
            isShaking && "animate-shake"
          )}
        >
          {pin.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={1}
              value={digit}
              disabled={isLocked || isLoading}
              onChange={(e) => handleInputChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              aria-label={`PIN ${idx + 1}`}
              className={cn(
                "h-14 w-12 sm:h-16 sm:w-14 rounded-[var(--bb-radius-sm)] border text-center text-2xl font-bold transition-all focus:outline-none focus:ring-2 focus:ring-[var(--bb-primary)] focus:border-transparent select-none",
                digit
                  ? "border-[var(--bb-primary)] bg-[var(--bb-surface)] text-[var(--bb-fg)]"
                  : "border-[var(--bb-border)] bg-[var(--bb-surface-2)] text-[var(--bb-fg)]",
                (isLocked || isLoading) &&
                  "opacity-50 cursor-not-allowed bg-[var(--bb-surface-2)]",
                errorMessage && !isLocked && "border-[var(--bb-danger)]"
              )}
            />
          ))}
        </div>

        {/* Thông báo lỗi hoặc đếm ngược khóa */}
        {errorMessage && (
          <div
            role="alert"
            className={cn(
              "flex items-start gap-2.5 rounded-[var(--bb-radius-sm)] p-3 text-sm transition-all",
              isLocked
                ? "bg-[var(--bb-warning)]/10 text-[var(--bb-warning)] border border-[var(--bb-warning)]/20"
                : "bg-[var(--bb-danger)]/10 text-[var(--bb-danger)] border border-[var(--bb-danger)]/20"
            )}
          >
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">{errorMessage}</p>
              {isLocked && lockSeconds !== null && (
                <p className="mt-1 font-mono text-xs font-semibold">
                  {formatCountdown(lockSeconds)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Nút Xem album */}
        <Button
          type="button"
          onClick={() => submitPin(pin.join(""))}
          disabled={!isComplete || isLoading || isLocked}
          className="w-full min-h-[48px] text-base font-medium shadow-sm"
        >
          {isLoading ? (
            <Spinner size="sm" className="mr-2 text-white" />
          ) : (
            vi.gallery.pinSubmit
          )}
        </Button>
      </CardContent>

      <CardFooter className="flex flex-col items-center justify-center pt-2 pb-6 text-xs text-[var(--bb-fg-muted)] space-y-1">
        <div className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5" />
          <span>{interpolate(vi.gallery.pinHelp, { hotline })}</span>
        </div>
      </CardFooter>
    </Card>
  );
}
