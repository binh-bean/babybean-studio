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
import { layerMoVuong } from "@/lib/utils/tranh-tan-nen";

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

/**
 * Trang "Không có quyền" dùng chung — BB-290 (#42).
 *
 * Trước đây mỗi trang tự viết một `<h1>` `text-xl font-semibold` (sans, không
 * phải serif như mọi H1 khác của quản trị), không tranh minh hoạ, không nút
 * quay lại — chủ studio đọc thấy như một trang lỗi khác hẳn phần còn lại của
 * hệ thống. Dùng `PAGE_TITLE_CLASS` cho đúng thang chữ, và luôn có một lối ra.
 */
export function KhongCoQuyen({ mota }: { mota: string }) {
  return (
    <main className="mx-auto max-w-2xl py-10 text-center">
      {/*
        BB-292 — bắt được lỗi thật: `onError` trên <img> ở đây làm CẢ TRANG vỡ
        500 ("Event handlers cannot be passed to Client Component props"),
        không chỉ lặng lẽ ẩn tranh — `KhongCoQuyen` được gọi từ page.tsx là
        Server Component (`customers/page.tsx`, `staff/page.tsx`), không có
        "use client", nên một hàm truyền làm prop cho phần tử DOM ở đây không
        hợp lệ. Bỏ hẳn `onError`: đường dẫn tranh nay trỏ đúng tệp thật có sẵn
        (`khong-co-quyen-{320,640}.webp`), không cần lưới đỡ khi tải hỏng nữa.
      */}
      {/*
        BB-292 vòng 2 — giám đốc chấm: nền kem của tranh tách khỏi nền trang
        thành một khối vuông thấy rõ viền. `layerMoVuong` (multiply + mặt nạ
        toả tròn, `src/lib/utils/tranh-tan-nen.ts`) cho nền tranh tan vào
        `--bb-bg`, chỉ còn nét vẽ nổi lên.
      */}
      <img
        src="/minh-hoa/khong-co-quyen-640.webp"
        srcSet="/minh-hoa/khong-co-quyen-320.webp 320w, /minh-hoa/khong-co-quyen-640.webp 640w"
        sizes="200px"
        alt=""
        width={200}
        height={200}
        className="mx-auto h-[140px] w-[200px] object-contain opacity-90"
        style={layerMoVuong}
      />
      <h1 className={cn(PAGE_TITLE_CLASS, "mt-4")}>Không có quyền</h1>
      <p className={cn("mt-2", PAGE_DESCRIPTION_CLASS)}>{mota}</p>
      <a
        href="/admin"
        className="mt-6 inline-flex h-10 items-center rounded-[var(--bb-radius-sm)] bg-[var(--bb-fg)] px-4 text-sm font-medium text-white hover:opacity-90"
      >
        Về bảng điều khiển
      </a>
    </main>
  );
}
