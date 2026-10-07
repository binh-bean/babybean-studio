"use client";

/**
 * BB-379 — khối "Chưa có tên bé" ở màn chi tiết bộ ảnh (CSKH điền nhanh).
 *
 * 240/495 bộ trên bb-dev chưa gắn bé nào nên bìa khách rơi về "Baby Bean". Khối này chỉ hiện khi
 * bộ chưa có bé (và nhân viên có quyền sửa bộ ảnh): gõ tên bé, hoặc bấm một bé đã có của khách
 * (một nhà nhiều bộ — dùng lại, không tạo trùng), rồi Lưu. Máy chủ (`PUT .../ten-be`) gắn/tạo
 * `babies` và `galleries.baby_id`; lưu xong bìa khách đổi sang tên bé ở lần mở tiếp theo.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface KhoiTenBeProps {
  galleryId: string;
  /** Bé đã có của khách (từ `beCuaKhach` của API chi tiết). */
  goiY: Array<{ id: string; ten: string }>;
  onDone: () => void | Promise<void>;
}

const CHU = {
  tieuDe: "Bộ ảnh này chưa có tên bé",
  moTa: "Điền tên bé để bìa ba mẹ hiện đúng tên bé thay vì “Baby Bean”.",
  nhan: "Tên bé",
  placeholder: "Ví dụ: Nguyễn Ngọc Bảo An",
  goiY: "Bé đã có của khách:",
  luu: "Lưu tên bé",
  dangLuu: "Đang lưu…",
  loiChung: "Chưa lưu được tên bé. Thử lại giúp em.",
} as const;

export function KhoiTenBe({ galleryId, goiY, onDone }: KhoiTenBeProps) {
  const [ten, setTen] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loi, setLoi] = React.useState<string | null>(null);

  async function luu() {
    const t = ten.replace(/\s+/g, " ").trim();
    if (!t || busy) return;
    setBusy(true);
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/galleries/${encodeURIComponent(galleryId)}/ten-be`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: t }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi(body?.error?.message ?? CHU.loiChung);
        // 409: người khác vừa điền — tải lại để thấy tên mới.
        if (res.status === 409) await onDone();
        return;
      }
      await onDone();
    } catch {
      setLoi(CHU.loiChung);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="khoi-ten-be"
      className="rounded-lg border border-[var(--bb-warning)] bg-[var(--bb-warning)]/10 p-4"
    >
      <h2 className="text-sm font-medium">{CHU.tieuDe}</h2>
      <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">{CHU.moTa}</p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          void luu();
        }}
      >
        <Input
          name="tenBe"
          value={ten}
          onChange={(e) => setTen(e.target.value)}
          placeholder={CHU.placeholder}
          aria-label={CHU.nhan}
          maxLength={120}
          disabled={busy}
          data-testid="o-ten-be"
          className="sm:max-w-sm"
        />
        <Button type="submit" variant="muc" disabled={busy || ten.trim().length === 0} data-testid="nut-luu-ten-be">
          {busy ? CHU.dangLuu : CHU.luu}
        </Button>
      </form>
      {goiY.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" data-testid="goi-y-ten-be">
          <span className="text-[var(--bb-fg-muted)]">{CHU.goiY}</span>
          {goiY.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={busy}
              onClick={() => setTen(b.ten)}
              className="rounded-full border border-[var(--bb-border)] px-2.5 py-1 hover:bg-[var(--bb-surface-2)]"
            >
              {b.ten}
            </button>
          ))}
        </div>
      )}
      {loi && (
        <p role="alert" className="mt-2 text-xs text-[var(--bb-danger)]">
          {loi}
        </p>
      )}
    </section>
  );
}
