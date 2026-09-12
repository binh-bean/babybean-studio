import * as React from "react";
import { cn } from "./utils";
import { vi } from "../../i18n";

export interface ContractChildItem {
  id?: string;
  name: string;
  quantity: number;
  unit?: string;
  note?: string;
}

export interface ContractItem {
  id?: string;
  name: string;
  quantity?: number;
  unit?: string;
  /**
   * Giá tiền của dòng này (VNĐ).
   * Dòng cha có tiền, dòng con KHÔNG có tiền.
   */
  price?: number | null;
  /**
   * Thành phần con trong gói (ví dụ: Edit file x20, Makeup x1, Gỗ 15x21 x1) - KHÔNG CÓ TIỀN.
   */
  children?: ContractChildItem[];
  note?: string;
}

export interface ContractBreakdownProps extends React.HTMLAttributes<HTMLDivElement> {
  items: ContractItem[];
  title?: string;
  showTotal?: boolean;
  totalLabel?: string;
  emptyMessage?: string;
}

export function formatCurrencyVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}

/**
 * Khối thành phần hợp đồng hai tầng.
 * - Dòng cha có tiền, dòng con không có tiền.
 * - Tuyệt đối không cộng tiền dòng con vào tổng.
 * - Thiết kế ưu tiên di động từ 375px, chống tràn ngang.
 */
export function ContractBreakdown({
  items,
  title = vi.ui.contractBreakdown.title,
  showTotal = true,
  totalLabel = vi.ui.contractBreakdown.totalLabel,
  emptyMessage = vi.ui.contractBreakdown.emptyMessage,
  className,
  ...props
}: ContractBreakdownProps) {
  // Chỉ cộng tiền của dòng cha. Dòng con không có tiền và không tính vào tổng.
  const totalAmount = React.useMemo(() => {
    return items.reduce((sum, item) => {
      return sum + (typeof item.price === "number" ? item.price : 0);
    }, 0);
  }, [items]);

  return (
    <div
      className={cn(
        "w-full rounded-xl border border-[var(--bb-border)] bg-[var(--bb-surface)] p-4 sm:p-5 text-[var(--bb-fg)] shadow-xs",
        className
      )}
      {...props}
    >
      {title && (
        <div className="mb-4 pb-3 border-b border-[var(--bb-border)]/60">
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-[var(--bb-fg-muted)]">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, idx) => (
            <div key={item.id ?? `item-${idx}`} className="group">
              {/* Dòng cha: Tên, số lượng (nếu có), thành tiền */}
              <div className="flex items-start justify-between gap-3 text-sm sm:text-base">
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-[var(--bb-fg)] break-words">
                    {item.name}
                  </span>
                  {typeof item.quantity === "number" && item.quantity > 0 && !item.children?.length && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-[var(--bb-surface-2)] text-[var(--bb-fg-muted)] border border-[var(--bb-border)]/50 shrink-0">
                      x{item.quantity}{item.unit ? ` ${item.unit}` : ""}
                    </span>
                  )}
                  {item.note && (
                    <p className="text-xs text-[var(--bb-fg-muted)] mt-0.5">{item.note}</p>
                  )}
                </div>

                {/* Tiền dòng cha */}
                <div className="shrink-0 text-right font-semibold text-[var(--bb-fg)] pl-2">
                  {typeof item.price === "number" ? (
                    <span>{formatCurrencyVND(item.price)}</span>
                  ) : null}
                </div>
              </div>

              {/* Dòng con: Thụt lề, có thanh dẫn hướng dọc, KHÔNG có giá tiền */}
              {item.children && item.children.length > 0 && (
                <div className="mt-2 ml-1 pl-3 sm:pl-4 border-l-2 border-[var(--bb-border)]/80 space-y-1.5">
                  {item.children.map((child, cIdx) => (
                    <div
                      key={child.id ?? `child-${cIdx}`}
                      className="flex items-center justify-between gap-2 text-xs sm:text-sm text-[var(--bb-fg-muted)]"
                    >
                      <span className="truncate pr-2">{child.name}</span>
                      <span className="shrink-0 font-medium font-mono text-[var(--bb-fg)]/80">
                        x{child.quantity}{child.unit ? ` ${child.unit}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dòng tổng cộng: chỉ hiển thị khi có dòng và showTotal = true */}
      {showTotal && items.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[var(--bb-border)] flex items-center justify-between text-sm sm:text-base">
          <span className="font-medium text-[var(--bb-fg-muted)]">{totalLabel}</span>
          <span className="text-base sm:text-lg font-bold text-[var(--bb-primary)]">
            {formatCurrencyVND(totalAmount)}
          </span>
        </div>
      )}
    </div>
  );
}
