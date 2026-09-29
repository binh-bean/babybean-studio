import React from "react";
import { cn } from "./utils";
import { formatSo, formatTien } from "@/lib/utils/dinh-dang";

interface QuotaDisplayProps {
  includedQuota: number | null | undefined;
  extraPrice: number | null | undefined;
  selectedCount: number;
  className?: string;
}

export function QuotaDisplay({ includedQuota, extraPrice, selectedCount, className }: QuotaDisplayProps) {
  // Chưa biết hạn mức -> "studio sẽ báo lại số ảnh trong gói", tuyệt đối không
  // hiện số 0.
  //
  // Chỉ null và undefined mới là "chưa biết". Số 0 là một hạn mức THẬT: đơn
  // chỉ mua ảnh in, không kèm ảnh chỉnh sửa nào. Gộp hai thứ đó lại là làm
  // hỏng đúng cái ranh giới mà 0016 dựng lên ở tầng database — khách đơn in
  // sẽ thấy "studio sẽ báo lại" mãi mãi trong khi studio chẳng có gì để báo.
  if (includedQuota == null) {
    return (
      <div className={cn("text-sm", className)}>
        <span>Đã chọn: {selectedCount} ảnh</span>
        {/* BB-305 — bỏ nghiêng theo LUẬT PHÔNG mới. */}
        <div className="text-muted-foreground mt-1 text-xs">
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
        Đã chọn: {formatSo(selectedCount)} / {formatSo(includedQuota)} ảnh
      </div>
      
      {isExceeded && (
        <div className="text-destructive mt-1 font-medium text-xs sm:text-sm">
          Vượt {formatSo(extraCount)} ảnh
          {/* Nếu có giá, báo tiền */}
          {(extraPrice ?? 0) > 0 ? (
            <span> - phụ phí {formatTien(extraCount * extraPrice!)}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

