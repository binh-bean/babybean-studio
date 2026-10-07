/**
 * BB-382 — màn báo "không xem được bộ ảnh này" khi nhân viên bấm link quản lý
 * từ Lark mà không đủ quyền / khác chi nhánh / chưa được giao.
 *
 * Không nhận và không hiện BẤT CỨ dữ liệu nào của bộ ảnh (tên khách, mã hoá
 * đơn, ảnh): màn này dựng trước khi đọc chi tiết bộ.
 */
import Link from "next/link";
import { CAU_CHAN_BO_ANH, type LyDoChanBoAnh } from "@/lib/auth/quyen-xem-bo-anh";

export function ManChanBoAnh({ lyDo }: { lyDo: LyDoChanBoAnh | "khong-tim-thay" }) {
  const cau =
    lyDo === "khong-tim-thay"
      ? {
          tieuDe: "Không tìm thấy bộ ảnh này",
          giaiThich: "Link có thể đã cũ hoặc bộ ảnh đã bị gỡ. Mở lại từ danh sách bộ ảnh giúp.",
        }
      : CAU_CHAN_BO_ANH[lyDo];
  return (
    <section
      role="alert"
      data-testid="man-chan-bo-anh"
      data-ly-do={lyDo}
      className="mx-auto mt-10 max-w-md rounded-lg border border-[var(--bb-border)] bg-[var(--bb-surface)] p-6 text-center"
    >
      <h1 className="text-lg font-medium text-[var(--bb-fg)]">{cau.tieuDe}</h1>
      <p className="mt-2 text-sm text-[var(--bb-fg-muted)]">{cau.giaiThich}</p>
      <Link
        href="/admin"
        className="mt-5 inline-flex h-10 items-center justify-center rounded-[var(--bb-radius-sm)] bg-[var(--bb-fg)] px-4 text-sm font-medium text-[var(--bb-bg)]"
      >
        Về Bàn làm việc
      </Link>
    </section>
  );
}
