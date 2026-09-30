"use client";

/**
 * BB-331 — "Kéo dòng hợp đồng từ Lark" cho bộ đã gắn hóa đơn mà vẫn chưa có
 * dòng nào (bộ gắn trước bản vá này). Bộ gắn/tạo SAU bản vá tự kéo ngay, xem
 * `POST /api/admin/galleries/[id]/dong-hop-dong`.
 */
import React from "react";
import { Button } from "@/components/ui/button";

export function NutKeoDongHopDong({ galleryId, onDone }: { galleryId: string; onDone: () => Promise<void> }) {
  const [dang, setDang] = React.useState(false);
  const [cau, setCau] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function keo() {
    setDang(true);
    setCau(null);
    try {
      const res = await fetch(`/api/admin/galleries/${encodeURIComponent(galleryId)}/dong-hop-dong`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setCau({ ok: false, text: json?.error?.message ?? "Chưa kéo được, thử lại giúp" });
        return;
      }
      const d = json?.data as { soDongGhi: number; maKhongThay: string[]; sanPhamChuaCo: string[] };
      const phan = [
        d.soDongGhi > 0 ? `Đã kéo ${d.soDongGhi} dòng từ Lark.` : "Lark chưa có dòng nào cho hóa đơn này.",
        d.sanPhamChuaCo.length > 0 ? `Chưa có trong danh mục: ${d.sanPhamChuaCo.join(", ")}.` : null,
      ].filter(Boolean);
      setCau({ ok: d.soDongGhi > 0, text: phan.join(" ") });
      await onDone();
    } catch {
      setCau({ ok: false, text: "Mất kết nối, thử lại giúp" });
    } finally {
      setDang(false);
    }
  }

  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="nut-keo-dong-hop-dong"
        disabled={dang}
        onClick={() => void keo()}
      >
        {dang ? "Đang kéo từ Lark…" : "Kéo dòng hợp đồng từ Lark"}
      </Button>
      {cau && (
        <span role="status" className={`text-xs ${cau.ok ? "text-[var(--bb-fg-muted)]" : "text-[var(--bb-danger)]"}`}>
          {cau.text}
        </span>
      )}
    </span>
  );
}
