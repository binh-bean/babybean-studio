"use client";

/**
 * Thanh chọn — viên duy nhất nổi ở đáy màn khách.
 *
 * OWNER: DEV-FE. Chủ studio duyệt 23/09/2026 hướng "cuốn album kỷ niệm".
 *
 * Thay cho HAI thanh cũ cùng dính ở đáy (thanh "Đã chọn / Chốt" và thanh "Tải
 * cả bộ") — chúng đè lên nhau, chữ "Đã chọn 0/15" bị che mất một nửa. Tải ảnh
 * nay nằm trong nút ở đầu trang; ở đây chỉ còn đúng câu hỏi ba mẹ cần trả lời
 * suốt lúc chọn: "mình đã chọn mấy tấm, còn được mấy tấm".
 *
 * Bốn ô số cũ (Đã chọn / Trong gói / Chọn thêm / Phụ phí) gộp thành một vòng
 * tròn và một dòng chữ. Phụ phí chỉ hiện khi CÓ phụ phí — một ô "0 ₫" thường
 * trực là một lời nhắc tiền không cần thiết.
 */

import React from "react";
import { ShoppingBag } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";

export interface ThanhChonProps {
  daChon: number;
  /** Số tấm trong gói; `null` khi CSKH chưa nhập. */
  hanMuc: number | null;
  soTamThem: number;
  tienThem: number;
  /** Nút chính: "Chốt danh sách", "Chọn thêm ảnh" hoặc "Yêu cầu sửa lại". */
  nutChinh: { nhan: string; onClick: () => void } | null;
  /** Có sản phẩm để mua thêm thì hiện nút túi. */
  muaThem: { tien: number; onClick: () => void } | null;
}

const CHU_VI = 2 * Math.PI * 17;

export function ThanhChon({ daChon, hanMuc, soTamThem, tienThem, nutChinh, muaThem }: ThanhChonProps) {
  const tiLe = hanMuc ? Math.min(daChon / hanMuc, 1) : 0;
  const vuot = soTamThem > 0;

  // Ngắn, vì trên điện thoại 375px dòng này chỉ còn chừng 95px sau hai nút.
  // Số tấm đã nằm ở dòng trên ("17 / 15 tấm"), dòng này chỉ nói phần còn lại.
  const dongPhu =
    hanMuc == null
      ? "Chờ hạn mức"
      : vuot
        ? `Thêm ${formatCurrencyVND(tienThem)}`
        : hanMuc - daChon > 0
          ? `Còn ${hanMuc - daChon} tấm`
          : "Đủ trong gói";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto flex h-[60px] max-w-xl items-center gap-2.5 rounded-full bg-[#2a2420] pl-2.5 pr-2 text-[#fffdf9] shadow-[0_14px_32px_-10px_rgba(27,23,20,.55)]">
        <svg viewBox="0 0 42 42" className="h-9 w-9 shrink-0" aria-hidden="true">
          <circle cx="21" cy="21" r="17" fill="none" stroke="rgba(255,253,249,.18)" strokeWidth="3" />
          {hanMuc != null && (
            <circle
              cx="21"
              cy="21"
              r="17"
              fill="none"
              stroke={vuot ? "#e0b25c" : "#e8a79e"}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={CHU_VI}
              strokeDashoffset={CHU_VI * (1 - tiLe)}
              transform="rotate(-90 21 21)"
              className="transition-[stroke-dashoffset] duration-300"
            />
          )}
        </svg>

        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-medium">
            <span data-testid="dem-da-chon">{daChon}</span>
            {hanMuc != null ? ` / ${hanMuc} tấm` : " tấm"}
          </p>
          <p className={cn("truncate text-[11.5px]", vuot ? "text-[#e0b25c]" : "text-white/60")}>
            {dongPhu}
          </p>
        </div>

        {muaThem && (
          <button
            type="button"
            onClick={muaThem.onClick}
            aria-label="Mua thêm"
            title={muaThem.tien > 0 ? `Mua thêm · ${formatCurrencyVND(muaThem.tien)}` : "Mua thêm"}
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/90 transition hover:bg-white/10"
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            {muaThem.tien > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#e8a79e]" aria-hidden="true" />
            )}
          </button>
        )}

        {nutChinh && (
          <button
            type="button"
            onClick={nutChinh.onClick}
            className="h-11 shrink-0 rounded-full bg-[#fffdf9] px-4 text-[14px] font-medium text-[#2a2420] transition hover:bg-white active:scale-[0.97] sm:px-5"
          >
            {nutChinh.nhan}
          </button>
        )}
      </div>
    </div>
  );
}
