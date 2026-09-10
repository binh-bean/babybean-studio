"use client";

import * as React from "react";
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { cn } from "./utils";
import { vi } from "../../i18n";

export type ToastType = "default" | "success" | "warning" | "danger" | "info";

export interface ToastItem {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  type?: ToastType;
  duration?: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id">) => string;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let toastCount = 0;
type ToastFunction = (props: Omit<ToastItem, "id">) => string;

let externalToast: ToastFunction = () => "";

export function toast(props: Omit<ToastItem, "id">): string {
  return externalToast(props);
}

toast.success = (title: string, description?: string) =>
  toast({ title, description, type: "success" });

toast.error = (title: string, description?: string) =>
  toast({ title, description, type: "danger" });

toast.warning = (title: string, description?: string) =>
  toast({ title, description, type: "warning" });

toast.info = (title: string, description?: string) =>
  toast({ title, description, type: "info" });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = React.useCallback(
    (item: Omit<ToastItem, "id">) => {
      const id = String(++toastCount);
      const newToast: ToastItem = { ...item, id };
      setToasts((prev) => [...prev, newToast]);

      const duration = item.duration ?? 3000; // docs/07-ui-ux.md §7: tự ẩn sau 3s
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
      return id;
    },
    [removeToast]
  );

  React.useEffect(() => {
    externalToast = addToast;
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    return {
      toast,
      toasts: [],
      dismiss: (_id?: string) => {},
    };
  }
  return {
    toast: context.addToast,
    toasts: context.toasts,
    dismiss: context.removeToast,
  };
}

export function Toaster() {
  const context = React.useContext(ToastContext);
  const toasts = context?.toasts || [];

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label={vi.ui.toast.notificationAria}
      className="fixed bottom-4 right-4 z-50 flex max-h-screen w-full max-w-sm flex-col-reverse gap-2 pointer-events-none p-4 sm:p-0"
    >
      {toasts.map((item) => (
        <ToastSingle key={item.id} item={item} onDismiss={() => context?.removeToast(item.id)} />
      ))}
    </div>
  );
}

function ToastSingle({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const icons = {
    default: null,
    success: <CheckCircle2 className="h-5 w-5 text-[var(--bb-success)] shrink-0" />,
    warning: <AlertTriangle className="h-5 w-5 text-[var(--bb-warning)] shrink-0" />,
    danger: <AlertCircle className="h-5 w-5 text-[var(--bb-danger)] shrink-0" />,
    info: <Info className="h-5 w-5 text-[var(--bb-primary)] shrink-0" />,
  };

  const typeStyles = {
    default: "border-[var(--bb-border)] bg-[var(--bb-surface)] text-[var(--bb-fg)]",
    success: "border-[var(--bb-success)]/30 bg-[var(--bb-surface)] text-[var(--bb-fg)]",
    warning: "border-[var(--bb-warning)]/30 bg-[var(--bb-surface)] text-[var(--bb-fg)]",
    danger: "border-[var(--bb-danger)]/30 bg-[var(--bb-surface)] text-[var(--bb-fg)]",
    info: "border-[var(--bb-primary)]/30 bg-[var(--bb-surface)] text-[var(--bb-fg)]",
  };

  return (
    <div
      role="alert"
      className={cn(
        "pointer-events-auto relative flex w-full items-center justify-between space-x-3 overflow-hidden rounded-[var(--bb-radius)] border p-4 shadow-lg transition-all animate-in slide-in-from-bottom-5 duration-200 text-sm",
        typeStyles[item.type || "default"]
      )}
    >
      <div className="flex items-start gap-3">
        {icons[item.type || "default"]}
        <div className="grid gap-1">
          {item.title && <div className="font-medium leading-none">{item.title}</div>}
          {item.description && (
            <div className="text-xs text-[var(--bb-fg-muted)] leading-relaxed">
              {item.description}
            </div>
          )}
        </div>
      </div>
      {item.action}
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-sm p-1 text-[var(--bb-fg-muted)] hover:text-[var(--bb-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--bb-primary)]"
        aria-label={vi.ui.toast.closeNotification}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export { ToastSingle as Toast };
