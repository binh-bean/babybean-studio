"use client";

/**
 * Nút "Lên đầu trang" — BB-330 mục 3.
 *
 * OWNER: DEV-FE. Chủ studio 30/09/2026: nút tròn nhỏ màu trắng ở góc dưới
 * bên phải, mũi tên lên nét mảnh; chỉ hiện sau khi ba mẹ đã cuộn khoảng 1,5
 * màn hình; bấm thì cuộn mượt về đầu trang.
 *
 * Không che thanh chọn/chốt (`ThanhChon`, `fixed bottom-0`, cao 48px + lề đáy
 * max(12px, safe-area)): nút đứng CAO HƠN mép trên của thanh đó 12px — cùng
 * công thức lề đáy với thanh, nên trên iPhone có vạch Home vẫn không chồng.
 * Nằm ở z-30 (bằng thanh đáy) để mọi lớp phủ (xem ảnh lớn, tấm trượt z-50)
 * luôn che được nó.
 */

import React, { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/** Hiện khi đã cuộn quá 1,5 lần chiều cao khung nhìn. */
export const NGUONG_HIEN_NUT_LEN_DAU = 1.5;

export function NutLenDauTrang() {
  const [hien, setHien] = useState(false);

  useEffect(() => {
    const kiem = () => setHien(window.scrollY > window.innerHeight * NGUONG_HIEN_NUT_LEN_DAU);
    kiem();
    window.addEventListener("scroll", kiem, { passive: true });
    window.addEventListener("resize", kiem);
    return () => {
      window.removeEventListener("scroll", kiem);
      window.removeEventListener("resize", kiem);
    };
  }, []);

  if (!hien) return null;

  const lenDau = () => {
    let giamChuyenDong = false;
    try {
      giamChuyenDong = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // Trình duyệt cũ không có matchMedia — cứ cuộn mượt.
    }
    window.scrollTo({ top: 0, behavior: giamChuyenDong ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      data-testid="nut-len-dau-trang"
      onClick={lenDau}
      aria-label="Lên đầu trang"
      title="Lên đầu trang"
      className="fixed right-4 bottom-[calc(max(12px,env(safe-area-inset-bottom))+60px)] z-30 grid h-10 w-10 place-items-center rounded-full border border-border bg-white text-foreground shadow-[0_4px_14px_-6px_rgba(46,42,39,0.3)] transition hover:bg-surface-2 animate-in fade-in lg:right-6"
    >
      <ArrowUp className="h-[18px] w-[18px]" strokeWidth={1.4} aria-hidden="true" />
    </button>
  );
}
