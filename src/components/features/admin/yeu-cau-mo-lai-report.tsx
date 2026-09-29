/**
 * Tab "Yêu cầu mở lại" ở /admin/viec-can-xu-ly — mọi bộ ảnh đang có yêu cầu
 * "xin mở lại" CHƯA XỬ LÝ.
 *
 * OWNER: DEV-FE. Task BB-312 (P0, chủ studio): khách bấm xin mở lại nhưng
 * phía quản trị chỉ hiện một dòng lẫn trong Dòng thời gian hoạt động — không
 * chỗ nào gom lại để CSKH biết đang có bao nhiêu việc đang chờ trên toàn chi
 * nhánh. Từng dòng bấm vào mở đúng bộ ảnh, nơi có khối nổi bật
 * (`YeuCauMoLaiBanner`) để xử lý thật.
 *
 * BB-327 (chủ studio 29/09/2026): "Yêu cầu mở lại phải có nút Mở lại" ngay
 * trong danh sách — không bắt CSKH mở từng bộ ảnh. Mỗi dòng dùng lại ĐÚNG
 * khối `YeuCauMoLaiBanner` của trang chi tiết (cùng luật `luaChonMoLai`, cùng
 * hai route /reopen và /reopen/tu-choi), xử lý xong thì tải lại danh sách.
 */

"use client";

import React from "react";
import Link from "next/link";
import { CARD_TITLE_CLASS } from "./page-header";
import { YeuCauMoLaiBanner } from "./yeu-cau-mo-lai-banner";
import type { DotTomTat } from "@/lib/gallery/dot-chon";
import { SU_KIEN_VIEC_DOI } from "@/lib/utils/viec-can-xu-ly-tabs";
import { tenMeThat } from "@/lib/utils/dinh-dang";

interface DongYeuCau {
  galleryId: string;
  title: string;
  status: string;
  branchName: string | null;
  customerName: string | null;
  requestedAt: string;
  lyDo: string | null;
  lanThu: number;
  dotXin?: number | null;
  cacDot?: DotTomTat[];
}

export function YeuCauMoLaiReport() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<DongYeuCau[]>([]);
  const [canReopen, setCanReopen] = React.useState(false);

  const tai = React.useCallback(async (alive: () => boolean = () => true) => {
    try {
      const res = await fetch("/api/admin/reports/yeu-cau-mo-lai", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!alive()) return;
      if (!res.ok) {
        setError(json?.error?.message ?? "Không tải được danh sách");
        return;
      }
      setError(null);
      setItems(json.data.items ?? []);
      setCanReopen(json.data.canReopen === true);
    } catch {
      if (alive()) setError("Mất kết nối, thử lại giúp.");
    } finally {
      if (alive()) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let alive = true;
    void tai(() => alive);
    return () => {
      alive = false;
    };
  }, [tai]);

  if (loading) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;
  if (error) return <p className="text-sm text-[var(--bb-danger)]">{error}</p>;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className={CARD_TITLE_CLASS}>Ba mẹ xin mở lại bộ ảnh</h2>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Yêu cầu chưa có ai trả lời. Mở lại hoặc từ chối kèm lý do ngay tại đây.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">
          Không có yêu cầu nào đang chờ — mọi việc đã được trả lời.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.galleryId} data-testid="dong-yeu-cau-mo-lai" className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <Link
                  href={`/admin/galleries/${encodeURIComponent(it.galleryId)}`}
                  className="font-medium text-[var(--bb-fg)] underline-offset-2 hover:underline"
                >
                  {/* BB-325 — tiêu đề là tên mẹ; không có thì tên bộ. */}
                  {tenMeThat(it.customerName) || it.title}
                </Link>
                <span className="text-xs text-[var(--bb-fg-muted)]">
                  {[tenMeThat(it.customerName) ? it.title : null, it.branchName].filter(Boolean).join(" · ")}
                </span>
              </div>
              <YeuCauMoLaiBanner
                galleryId={it.galleryId}
                status={it.status}
                canReopen={canReopen}
                cacDot={it.cacDot ?? []}
                reopenRequest={{
                  trangThai: "cho_xu_ly",
                  lucGuiGanNhat: it.requestedAt,
                  lyDoKhach: it.lyDo,
                  lyDoTuChoi: null,
                  lucXuLy: null,
                  lanThu: it.lanThu,
                  dotXin: it.dotXin ?? null,
                }}
                onDone={async () => {
                  await tai();
                  window.dispatchEvent(new Event(SU_KIEN_VIEC_DOI));
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
