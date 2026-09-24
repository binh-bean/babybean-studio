"use client";

/**
 * Màn so sánh nhiều tấm (BB-218) — xem 2–4 tấm cạnh nhau, bỏ bớt ngay tại chỗ.
 *
 * OWNER: DEV-FE. Lời chủ studio (24/09/2026): "So sánh hai tấm cạnh nhau — có
 * thể cạnh nhau hoặc không cạnh nhau nếu khách hàng muốn. Ví dụ chọn quá nhiều
 * cần bỏ bớt." Nên ba mẹ chọn BẤT KỲ 2–4 tấm trong lưới (không cần liền nhau),
 * xem chúng cạnh nhau ở đây, và bấm "Bỏ khỏi so sánh" ngay khi thấy dư.
 *
 * Bố cục tính ở `lib/gallery/so-sanh.ts` (toán thuần, có phép thử riêng):
 * 2 tấm xếp theo hướng màn (điện thoại dọc: trên/dưới — màn ngang/máy tính:
 * trái/phải); 3–4 tấm luôn lưới 2×2, không phụ thuộc hướng.
 *
 * Chạm hai lần vào một tấm KHÔNG phóng to tại chỗ (giữ tệp này gọn, không chép
 * lại toán của `phong-anh.ts`) — mở thẳng tấm đó trong màn xem lớn đã có sẵn
 * đủ cử chỉ phóng to (chỗ gọi `onPhongTo` lo việc đó).
 *
 * Nền tối và mọi màu lấy từ `.giao-dien-khach` trong tokens.css, giống hệt
 * `photo-lightbox.tsx` — hai màn cùng là "đang xem ảnh lớn", chỉ khác đang
 * xem một tấm hay nhiều tấm.
 */

import React, { useEffect, useRef, useState } from "react";
import { X, Heart } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { vi } from "@/i18n";
import type { PhotoPublic } from "@/types/domain";
import { buildLightboxImageUrl } from "@/lib/utils/lightbox";
import { boCucSoSanh } from "@/lib/gallery/so-sanh";

export interface SoSanhAnhProps {
  /** 2–4 tấm đang so sánh, đúng thứ tự ba mẹ đã chọn. */
  photos: PhotoPublic[];
  mutatingIds: Set<string>;
  /** Khoá hoặc link không có quyền chọn — tim bị khoá như mọi nơi khác. */
  isLocked: boolean;
  onToggleHeart: (photo: PhotoPublic) => void;
  onBoKhoi: (photo: PhotoPublic) => void;
  onDong: () => void;
  /** Chạm hai lần vào một tấm — mở tấm đó trong màn xem lớn. */
  onPhongTo: (photo: PhotoPublic) => void;
  /** Tổng đã chọn / hạn mức gói — để ba mẹ biết mình đang vượt hay không NGAY tại đây. */
  daChon?: number;
  hanMuc?: number | null;
}

export function SoSanhAnh({
  photos,
  mutatingIds,
  isLocked,
  onToggleHeart,
  onBoKhoi,
  onDong,
  onPhongTo,
  daChon,
  hanMuc,
}: SoSanhAnhProps) {
  // Hướng màn đo bằng bề ngang/cao thật của cửa sổ — cùng cách LuoiAnh đo,
  // không dùng CSS orientation vì codebase này chọn cột theo bề ngang
  // (`soCotSoLe`), không theo hướng thiết bị.
  const [manHinhDoc, setManHinhDoc] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth < window.innerHeight,
  );

  useEffect(() => {
    const doLai = () => setManHinhDoc(window.innerWidth < window.innerHeight);
    doLai();
    window.addEventListener("resize", doLai);
    return () => window.removeEventListener("resize", doLai);
  }, []);

  // Khoá cuộn trang nền — cùng luật với photo-lightbox.tsx.
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDong();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDong]);

  if (photos.length === 0) return null;

  const boCuc = boCucSoSanh(photos.length, manHinhDoc);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="So sánh nhiều tấm"
      className="fixed inset-0 z-50 flex flex-col bg-bb-viewer-bg text-white select-none"
      data-con-tro="mac-dinh"
    >
      <header className="relative z-20 flex shrink-0 items-center justify-between px-3 py-2.5 sm:px-4">
        <span className="min-w-0 flex-1 truncate px-2 text-[13px] text-white/75">
          So sánh {photos.length} tấm
          {typeof daChon === "number" && (
            <span className="text-white/50">
              {" "}
              · {daChon}
              {hanMuc != null ? ` / ${hanMuc}` : ""} tấm đã chọn
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onDong}
          aria-label={vi.common.close}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 active:scale-95 touch-manipulation focus:outline-hidden"
        >
          <X className="h-6 w-6" strokeWidth={1.8} />
        </button>
      </header>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-px overflow-hidden bg-white/10",
          boCuc === "doc" && "grid-rows-2",
          boCuc === "ngang" && "grid-cols-2",
          boCuc === "luoi" && "grid-cols-2 grid-rows-2",
        )}
      >
        {photos.map((photo) => (
          <OTamSoSanh
            key={photo.id}
            photo={photo}
            dangGui={mutatingIds.has(photo.id)}
            khoa={isLocked}
            onToggleHeart={onToggleHeart}
            onBoKhoi={onBoKhoi}
            onPhongTo={onPhongTo}
          />
        ))}
      </div>
    </div>
  );
}

interface OTamSoSanhProps {
  photo: PhotoPublic;
  dangGui: boolean;
  khoa: boolean;
  onToggleHeart: (photo: PhotoPublic) => void;
  onBoKhoi: (photo: PhotoPublic) => void;
  onPhongTo: (photo: PhotoPublic) => void;
}

function OTamSoSanh({ photo, dangGui, khoa, onToggleHeart, onBoKhoi, onPhongTo }: OTamSoSanhProps) {
  /** Chạm hai lần trong 300ms — cùng ngưỡng với photo-lightbox.tsx. */
  const chamTruocRef = useRef(0);
  const daChon = photo.mark === "selected";

  const chamTam = () => {
    const bayGio = Date.now();
    if (bayGio - chamTruocRef.current < 300) {
      chamTruocRef.current = 0;
      onPhongTo(photo);
    } else {
      chamTruocRef.current = bayGio;
    }
  };

  return (
    <div className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-bb-viewer-bg p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={buildLightboxImageUrl(photo.id, 1600)}
        alt={photo.fileName || "Ảnh so sánh"}
        onClick={chamTam}
        // "cursor-pointer" (không phải cursor-zoom-in như photo-lightbox.tsx):
        // chạm một lần ở đây không làm gì thấy được — phải chạm HAI LẦN mới
        // phóng to (mở màn xem lớn). Xem tests/unit/con-tro-ban-tay.test.ts.
        className="h-auto max-h-full w-auto max-w-full cursor-pointer select-none object-contain"
      />

      <button
        type="button"
        onClick={() => onBoKhoi(photo)}
        className="absolute left-2 top-2 z-10 rounded-full bg-black/55 px-3 py-1.5 text-[12px] text-white/90 backdrop-blur-md transition hover:bg-black/70 active:scale-95"
      >
        Bỏ khỏi so sánh
      </button>

      {/* Tim to — như ở màn xem lớn. Khoá thì tấm chưa chọn không hiện tim. */}
      {(!khoa || daChon) && (
        <button
          type="button"
          disabled={khoa || dangGui}
          onClick={() => onToggleHeart(photo)}
          aria-label={daChon ? vi.gallery.deselect : vi.gallery.select}
          aria-pressed={daChon}
          className={cn(
            "absolute bottom-3 right-3 z-10 grid h-14 w-14 place-items-center rounded-full transition-all active:scale-90 touch-manipulation focus:outline-hidden disabled:opacity-40",
            daChon
              ? "bg-[#c4645a] text-white shadow-[0_10px_26px_-6px_rgba(196,100,90,.65)]"
              : "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/15",
          )}
        >
          <Heart className="h-6 w-6" fill={daChon ? "currentColor" : "none"} strokeWidth={1.8} />
        </button>
      )}

      {photo.fileName && (
        <p className="pointer-events-none absolute bottom-3 left-3 max-w-[65%] truncate rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/85">
          {photo.fileName}
        </p>
      )}
    </div>
  );
}
