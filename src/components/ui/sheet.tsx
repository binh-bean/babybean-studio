"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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

/**
 * `asChild` LÀM THẬT, không chỉ khai trong kiểu dữ liệu.
 *
 * Trước 22/09/2026, `asChild` được khai trong `SheetTriggerProps` nhưng thân
 * hàm không đọc tới: nó rơi vào `...props` rồi được đổ thẳng lên thẻ `<button>`
 * của DOM. Hậu quả đo được trên mọi màn quản trị (nút mở menu ở
 * `admin-header.tsx` dùng đúng kiểu này):
 *
 *   - `<button>` lồng trong `<button>` — HTML không cho phép, nên React báo
 *     "Hydration failed because the server rendered HTML didn't match".
 *     Hydration hỏng thì React vứt cây máy chủ dựng sẵn và vẽ lại toàn bộ bằng
 *     máy khách: chậm hơn, và mọi trạng thái đặt trước đó biến mất.
 *   - Cảnh báo "React does not recognize the `asChild` prop on a DOM element".
 *
 * Nay `asChild` được xử lý: giữ nguyên phần tử con, chỉ gắn thêm `onClick` vào
 * nó. `onClick` của chính đứa con vẫn chạy trước.
 */
const SheetTrigger = React.forwardRef<HTMLButtonElement, SheetTriggerProps>(
  ({ children, onClick, asChild, ...props }, ref) => {
    const context = React.useContext(SheetContext);
    const moDong = (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      context?.onOpenChange(!context.open);
    };

    if (asChild && React.isValidElement(children)) {
      const con = children as React.ReactElement<{
        onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
      }>;
      return React.cloneElement(con, {
        onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
          con.props.onClick?.(e);
          moDong(e);
        },
      });
    }

    return (
      <button ref={ref} type="button" onClick={moDong} {...props}>
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

    /**
     * Chỉ dựng sau khi đã gắn vào trình duyệt: `createPortal` cần `document`,
     * mà lần dựng đầu tiên chạy trên máy chủ.
     */
    const [daGan, setDaGan] = React.useState(false);
    React.useEffect(() => setDaGan(true), []);

    if (!open) return null;

    const than = (
      <div className="fixed inset-0 z-50 flex justify-end">
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in cursor-pointer"
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

    /**
     * ĐƯA RA THẲNG `document.body`, không để nằm tại chỗ.
     *
     * Vì sao bắt buộc: thanh đầu trang của màn quản trị có `backdrop-blur-md`.
     * Một phần tử có `backdrop-filter` trở thành **khối chứa** cho mọi con cháu
     * `position: fixed` — nên `inset-y-0 h-full` của ngăn kéo không còn tính
     * theo màn hình mà tính theo thanh đầu trang.
     *
     * Đo ngày 21/09/2026 trên máy 375px: ngăn kéo cao **63px** thay vì 812px.
     * Nền mờ chỉ che đúng 63px đầu, còn mười mục menu tràn xuống dưới và đè
     * thẳng lên tiêu đề, ô tìm kiếm và bộ lọc của trang — chữ chồng lên chữ.
     *
     * Bỏ `backdrop-blur` ở thanh đầu trang cũng chữa được, nhưng đó là chữa
     * đúng một chỗ: bất kỳ `Sheet` nào sau này nằm trong một tổ tiên có
     * `transform`, `filter` hay `backdrop-filter` sẽ vỡ lại y hệt.
     */
    return daGan ? createPortal(than, document.body) : null;
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
