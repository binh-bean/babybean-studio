import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "./utils";
import { vi } from "../../i18n";
import { formatCurrencyVND } from "./contract-breakdown";

export interface AddonProduct {
  id: string;
  name: string;
  description?: string;
  /**
   * Đơn giá (VNĐ).
   * Nếu null, undefined hoặc <= 0, hoặc priceReliable === false:
   * Sản phẩm được coi là KHÔNG ĐỦ TIN CẬY VỀ GIÁ.
   */
  unitPrice?: number | null;
  /**
   * Cờ xác định giá có tin cậy không.
   * Nếu false: hiện "CSKH sẽ báo giá", KHÔNG hiện số tiền và KHÔNG cho bấm mua.
   */
  priceReliable?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface AddonSelectorProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  products: AddonProduct[];
  /** Số lượng đang chọn theo từng sản phẩm: { [productId]: quantity } */
  value?: Record<string, number>;
  /** Callback khi người dùng thay đổi số lượng */
  onChange?: (quantities: Record<string, number>, totalAmount: number) => void;
  title?: string;
  description?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

/**
 * Kiểm tra xem một sản phẩm có đủ tin cậy về giá không.
 * Nếu không đủ tin cậy (null, <= 0, hoặc priceReliable === false),
 * studio yêu cầu hiện "CSKH sẽ báo giá", KHÔNG hiện số và KHÔNG cho bấm mua.
 */
export function isProductPriceReliable(product: AddonProduct): boolean {
  if (product.priceReliable === false) return false;
  if (product.unitPrice == null) return false;
  if (typeof product.unitPrice !== "number" || product.unitPrice <= 0) return false;
  return true;
}

/**
 * Component chọn mua thêm sản phẩm / dịch vụ.
 * - Chọn sản phẩm, chọn số lượng, thấy ngay thành tiền từng dòng và tổng cộng.
 * - Sản phẩm không đủ tin cậy về giá: hiện "CSKH sẽ báo giá", KHÔNG hiện số tiền và KHÔNG cho bấm mua.
 * - Ưu tiên điện thoại từ 375px trở lên, chống tràn ngang.
 */
export function AddonSelector({
  products,
  value,
  onChange,
  title = vi.ui.addonSelector.title,
  description = vi.ui.addonSelector.description,
  emptyMessage = vi.ui.addonSelector.emptyMessage,
  disabled = false,
  className,
  ...props
}: AddonSelectorProps) {
  // Hỗ trợ cả controlled và uncontrolled component
  const [internalQuantities, setInternalQuantities] = React.useState<Record<string, number>>({});
  const quantities = value ?? internalQuantities;

  // Tính tổng tiền chỉ từ các sản phẩm có giá tin cậy
  const totalAmount = React.useMemo(() => {
    return products.reduce((sum, p) => {
      if (!isProductPriceReliable(p)) return sum;
      const qty = quantities[p.id] ?? 0;
      return sum + qty * (p.unitPrice ?? 0);
    }, 0);
  }, [products, quantities]);

  const totalSelectedCount = React.useMemo(() => {
    return Object.values(quantities).reduce((sum, q) => sum + (q > 0 ? q : 0), 0);
  }, [quantities]);

  const handleQuantityChange = (productId: string, newQty: number) => {
    if (disabled) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    // Sản phẩm không đủ tin cậy về giá: KHÔNG cho bấm mua
    if (!isProductPriceReliable(product)) return;

    const min = product.min ?? 0;
    const max = product.max ?? 99;
    const clamped = Math.max(min, Math.min(max, newQty));

    const next = { ...quantities };
    if (clamped > 0) {
      next[productId] = clamped;
    } else {
      delete next[productId];
    }

    if (value === undefined) {
      setInternalQuantities(next);
    }

    // Tính tổng mới để báo callback ngay lập tức
    const nextTotal = products.reduce((sum, p) => {
      if (!isProductPriceReliable(p)) return sum;
      const qty = next[p.id] ?? 0;
      return sum + qty * (p.unitPrice ?? 0);
    }, 0);

    onChange?.(next, nextTotal);
  };

  return (
    <div
      className={cn(
        "w-full rounded-xl border border-[var(--bb-border)] bg-[var(--bb-surface)] p-4 sm:p-5 text-[var(--bb-fg)] shadow-xs",
        className
      )}
      {...props}
    >
      {(title || description) && (
        <div className="mb-4 pb-3 border-b border-[var(--bb-border)]/60">
          {title && <h3 className="text-base font-semibold tracking-tight">{title}</h3>}
          {description && (
            <p className="text-xs sm:text-sm text-[var(--bb-fg-muted)] mt-1">{description}</p>
          )}
        </div>
      )}

      {products.length === 0 ? (
        <div className="py-6 text-center text-sm text-[var(--bb-fg-muted)]">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((product) => {
            const priceReliable = isProductPriceReliable(product);
            const qty = quantities[product.id] ?? 0;
            const lineTotal = priceReliable ? qty * (product.unitPrice ?? 0) : 0;
            const min = product.min ?? 0;
            const max = product.max ?? 99;

            return (
              <div
                key={product.id}
                className={cn(
                  "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border transition-colors",
                  qty > 0
                    ? "border-[var(--bb-primary)]/40 bg-[var(--bb-primary)]/5"
                    : "border-[var(--bb-border)]/70 bg-[var(--bb-surface-2)]/40"
                )}
              >
                {/* Thông tin sản phẩm */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm sm:text-base text-[var(--bb-fg)] break-words">
                    {product.name}
                  </div>
                  {product.description && (
                    <p className="text-xs text-[var(--bb-fg-muted)] mt-0.5 line-clamp-2">
                      {product.description}
                    </p>
                  )}

                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    {priceReliable ? (
                      <span className="text-xs sm:text-sm font-semibold text-[var(--bb-primary)]">
                        {formatCurrencyVND(product.unitPrice!)}
                        {product.unit ? ` / ${product.unit}` : ""}
                      </span>
                    ) : (
                      /* Sản phẩm không đủ tin cậy: hiện "CSKH sẽ báo giá", KHÔNG hiện số */
                      <span
                        title={vi.ui.addonSelector.priceQuotePendingHint}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                      >
                        {vi.ui.addonSelector.priceQuotePending}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bộ điều khiển số lượng + thành tiền dòng */}
                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--bb-border)]/50 shrink-0">
                  {priceReliable ? (
                    <div className="flex items-center gap-3">
                      {/* Stepper số lượng */}
                      <div className="inline-flex items-center rounded-lg border border-[var(--bb-border)] bg-[var(--bb-surface)] shadow-2xs">
                        <button
                          type="button"
                          aria-label={`Giảm số lượng ${product.name}`}
                          disabled={disabled || qty <= min}
                          onClick={() => handleQuantityChange(product.id, qty - (product.step ?? 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-l-lg text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span
                          aria-label={`Số lượng hiện tại ${product.name}`}
                          className="w-9 text-center font-mono text-sm font-semibold text-[var(--bb-fg)]"
                        >
                          {qty}
                        </span>
                        <button
                          type="button"
                          aria-label={`Tăng số lượng ${product.name}`}
                          disabled={disabled || qty >= max}
                          onClick={() => handleQuantityChange(product.id, qty + (product.step ?? 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-r-lg text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Thành tiền của dòng: thấy ngay khi chọn */}
                      <div className="text-right min-w-[80px]">
                        {qty > 0 ? (
                          <div className="text-xs sm:text-sm font-bold text-[var(--bb-fg)] whitespace-nowrap">
                            {formatCurrencyVND(lineTotal)}
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--bb-fg-muted)]">—</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Không đủ tin cậy về giá: KHÔNG cho bấm mua */
                    <div className="text-right">
                      <span className="text-xs text-[var(--bb-fg-muted)] italic">
                        {vi.ui.addonSelector.priceQuotePending}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Chân khối: Tổng tạm tính */}
      {products.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[var(--bb-border)] flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs sm:text-sm text-[var(--bb-fg-muted)]">
            <span>{vi.ui.addonSelector.subtotalLabel}</span>
            {totalSelectedCount > 0 && (
              <span className="ml-1 font-medium text-[var(--bb-fg)]">
                ({vi.ui.addonSelector.itemsSelected.replace("{count}", String(totalSelectedCount))})
              </span>
            )}
          </div>
          <div className="text-base sm:text-lg font-bold text-[var(--bb-primary)]">
            {formatCurrencyVND(totalAmount)}
          </div>
        </div>
      )}
    </div>
  );
}
