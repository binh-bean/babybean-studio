import React from "react";
import { cn } from "./utils";

interface QuotaDisplayProps {
  includedQuota: number | null | undefined;
  extraPrice: number | null | undefined;
  selectedCount: number;
  className?: string;
}

export function QuotaDisplay({ includedQuota, extraPrice, selectedCount, className }: QuotaDisplayProps) {
  // Chưa biết hạn mức (chỉ null hoặc undefined, số 0 là hạn mức thật của đơn chỉ mua ảnh in)
  if (includedQuota == null) {
    return (
      <div className={cn("text-sm", className)}>
        <span>Đã chọn: {selectedCount} ảnh</span>
        <div className="text-muted-foreground mt-1 text-xs italic">
          (Studio sẽ báo lại số ảnh trong gói)
        </div>
      </div>
    );
  }

  // Biết hạn mức
  const isExceeded = selectedCount > includedQuota;
  const extraCount = isExceeded ? selectedCount - includedQuota : 0;

  return (
    <div className={cn("text-sm", className)}>
      <div className="font-medium">
        Đã chọn: {selectedCount} / {includedQuota} ảnh
      </div>
      
      {isExceeded && (
        <div className="text-destructive mt-1 font-medium text-xs sm:text-sm">
          Vượt {extraCount} ảnh
          {/* Nếu có giá, báo tiền */}
          {(extraPrice ?? 0) > 0 ? (
            <span> - phụ phí {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(extraCount * extraPrice!)}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

