/**
 * Tiêu đề trang dùng chung cho mọi màn quản trị.
 *
 * Task BB-280. Trước đây mỗi trang tự viết `<h1>` với một cỡ chữ riêng —
 * `text-xl`, `text-2xl`, `text-3xl`, có nơi thêm `font-display` có nơi không —
 * nên chủ studio thấy "chữ cao chữ thấp" khi lướt qua các màn. Ba hằng số dưới
 * đây (`PAGE_TITLE_CLASS`, `PAGE_DESCRIPTION_CLASS`, `CARD_TITLE_CLASS`) là
 * THANG CHỮ DUY NHẤT cho tiêu đề trang / mô tả phụ / tiêu đề thẻ — xem
 * docs/07-ui-ux.md mục "Thang chữ khu quản trị (BB-280)".
 *
 * BB-283: cỡ chữ chỉnh lại theo bản vẽ quan-tri-menu-nhom.png (`.tde h1`,
 * `.the h2` trong html/chung.css) — tiêu đề trang serif 30px weight 400 (không
 * còn `font-bold`), tiêu đề thẻ serif 18px weight 400.
 *
 * Dùng `<PageHeader>` khi tiêu đề nằm một mình đầu trang (đa số màn). Dùng
 * trực tiếp `PAGE_TITLE_CLASS` khi tiêu đề phải nằm cạnh thứ khác không hợp bố
 * cục flex mặc định của `PageHeader` (ví dụ: cột điều hướng của bao-cao-explorer,
 * hoặc tiêu đề chi tiết bộ ảnh có thêm nhãn trạng thái ngay bên cạnh).
 */

import type { ReactNode } from "react";
import { cn } from "@/components/ui/utils";

export const PAGE_TITLE_CLASS = "font-display text-[30px] font-normal text-[var(--bb-fg)]";
export const PAGE_DESCRIPTION_CLASS = "text-sm text-[var(--bb-fg-muted)]";
/**
 * Tiêu đề thẻ (`.the h2` trong bản vẽ) — serif, weight thường, 18px. KHÔNG còn
 * cùng cỡ với `<CardTitle>` mặc định (src/components/ui/card.tsx: `text-xl
 * font-semibold`, dùng chung cho cả màn khách) — dùng hằng số này (qua
 * className ghi đè) cho mọi tiêu đề thẻ trong khu quản trị, kể cả khi viết
 * bằng `<h2>` thô lẫn khi đi qua component `CardTitle`.
 */
export const CARD_TITLE_CLASS = "font-display text-[18px] font-normal text-[var(--bb-fg)]";

export function PageHeader({
  title,
  description,
  actions,
  className,
  hideOnMobile = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Nút hành động chính của trang — luôn đứng bên phải tiêu đề trên màn rộng. */
  actions?: ReactNode;
  className?: string;
  /**
   * Ẩn khối này dưới `lg` — dùng cho các màn mà thanh trên cùng
   * (`admin-header.tsx`/`TenManHinh`) đã in tên màn ngay cạnh chữ BabyBean,
   * nên in lại tiêu đề to ngay bên dưới là một dòng thứ hai nói cùng một điều.
   * Quyết định của chủ studio 22/09/2026, áp dụng lại nguyên vẹn ở BB-280.
   */
  hideOnMobile?: boolean;
}) {
  return (
    <div
      className={cn(
        // Bản vẽ (.tde): vạch mảnh dưới tiêu đề, cách 24px — áp đồng loạt cho
        // mọi màn quản trị dùng PageHeader (BB-283, điểm 3).
        "flex flex-col gap-3 border-b border-[var(--bb-border)] pb-6 sm:flex-row sm:items-end sm:justify-between",
        hideOnMobile && "hidden lg:flex",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className={PAGE_TITLE_CLASS}>{title}</h1>
        {description && <p className={cn("mt-1", PAGE_DESCRIPTION_CLASS)}>{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
