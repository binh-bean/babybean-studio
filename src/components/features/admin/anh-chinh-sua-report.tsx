/**
 * Tab "Ảnh chỉnh sửa" ở /admin/viec-can-xu-ly (BB-371).
 *
 * Mỗi bộ ảnh một dòng: ảnh chỉnh mới về chờ CSKH kiểm rồi gửi khách, hoặc ba
 * mẹ vừa xin sửa. Bấm dòng mở đúng bộ ảnh — nơi có khối "Ảnh chỉnh sửa" để xem
 * từng tấm và bấm "Gửi khách duyệt".
 */

"use client";

import React from "react";
import Link from "next/link";
import { useCapNhatTucThi } from "@/lib/utils/use-cap-nhat-tuc-thi";
import { CARD_TITLE_CLASS } from "./page-header";
import { formatNgayVN, formatSo } from "@/lib/utils/dinh-dang";

interface DongViec {
  loai: "cho_gui" | "khach_sua";
  galleryId: string;
  title: string;
  soAnh: number;
  lan?: number;
  /** BB-377 — đợt mua thêm của dòng việc. */
  nhanDot?: string;
  khoa?: string;
  luc: string;
}

export function moTaViec(v: Pick<DongViec, "loai" | "soAnh" | "lan" | "nhanDot">): string {
  const dot = v.nhanDot ? ` (${v.nhanDot})` : "";
  if (v.loai === "cho_gui") return `Có ${formatSo(v.soAnh)} ảnh chỉnh sửa${dot} — kiểm rồi gửi khách`;
  const tam = v.soAnh > 0 ? ` · ${formatSo(v.soAnh)} tấm` : "";
  return `Khách yêu cầu sửa lần ${v.lan ?? 1}${dot}${tam}`;
}

export function AnhChinhSuaReport() {
  const [items, setItems] = React.useState<DongViec[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const tai = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reports/anh-chinh-sua", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Không tải được danh sách");
        return;
      }
      setError(null);
      setItems(json.data.items ?? []);
    } catch {
      setError("Mất kết nối, thử lại giúp.");
    }
  }, []);

  React.useEffect(() => {
    void tai();
  }, [tai]);
  useCapNhatTucThi("nhan-vien", () => void tai());

  if (error) return <p className="text-sm text-[var(--bb-danger)]">{error}</p>;
  if (!items) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className={CARD_TITLE_CLASS}>Ảnh chỉnh sửa</h2>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Ảnh chỉnh mới về từ thư mục Drive chỉ tới tay khách khi CSKH bấm “Gửi khách duyệt”. Khách xin sửa thì
          xem từng tấm, vùng khoanh và ảnh mẫu trong bộ ảnh.
        </p>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">Không có ảnh chỉnh nào đang chờ.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--bb-border)] rounded-lg border border-[var(--bb-border)]">
          {items.map((v) => (
            <li key={`${v.loai}-${v.galleryId}-${v.khoa ?? ""}`} data-testid="dong-anh-chinh-sua" data-loai={v.loai} data-khoa={v.khoa ?? "goc"}>
              <Link
                href={`/admin/galleries/${encodeURIComponent(v.galleryId)}#anh-chinh-sua`}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm hover:bg-[var(--bb-surface-2)]"
              >
                <span>
                  <span className="font-medium">{v.title}</span>
                  <span className={v.loai === "khach_sua" ? "ml-2 text-[var(--bb-danger)]" : "ml-2 text-[var(--bb-fg-muted)]"}>
                    {moTaViec(v)}
                  </span>
                </span>
                <span className="text-xs text-[var(--bb-fg-muted)]">{formatNgayVN(v.luc)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
