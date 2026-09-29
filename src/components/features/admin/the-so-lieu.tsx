/**
 * MỘT kiểu thẻ số liệu duy nhất cho mọi màn quản trị (BB-320, Q-N2).
 *
 * Vòng 6 đếm được bốn kiểu: nhãn IN HOA giãn chữ + số 32px (Bảng điều khiển),
 * nhãn thường + số 28px (Chi tiết bộ ảnh), số 18px (Việc cần xử lý), số kèm đơn
 * vị "bộ" với nhãn gãy hai dòng (Báo cáo). Nay cả bốn dùng đúng thành phần này:
 * viền mảnh, nhãn thường 12px phía trên MỘT dòng, số Be Vietnam Pro 28px
 * (`.bb-so`), đơn vị/ghi chú nhỏ cùng dòng cơ sở phía sau.
 *
 * Nhãn không gãy dòng ở lưới nhiều cột: `truncate` + `title` giữ nguyên chữ đầy đủ
 * cho ai muốn đọc hết; nhãn nào dài hơn thẻ thì phải rút ngắn ở nơi gọi, không
 * cho phép hai dòng làm thẻ này cao hơn thẻ cạnh nó.
 */

import type { ReactNode } from "react";
import { cn } from "@/components/ui/utils";

export function TheSoLieu({
  label,
  value,
  phu,
  ghiChu,
  canhBao,
  chuNho,
  giaTriMau,
  gocPhai,
  title,
  className,
  testId,
}: {
  label: string;
  value: string;
  /** Đơn vị hoặc phụ tố nhỏ cùng dòng cơ sở với số: "bộ", "đ", "/ 15 tấm", giờ chốt. */
  phu?: string;
  /** Một dòng nhỏ dưới số (vd "khoảng ước tính") — chỉ khi thật sự cần. */
  ghiChu?: string;
  /** Chấm cảnh báo nhẹ trước số khi số liệu cần chú ý. */
  canhBao?: boolean;
  /** Cỡ số nhỏ hơn cho giá trị dài (ngày dd/mm/yyyy, số tiền) để không tràn thẻ hẹp. */
  chuNho?: boolean;
  /** Tô số bằng màu trạng thái của hệ (chỉ dùng cho "Quá hạn"). */
  giaTriMau?: "danger";
  /** Chỗ cho chip nhỏ ở góc phải cùng hàng với số (vd "% so kỳ trước"). */
  gocPhai?: ReactNode;
  title?: string;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId ?? "the-so-lieu"}
      title={title}
      className={cn(
        "min-w-0 rounded-[var(--bb-radius)] border border-[var(--bb-border)] bg-[var(--bb-surface)] px-4 py-3.5",
        className,
      )}
    >
      {/* Chữ nhãn nằm TRỰC TIẾP trong div này (không bọc span) — phép thử tìm thẻ theo chữ nhãn rồi lấy phần tử cha là cả thẻ (bb-313). */}
      <div className="truncate text-xs text-[var(--bb-fg-muted)]">
        {canhBao && (
          <span
            role="img"
            aria-label="Cần chú ý"
            className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full bg-[var(--bb-danger)] align-middle"
          />
        )}
        {label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div
          className={cn(
            "bb-so flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0 leading-tight",
            chuNho ? "text-[20px] sm:text-[22px]" : "text-[26px] sm:text-[28px]",
            giaTriMau === "danger" && "text-[var(--bb-danger)]",
          )}
        >
          <span>{value}</span>
          {phu && <span className="font-sans text-[13px] font-normal text-[var(--bb-fg-muted)]">{phu}</span>}
        </div>
        {gocPhai}
      </div>
      {ghiChu && <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">{ghiChu}</p>}
    </div>
  );
}
