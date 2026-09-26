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
import { vi } from "@/i18n";

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
  /**
   * BB-232 — số tấm đang chờ gửi vì mất mạng (`use-hang-cho-tim.ts`). > 0 thì
   * thay dòng phụ bằng "Chưa lưu" — ưu tiên báo tin này hơn "còn mấy tấm",
   * vì ba mẹ cần biết NGAY có thao tác chưa tới được máy chủ.
   */
  soChuaGui?: number;
  /**
   * BB-258 — chủ studio 26/09/2026: thanh này đang che tên mục/thanh lọc khi
   * bìa còn cao. `GalleryApp` tính lúc nào nên ẩn (bìa còn trong khung nhìn,
   * hoặc đang cuộn xuống) và truyền vào đây; component chỉ lo HIỂN THỊ việc
   * ẩn/hiện đó (trượt xuống + mờ dần), không đổi chữ/aria/data-testid/hành vi
   * bấm — DOM vẫn còn đó, chỉ ẩn bằng CSS, để một cú cuộn lên nhỏ luôn lấy
   * lại được nút chính ngay lập tức, không phải chờ mount lại.
   */
  an?: boolean;
}


export function ThanhChon({ daChon, hanMuc, soTamThem, tienThem, nutChinh, muaThem, soChuaGui = 0, an = false }: ThanhChonProps) {

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
    <div
      data-testid="thanh-noi"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] transition-all duration-300 ease-out",
        // Máy tính: gọn vào góc phải dưới, không còn choán giữa màn — đó là
        // đúng vùng chủ studio chỉ ra đang che tên mục/thanh lọc. GIỮ NGUYÊN
        // `bottom-0` (không thêm `lg:bottom-6`): `loi-goi-y-luu-app.tsx` định
        // vị chính nó bằng một khoảng cách CỐ ĐỊNH tính từ đáy màn hình lên
        // trên thanh này (`bottom-[calc(84px+...)]`) — nâng thanh này lên
        // thêm sẽ ăn mất khoảng hở đó và đè lên nút "Chốt danh sách"
        // (bb-240 bắt được: hộp gợi ý {y:694.5-816} đè nút {y:796-852}).
        "lg:inset-x-auto lg:right-6 lg:px-0",
        an
          ? "translate-y-[calc(100%+env(safe-area-inset-bottom)+16px)] opacity-0"
          : "translate-y-0 opacity-100",
      )}
      aria-hidden={an}
    >
      <div
        className={cn(
          "mx-auto flex h-[80px] max-w-[400px] items-center gap-3 rounded-full bg-[#2E2A27] pl-8 pr-3 shadow-2xl lg:mx-0",
          an ? "pointer-events-none" : "pointer-events-auto",
        )}>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-display text-[26px] font-light text-[#FBF7F2]">
            <span data-testid="dem-da-chon">{daChon}</span>
            {hanMuc != null ? ` / ${hanMuc}` : ""}
          </p>
          <p className={cn("truncate text-[12px] mt-0.5", vuot ? "text-[#C4645A]" : "text-white/70")}>
            {soChuaGui > 0 ? (
              <span data-testid="chua-luu">{`${vi.common.unsaved} — ${soChuaGui} tấm`}</span>
            ) : (
              dongPhu
            )}
          </p>
        </div>

        {muaThem && (
          <button
            type="button"
            onClick={muaThem.onClick}
            aria-label="Mua thêm"
            title={muaThem.tien > 0 ? `Mua thêm — ${formatCurrencyVND(muaThem.tien)}` : "Mua thêm"}
            className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full text-white/90 transition hover:bg-white/10"
          >
            <ShoppingBag className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden="true" />
            {muaThem.tien > 0 && (
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#C4645A]" aria-hidden="true" />
            )}
          </button>
        )}

        {nutChinh && (
          <button
            type="button"
            onClick={nutChinh.onClick}
            className="h-[56px] shrink-0 rounded-full bg-[#FBF7F2] px-6 text-[15px] font-medium text-[#2E2A27] transition hover:bg-white active:scale-[0.97]"
          >
            {nutChinh.nhan}
          </button>
        )}
      </div>
    </div>
  );
}
