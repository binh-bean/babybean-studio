"use client";

/**
 * Nút "Tải ảnh" ở đầu màn khách, mở ra hai lựa chọn.
 *
 * OWNER: DEV-FE. Trước 23/09/2026 đây là cả một thanh dính ở đáy màn hình, đè
 * lên thanh "Đã chọn / Chốt". Chính sách tải (BB-156, docs/13 mục 4) KHÔNG đổi
 * — bộ nào cho tải thì vẫn tải được từng tấm, những tấm đã chọn, hoặc cả bộ.
 * Chỉ đổi CHỖ đặt: tải về là việc làm một lần, không đáng chiếm chỗ thường trực
 * cạnh nút chốt.
 */

import React, { useEffect, useRef, useState } from "react";

export interface MenuTaiAnhProps {
  soAnh: number;
  /** Dung lượng cả bộ đã viết cho người đọc, ví dụ "1,1 GB". */
  dungLuong: string;
  soDaChon: number;
  onTaiDaChon: () => void;
  onTaiCaBo: () => void;
}

export function MuiTenTai({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function MenuTaiAnh({ soAnh, dungLuong, soDaChon, onTaiDaChon, onTaiCaBo }: MenuTaiAnhProps) {
  const [mo, setMo] = useState(false);
  const khungRef = useRef<HTMLDivElement | null>(null);

  // Bấm ra ngoài hoặc Esc thì đóng — như mọi thực đơn ba mẹ đã quen.
  useEffect(() => {
    if (!mo) return;
    const ngoai = (e: MouseEvent) => {
      if (khungRef.current && !khungRef.current.contains(e.target as Node)) setMo(false);
    };
    const phim = (e: KeyboardEvent) => e.key === "Escape" && setMo(false);
    document.addEventListener("mousedown", ngoai);
    document.addEventListener("keydown", phim);
    return () => {
      document.removeEventListener("mousedown", ngoai);
      document.removeEventListener("keydown", phim);
    };
  }, [mo]);

  const chon = (viec: () => void) => () => {
    setMo(false);
    viec();
  };

  return (
    <div ref={khungRef} className="relative">
      <button
        type="button"
        onClick={() => setMo((m) => !m)}
        aria-label="Tải ảnh về máy"
        aria-expanded={mo}
        aria-haspopup="menu"
        className="grid h-9 w-9 place-items-center rounded-full border border-border text-foreground transition hover:bg-surface-2"
      >
        <MuiTenTai />
      </button>

      {mo && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-40 w-64 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-[0_18px_40px_-16px_rgba(42,36,32,.35)]"
        >
          {soDaChon > 0 && (
            <button
              type="button"
              role="menuitem"
              onClick={chon(onTaiDaChon)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-2"
            >
              <MuiTenTai className="shrink-0 text-muted-foreground" />
              Tải {soDaChon} ảnh đã chọn
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={chon(onTaiCaBo)}
            className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-2"
          >
            <MuiTenTai className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              Tải cả bộ
              <span className="block text-xs text-muted-foreground">
                {soAnh.toLocaleString("vi-VN")} ảnh · {dungLuong} · ảnh gốc
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
