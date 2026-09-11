"use client";

import * as React from "react";
import { Download, Share2, X, Sparkles } from "lucide-react";
import { Button } from "./button";
import { cn } from "./utils";
import { vi } from "../../i18n";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "bb_pwa_dismissed_at";
const DISMISS_DAYS = 7;

export interface PWAInstallPromptProps extends React.HTMLAttributes<HTMLDivElement> {
  onDismiss?: () => void;
  onInstall?: () => void;
}

export function PWAInstallPrompt({
  className,
  onDismiss,
  onInstall,
  ...props
}: PWAInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = React.useState(false);
  const [showPrompt, setShowPrompt] = React.useState(false);
  const [showIOSGuide, setShowIOSGuide] = React.useState(false);

  React.useEffect(() => {
    // 1. If already running as standalone PWA, do not show
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;

    if (isStandalone) return;

    // 2. Check if recently dismissed within 7 days
    const dismissedAt = localStorage.getItem(STORAGE_KEY);
    if (dismissedAt) {
      const diffDays = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (diffDays < DISMISS_DAYS) return;
    }

    // 3. Detect iOS Safari
    const ua = window.navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream;
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);

    if (isIOSDevice && isSafari) {
      setIsIOS(true);
      setShowPrompt(true);
      return;
    }

    // 4. Chrome / Android beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSGuide(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    onDismiss?.();
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setShowPrompt(false);
      onInstall?.();
    }
    setDeferredPrompt(null);
  };

  if (!showPrompt) return null;

  return (
    <div
      role="banner"
      aria-label={vi.ui.pwa.installTitle}
      className={cn(
        "fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-5 duration-300 sm:bottom-6",
        className
      )}
      {...props}
    >
      <div className="relative overflow-hidden rounded-[var(--bb-radius)] border border-[var(--bb-border)] bg-[var(--bb-surface)] p-4 shadow-xl text-[var(--bb-fg)]">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-3 top-3 rounded-full p-1.5 text-[var(--bb-fg-muted)] hover:bg-[var(--bb-surface-2)] hover:text-[var(--bb-fg)] transition-colors"
          aria-label={vi.ui.toast.closeNotification}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3.5 pr-6">
          {/* App Icon */}
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[14px] border border-[var(--bb-border)] shadow-sm bg-[var(--bb-surface-2)] flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/icon-192.png"
              alt="BabyBean"
              className="h-full w-full object-cover"
              onError={(e) => {
                // Fallback to icon
                e.currentTarget.style.display = "none";
              }}
            />
            <Sparkles className="h-6 w-6 text-[var(--bb-primary)] pointer-events-none" />
          </div>

          {/* Texts */}
          <div className="space-y-1">
            <h4 className="text-sm font-semibold leading-tight text-[var(--bb-fg)]">
              {vi.ui.pwa.installTitle}
            </h4>
            <p className="text-xs text-[var(--bb-fg-muted)] leading-relaxed">
              {vi.ui.pwa.installDesc}
            </p>
          </div>
        </div>

        {/* iOS Guide popup inline */}
        {showIOSGuide && (
          <div className="mt-3 rounded-[var(--bb-radius-sm)] bg-[var(--bb-surface-2)] p-3 text-xs text-[var(--bb-fg)] space-y-1.5 border border-[var(--bb-border)] animate-in fade-in-50">
            <div className="flex items-center gap-1.5 font-medium text-[var(--bb-primary)]">
              <Share2 className="h-4 w-4 shrink-0" />
              <span>Hướng dẫn cài đặt trên iPhone / iPad:</span>
            </div>
            <p className="leading-relaxed text-[var(--bb-fg-muted)]">
              {vi.ui.pwa.iosInstructions}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-3 flex items-center justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-xs h-9 text-[var(--bb-fg-muted)]"
          >
            {vi.ui.pwa.installLater}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleInstallClick}
            className="text-xs h-9 gap-1.5 font-semibold"
          >
            {isIOS ? (
              <>
                <Share2 className="h-3.5 w-3.5" />
                <span>Xem cách cài</span>
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                <span>{vi.ui.pwa.installCta}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
