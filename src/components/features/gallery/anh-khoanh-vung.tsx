/**
 * BB-371 — một tấm ảnh kèm các VÙNG KHOANH (vòng tròn) vẽ đè lên.
 *
 * Dùng chung cho màn khách (ba mẹ chạm để khoanh chỗ cần sửa) và màn quản trị
 * (thợ chỉnh xem lại đúng chỗ ba mẹ khoanh). Toạ độ lưu theo TỈ LỆ khung ảnh
 * (0..1, bán kính theo bề NGANG) nên đúng ở mọi cỡ màn hình.
 */

"use client";

import React from "react";
import type { VungKhoanh } from "@/lib/anh-chinh-sua/nhan-dien";

export const BAN_KINH_MAC_DINH = 0.07;

export function AnhKhoanhVung({
  src,
  srcDuPhong,
  alt,
  tiLe,
  vung,
  dangKhoanh = false,
  onThem,
  onBo,
  className,
}: {
  src: string;
  srcDuPhong?: string;
  alt: string;
  /** cao / ngang; null = đợi ảnh tải để biết. */
  tiLe: number | null;
  vung: readonly VungKhoanh[];
  dangKhoanh?: boolean;
  onThem?: (v: VungKhoanh) => void;
  onBo?: (chiSo: number) => void;
  className?: string;
}) {
  const [tiLeThat, setTiLeThat] = React.useState<number | null>(tiLe);
  const [nguon, setNguon] = React.useState(src);
  React.useEffect(() => setNguon(src), [src]);
  const r = tiLeThat ?? 1;
  const W = 1000;
  const H = Math.round(W * r);

  function cham(e: React.MouseEvent<HTMLDivElement>) {
    if (!dangKhoanh || !onThem) return;
    const hop = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - hop.left) / hop.width;
    const y = (e.clientY - hop.top) / hop.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onThem({ x: Math.round(x * 1e4) / 1e4, y: Math.round(y * 1e4) / 1e4, r: BAN_KINH_MAC_DINH });
  }

  return (
    <div
      className={`relative select-none ${dangKhoanh ? "cursor-crosshair" : "cursor-pointer"} ${className ?? ""}`}
      style={{ aspectRatio: `1 / ${r}` }}
      onClick={cham}
      data-testid="anh-khoanh"
      data-so-vung={vung.length}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive qua /api/img hoặc lh3, không qua next/image */}
      <img
        src={nguon}
        alt={alt}
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain"
        onLoad={(e) => {
          const im = e.currentTarget;
          if (!tiLe && im.naturalWidth > 0) setTiLeThat(im.naturalHeight / im.naturalWidth);
        }}
        onError={() => {
          if (srcDuPhong && nguon !== srcDuPhong) setNguon(srcDuPhong);
        }}
      />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {vung.map((v, i) => (
          <circle
            key={i}
            cx={v.x * W}
            cy={v.y * H}
            r={v.r * W}
            fill="rgba(255,255,255,0.12)"
            stroke="#e0566b"
            strokeWidth={6}
            strokeDasharray="18 10"
            className="cursor-pointer"
            data-testid="vung-khoanh"
            style={{ pointerEvents: dangKhoanh && onBo ? "auto" : "none", cursor: "pointer" }}
            onClick={(e) => {
              if (!dangKhoanh || !onBo) return;
              e.stopPropagation();
              onBo(i);
            }}
          />
        ))}
      </svg>
    </div>
  );
}
