/**
 * Tab "Yêu cầu mở lại" ở /admin/viec-can-xu-ly — mọi bộ ảnh đang có yêu cầu
 * "xin mở lại" CHƯA XỬ LÝ.
 *
 * OWNER: DEV-FE. Task BB-312 (P0, chủ studio): khách bấm xin mở lại nhưng
 * phía quản trị chỉ hiện một dòng lẫn trong Dòng thời gian hoạt động — không
 * chỗ nào gom lại để CSKH biết đang có bao nhiêu việc đang chờ trên toàn chi
 * nhánh. Từng dòng bấm vào mở đúng bộ ảnh, nơi có khối nổi bật
 * (`YeuCauMoLaiBanner`) để xử lý thật.
 */

"use client";

import React from "react";
import Link from "next/link";
import { CARD_TITLE_CLASS } from "./page-header";
import { formatNgayVN } from "@/lib/utils/dinh-dang";

interface DongYeuCau {
  galleryId: string;
  title: string;
  status: string;
  branchName: string | null;
  customerName: string | null;
  requestedAt: string;
  lyDo: string | null;
  lanThu: number;
}

function gioPhut(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function YeuCauMoLaiReport() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<DongYeuCau[]>([]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/reports/yeu-cau-mo-lai", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setError(json?.error?.message ?? "Không tải được danh sách");
          return;
        }
        setItems(json.data.items ?? []);
      } catch {
        if (alive) setError("Mất kết nối, thử lại giúp.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;
  if (error) return <p className="text-sm text-[var(--bb-danger)]">{error}</p>;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className={CARD_TITLE_CLASS}>Ba mẹ xin mở lại bộ ảnh</h2>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Yêu cầu chưa có ai trả lời. Bấm vào để mở bộ ảnh, mở lại hoặc từ chối kèm lý do.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">
          Không có yêu cầu nào đang chờ — mọi việc đã được trả lời.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.galleryId}>
              <Link
                href={`/admin/galleries/${encodeURIComponent(it.galleryId)}`}
                className="block rounded-lg border border-[var(--bb-warning)]/40 bg-[var(--bb-warning)]/5 p-3 text-sm hover:bg-[var(--bb-warning)]/10"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-[var(--bb-fg)]">{it.title}</span>
                  <span className="text-xs text-[var(--bb-fg-muted)]">
                    {formatNgayVN(it.requestedAt)} · {gioPhut(it.requestedAt)} · lần {it.lanThu}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--bb-fg-muted)]">
                  {[it.customerName, it.branchName].filter(Boolean).join(" · ")}
                </p>
                {it.lyDo && <p className="mt-1.5 text-sm">&ldquo;{it.lyDo}&rdquo;</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
