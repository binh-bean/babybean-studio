/**
 * BB-392 mục 3a — nhãn nhà trên dòng việc của bộ thuộc khách có ≥ 2 bộ:
 * "Nhà <tên khách> · Buổi N/M" + lối "Xem cả nhà" sang trang khách hàng.
 * Đặt NGOÀI thẻ <a> của dòng việc (không lồng link trong link).
 */

import Link from "next/link";
import { chuNhanNha, type NhaCuaBo } from "@/lib/gia-dinh/nha-cua-bo";

export function NhanNhaBoAnh({ nha, className }: { nha: NhaCuaBo | null | undefined; className?: string }) {
  if (!nha || nha.tong < 2) return null;
  return (
    <span
      data-testid="nhan-nha-bo-anh"
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--bb-fg-muted)] ${className ?? ""}`}
    >
      <span className="rounded-full border border-[var(--bb-border)] px-2 py-0.5 tabular-nums">{chuNhanNha(nha)}</span>
      <Link
        href={`/admin/customers/${encodeURIComponent(nha.customerId)}`}
        className="font-medium text-[var(--bb-fg)] underline underline-offset-2 hover:opacity-80"
        data-testid="xem-ca-nha"
      >
        Xem cả nhà
      </Link>
    </span>
  );
}
