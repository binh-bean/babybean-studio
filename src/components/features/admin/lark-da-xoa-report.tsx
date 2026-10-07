"use client";

/**
 * BB-332 — tab "Dòng Lark đã bị xoá" ở /admin/viec-can-xu-ly.
 *
 * Bộ ảnh đã gửi khách/có ảnh chọn mà dòng Hậu Kỳ của nó bị xoá bên Lark. App
 * không xoá bộ ảnh; CSKH mở bộ ảnh, gắn lại dòng Lark đúng (hoặc lưu trữ), rồi
 * bấm "Đã xử lý" để dòng rời danh sách.
 */
import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CARD_TITLE_CLASS } from "./page-header";
import { SU_KIEN_VIEC_DOI } from "@/lib/utils/viec-can-xu-ly-tabs";
import { tenMeThat } from "@/lib/utils/dinh-dang";
import { hienTieuDeBoAnh } from "@/lib/utils/ma-hoa-don";

interface Dong {
  galleryId: string;
  title: string;
  status: string;
  maHoaDon: string | null;
  branchName: string | null;
  customerName: string | null;
  thayLuc: string;
}

export function LarkDaXoaReport() {
  const [items, setItems] = React.useState<Dong[] | null>(null);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [dangLam, setDangLam] = React.useState<string | null>(null);

  const tai = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reports/lark-da-xoa", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi(json?.error?.message ?? "Không tải được danh sách");
        return;
      }
      setLoi(null);
      setItems(json.data.items ?? []);
    } catch {
      setLoi("Mất kết nối, thử lại giúp.");
    }
  }, []);

  React.useEffect(() => {
    void tai();
  }, [tai]);

  async function daXuLy(galleryId: string) {
    setDangLam(galleryId);
    try {
      const res = await fetch("/api/admin/reports/lark-da-xoa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ galleryId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi(json?.error?.message ?? "Không lưu được");
        return;
      }
      await tai();
      window.dispatchEvent(new Event(SU_KIEN_VIEC_DOI));
    } finally {
      setDangLam(null);
    }
  }

  if (!items && !loi) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <header>
        <h2 className={CARD_TITLE_CLASS}>Dòng Lark đã bị xoá</h2>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Bộ ảnh đã gửi khách nên app không tự xoá. Mở bộ ảnh, gắn lại dòng Hậu Kỳ đúng hoặc lưu trữ, rồi bấm Đã xử lý.
        </p>
      </header>
      {loi && <p role="alert" className="text-sm text-[var(--bb-danger)]">{loi}</p>}
      {items && items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">Không có bộ ảnh nào mất dòng Lark.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--bb-border)] rounded-lg border border-[var(--bb-border)]">
          {(items ?? []).map((it) => (
            <li key={it.galleryId} data-testid="dong-lark-da-xoa" className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-[var(--bb-fg)]">{tenMeThat(it.customerName) || hienTieuDeBoAnh(it.title)}</p>
                <p className="text-xs text-[var(--bb-fg-muted)] [overflow-wrap:anywhere]">
                  {[it.maHoaDon, it.branchName, `thấy mất lúc ${new Date(it.thayLuc).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/galleries/${encodeURIComponent(it.galleryId)}`}>Mở bộ ảnh</Link>
              </Button>
              <Button size="sm" disabled={dangLam === it.galleryId} onClick={() => void daXuLy(it.galleryId)}>
                Đã xử lý
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
