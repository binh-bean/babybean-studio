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
  const canhBao = vuot || soChuaGui > 0;

  // Ngắn, vì trên điện thoại 375px dòng này chỉ còn chừng 95px sau hai nút.
  // Số tấm đã nằm ở dòng trên ("17 / 15 tấm"), dòng này chỉ nói phần còn lại.
  // `Chip` là bản NGẮN (không có chữ "tấm") cho viên be nhỏ ở máy tính —
  // xem `bia-khoi-chu`-kiểu ghi chú ở dưới, cùng một khối chữ nhưng đổi lời
  // theo bề rộng qua CSS, không nhân đôi thẻ `data-testid`.
  const dongPhu =
    hanMuc == null
      ? "Chờ hạn mức"
      : vuot
        ? `Thêm ${formatCurrencyVND(tienThem)}`
        : hanMuc - daChon > 0
          ? `Còn ${hanMuc - daChon} tấm`
          : "Đủ trong gói";
  const dongPhuChip =
    hanMuc == null
      ? "Chờ hạn mức"
      : vuot
        ? `Thêm ${formatCurrencyVND(tienThem)}`
        : hanMuc - daChon > 0
          ? `Còn ${hanMuc - daChon}`
          : "Đủ trong gói";

  return (
    <div
      data-testid="thanh-noi"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] transition-all duration-300 ease-out",
        an
          ? "translate-y-[calc(100%+env(safe-area-inset-bottom)+16px)] opacity-0"
          : "translate-y-0 opacity-100",
      )}
      aria-hidden={an}
      // BB-277 kiểm ngược (axe `aria-hidden-focus`) — `aria-hidden` chỉ giấu
      // khỏi trình đọc màn hình, KHÔNG tự rút phần tử con khỏi thứ tự Tab.
      // Trước bản vá này, thanh ẩn lúc bìa còn cao (`an=true`) vẫn giữ nguyên
      // hai nút "Mua thêm"/"Chốt danh sách" trong luồng bàn phím — Tab tới đó
      // focus rơi vào một nút không hiện trên màn. `inert` (React 19) rút cả
      // focus lẫn con trỏ khỏi toàn bộ nhánh khi ẩn, đúng một lần, không cần
      // tự thêm `tabIndex={-1}` cho từng nút bên trong.
      inert={an}
    >
      {/*
        BB-278/BB-281 — dựng đúng `babybean-assets/BB-281/thanh-chon-*.png`:
        điện thoại viên RỘNG gần hết bề ngang (không còn cụm nhỏ giữa màn),
        số đếm serif lớn; máy tính viên NHỎ ~420px CĂN GIỮA đáy (bản vẽ vẽ
        giữa đáy, không phải góc phải như BB-258 cũ — an toàn đổi lại vì
        `loi-goi-y-luu-app.tsx` không còn `fixed` nên hết ràng buộc khoảng
        cách giữa hai thẻ nổi). "Chốt danh sách" máy tính: bản vẽ ghi chữ
        trắng/kem trên nền hồng đất nhạt #E8A598 — ĐO THỬ contrast hai màu đó
        chỉ ~2:1 (dưới 4.5:1 bắt buộc), nên theo đúng điều khoản dự phòng của
        chính bản chỉ đạo ("nếu không đạt thì chữ mực") — giữ chữ mực #2E2A27
        như mobile, không dùng chữ trắng.
      */}
      <div
        className={cn(
          "mx-auto flex h-12 max-w-[520px] items-center gap-2 rounded-full border border-[#e5dcd2] bg-[#FBF7F2]/92 pl-5 pr-2 text-[#2E2A27] shadow-lg backdrop-blur-md lg:h-11 lg:max-w-[420px]",
          an ? "pointer-events-none" : "pointer-events-auto",
        )}>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-display text-[22px] leading-none lg:text-[16px] lg:font-medium">
            <span data-testid="dem-da-chon">{daChon}</span>
            {hanMuc != null && (
              <>
                {" / "}
                {hanMuc}
                <span className="hidden lg:inline"> tấm</span>
              </>
            )}
          </p>
          {/* Dưới lg: dòng phụ nằm NGAY DƯỚI số đếm, như thẻ điện thoại của bản vẽ. */}
          <p className={cn("mt-1 truncate text-[12px] lg:hidden", canhBao ? "font-medium text-[#9C4A41]" : "text-[#6b6057]")}>
            {soChuaGui > 0 ? (
              <span data-testid="chua-luu">{`${vi.common.unsaved} — ${soChuaGui} tấm`}</span>
            ) : (
              dongPhu
            )}
          </p>
        </div>

        {/* Từ lg: viên be nhỏ riêng cạnh số đếm, đúng bản vẽ máy tính. */}
        <span
          className={cn(
            "hidden shrink-0 truncate rounded-full bg-[#efe7dc] px-2.5 py-1 text-[12px] lg:inline-block",
            canhBao ? "font-medium text-[#9C4A41]" : "text-[#6b6057]",
          )}
        >
          {soChuaGui > 0 ? `${vi.common.unsaved} — ${soChuaGui}` : dongPhuChip}
        </span>

        {muaThem && (
          <button
            type="button"
            onClick={muaThem.onClick}
            aria-label="Mua thêm"
            title={muaThem.tien > 0 ? `Mua thêm — ${formatCurrencyVND(muaThem.tien)}` : "Mua thêm"}
            className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#2E2A27]/75 transition hover:bg-[#2E2A27]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBF7F2]"
          >
            <ShoppingBag className="h-[17px] w-[17px]" strokeWidth={1.6} aria-hidden="true" />
            {muaThem.tien > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#C4645A]" aria-hidden="true" />
            )}
          </button>
        )}

        {nutChinh && (
          <button
            type="button"
            onClick={nutChinh.onClick}
            className="h-9 shrink-0 rounded-full bg-[#E8A598] px-4 font-display text-[14px] text-[#2E2A27] transition hover:bg-[#E8A598]/85 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBF7F2]"
          >
            {nutChinh.nhan}
          </button>
        )}
      </div>
    </div>
  );
}
