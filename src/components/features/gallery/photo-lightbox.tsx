"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { vi } from "@/i18n";
import type { PhotoPublic } from "@/types/domain";
import {
  getVisibleIndices,
  buildLightboxImageUrl,
  buildLightboxSrcSet,
  calculateSwipeAction,
} from "@/lib/utils/lightbox";

export interface PhotoLightboxProps {
  photos: PhotoPublic[];
  initialIndex: number;
  onClose: () => void;
  onToggleHeart: (photo: PhotoPublic) => void;
  /** BB-156: null = bộ ảnh này không cho tải. */
  onTaiAnh?: ((photo: PhotoPublic) => void) | null;
  mutatingIds: Set<string>;
  isLocked: boolean;
  /** BB-180: so anh da chon va han muc, hien thuong truc trong man xem lon. */
  daChon?: number;
  hanMuc?: number | null;
  /** BB-180: luu ghi chu cho tho chinh anh. Duong luu da co tu BB-144. */
  onLuuGhiChu?: (photo: PhotoPublic, ghiChu: string) => Promise<boolean>;
}

/**
 * Màn xem ảnh lớn (Lightbox) — BB-143.
 *
 * OWNER: DEV-FE.
 *
 * Đáp ứng các yêu cầu từ buổi dùng thật của chủ studio:
 * 1. Mở ảnh chất lượng cao w=1600 (/api/img/<id>?w=1600).
 * 2. Nền tối đặc trưng (--bb-viewer-bg = #16130f).
 * 3. Tự xoay và thích ứng theo thiết bị: ảnh vừa khít màn hình, không tràn, không cắt.
 *    Điện thoại xoay ngang thì ảnh ngang chiếm trọn bề ngang màn hình.
 * 4. Thao tác điều hướng: Touch Swipe trên điện thoại, phím mũi tên và Esc trên máy tính.
 * 5. Thả tim chọn ảnh NGAY TRONG màn xem lớn, đồng bộ tức thì.
 * 6. KHÔNG PHÁ cuộn ảo BB-131: Dùng cửa sổ trượt (sliding window) chỉ dựng
 *    tối đa 3 ảnh lân cận [currentIndex - 1, currentIndex, currentIndex + 1]
 *    trong DOM, giải phóng toàn bộ ảnh khác để không phình bộ nhớ với bộ 1.235 tấm.
 */
export function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
  onToggleHeart,
  onTaiAnh,
  mutatingIds,
  isLocked,
  daChon,
  hanMuc,
  onLuuGhiChu,
}: PhotoLightboxProps) {
  // BB-180: o ghi chu cho tung anh, ngay trong man xem lon.
  //
  // BB-144 da dung xong duong luu (PATCH /api/g/selection, truong retouchNote)
  // nhung khach chua bao gio co o de nhap. Day la nua con lai.
  const [ghiChu, setGhiChu] = useState("");
  const [dangLuuGhiChu, setDangLuuGhiChu] = useState(false);
  const [ketQuaLuu, setKetQuaLuu] = useState<"ok" | "loi" | null>(null);

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (initialIndex < 0) return 0;
    if (initialIndex >= photos.length) return Math.max(0, photos.length - 1);
    return initialIndex;
  });

  // Khóa cuộn trang nền khi mở lightbox
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const total = photos.length;
  const currentPhoto = photos[currentIndex];

  // Doi anh thi nap lai ghi chu cua anh do, va xoa thong bao cua anh truoc.
  // Khong lam viec nay thi khach go ghi chu cho anh A roi vuot sang anh B van
  // thay nguyen chu do, tuong minh da ghi cho B.
  useEffect(() => {
    setGhiChu(currentPhoto?.retouchNote ?? "");
    setKetQuaLuu(null);
  }, [currentPhoto?.id, currentPhoto?.retouchNote]);


  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : prev));
  }, [total]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  // Xử lý phím tắt bàn phím
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, onClose]);

  // Hỗ trợ Touch Swipe mượt mà trên thiết bị di động
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
      setSwipeOffset(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touchStartRef.current || !touch) return;
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    // Nếu vuốt ngang rõ rệt hơn vuốt dọc thì cập nhật offset
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Giảm độ dịch nếu ở đầu hoặc cuối danh sách (hiệu ứng cản)
      if ((currentIndex === 0 && deltaX > 0) || (currentIndex === total - 1 && deltaX < 0)) {
        setSwipeOffset(deltaX * 0.3);
      } else {
        setSwipeOffset(deltaX);
      }
    }
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current) return;
    const deltaX = swipeOffset;
    touchStartRef.current = null;
    setSwipeOffset(0);

    const action = calculateSwipeAction(deltaX, 0);
    if (action === "next") {
      goNext();
    } else if (action === "prev") {
      goPrev();
    }
  };

  /**
   * CỬA SỔ TRƯỢT (SLIDING WINDOW):
   * Chỉ giữ các tấm ảnh trong bán kính ±1 quanh currentIndex.
   * Tất cả các tấm ảnh còn lại trong số 1.235 tấm KHÔNG được đưa vào DOM.
   */
  const luuGhiChu = useCallback(async () => {
    // Ghi chú nằm trên `selection_items`, không phải trên `photos`. Ảnh chưa chọn
    // thì không có dòng nào để cập nhật, và `.update()` chạy trúng 0 dòng vẫn
    // báo THÀNH CÔNG. Không chặn ở đây thì khách gõ ghi chú, thấy báo "đã lưu",
    // mà chữ mất trắng — và thợ chỉnh ảnh không bao giờ biết là có dặn dò.
    if (!onLuuGhiChu || !currentPhoto || isLocked) return;
    if (currentPhoto.mark !== "selected") return;
    if ((currentPhoto.retouchNote ?? "") === ghiChu) return;
    setDangLuuGhiChu(true);
    setKetQuaLuu(null);
    try {
      const xong = await onLuuGhiChu(currentPhoto, ghiChu);
      setKetQuaLuu(xong ? "ok" : "loi");
    } catch {
      setKetQuaLuu("loi");
    } finally {
      setDangLuuGhiChu(false);
    }
  }, [onLuuGhiChu, currentPhoto, ghiChu, isLocked]);

  const visibleIndices = useMemo(() => {
    return getVisibleIndices(currentIndex, total, 1);
  }, [currentIndex, total]);

  if (!currentPhoto) return null;

  const isCurrentSelected = currentPhoto.mark === "selected";

  const isMutating = mutatingIds.has(currentPhoto.id);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={vi.common.view || "Xem ảnh"}
      className="fixed inset-0 z-50 flex flex-col justify-between bg-bb-viewer-bg text-white select-none overflow-hidden touch-none"
      onClick={(e) => {
        // Bấm vào vùng trống bên ngoài ảnh thì đóng lightbox
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* THANH ĐIỀU KHIỂN TRÊN (Header) */}
      <header className="relative z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent shrink-0">
        <div className="flex items-center gap-3 min-w-0 pr-2">
          {/* Thứ tự ảnh */}
          <span className="text-xs sm:text-sm font-mono font-medium text-white/90 bg-white/10 px-2.5 py-1 rounded-full whitespace-nowrap">
            {currentIndex + 1} / {total}
          </span>
          {/* Tên file ảnh và thư mục con */}
          <span className="text-xs sm:text-sm font-mono text-white/80 truncate drop-shadow-xs">
            {currentPhoto.fileName}
            {currentPhoto.subfolder && (
              <span className="ml-1.5 opacity-60">({currentPhoto.subfolder})</span>
            )}
          </span>
        </div>

        {/* ------------------------------------------------------------------
            BB-180 — thanh thao tác ở GÓC TRÊN BÊN PHẢI
            ------------------------------------------------------------------
            Chủ studio chốt 17/09: hai nút to ở giữa đáy màn che mất chân ảnh.
            Với ảnh trẻ con thì nhìn trọn tấm ảnh mới là thứ ba mẹ mở link để xem.

            Biểu tượng vẽ nhỏ nhưng vùng chạm giữ 44×44 px (h-11 w-11) — nút nhỏ
            mà bấm trượt thì tệ hơn nút to.
        */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Số đã chọn trên hạn mức — trước đây biến mất khi mở ảnh lớn,
              mà khách chọn ảnh chủ yếu lúc đang xem lớn. */}
          {typeof daChon === "number" && (
            <span
              className={cn(
                "hidden xs:inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap backdrop-blur-md",
                hanMuc != null && daChon > hanMuc
                  ? "bg-amber-500/25 text-amber-100 ring-1 ring-amber-300/40"
                  : "bg-white/10 text-white/90",
              )}
              title={vi.gallery.quotaInline}
            >
              <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              {daChon}
              {hanMuc != null && <span className="opacity-70">/ {hanMuc}</span>}
            </span>
          )}

          {/* Chọn ảnh */}
          <button
            type="button"
            disabled={isLocked || isMutating}
            onClick={(e) => {
              e.stopPropagation();
              onToggleHeart(currentPhoto);
            }}
            aria-label={isCurrentSelected ? vi.gallery.deselect : vi.gallery.select}
            title={isCurrentSelected ? vi.gallery.deselect : vi.gallery.select}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-90 touch-manipulation focus:outline-hidden disabled:opacity-40",
              isCurrentSelected
                ? "bg-rose-500 text-white ring-2 ring-rose-300/50"
                : "bg-white/10 text-white/90 hover:bg-white/20 backdrop-blur-md",
            )}
          >
            <Heart
              className={cn("h-5 w-5", isCurrentSelected ? "fill-current" : "stroke-[2.2]")}
            />
          </button>

          {/* Tải ảnh gốc */}
          {onTaiAnh && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTaiAnh(currentPhoto);
              }}
              aria-label={vi.gallery.downloadThis}
              title={vi.gallery.downloadThis}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/90 backdrop-blur-md hover:bg-white/20 transition-colors active:scale-90 touch-manipulation focus:outline-hidden"
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v12" />
                <path d="M7 12l5 5 5-5" />
                <path d="M4 20h16" />
              </svg>
            </button>
          )}

        {/* Nút Đóng (X) */}
        <button
          type="button"
          onClick={onClose}
          aria-label={vi.common.close}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/90 hover:bg-white/20 hover:text-white transition-colors active:scale-95 touch-manipulation focus:outline-hidden"
        >
          <X className="h-6 w-6" />
        </button>
        </div>
      </header>

      {/* KHUNG HIỂN THỊ ẢNH TRUNG TÂM (Phù hợp cả dọc lẫn xoay ngang điện thoại) */}
      <main
        className="relative flex-1 w-full h-full min-h-0 flex items-center justify-center overflow-hidden p-2 sm:p-4"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        {/* Render cửa sổ trượt (tối đa 3 phần tử) */}
        {visibleIndices.map((idx) => {
          const photo = photos[idx];
          if (!photo) return null;
          const isCurrent = idx === currentIndex;
          const offsetDiff = idx - currentIndex;

          return (
            <div
              key={photo.id}
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-transform duration-200 ease-out pointer-events-none p-2 sm:p-4",
                isCurrent ? "opacity-100 z-10" : "opacity-0 z-0"
              )}
              style={{
                transform: isCurrent
                  ? `translateX(${swipeOffset}px)`
                  : `translateX(${offsetDiff * 100}%)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={buildLightboxImageUrl(photo.id, 1600)}
                srcSet={buildLightboxSrcSet(photo.id)}
                sizes="100vw"
                alt={photo.fileName || `Ảnh ${idx + 1}`}
                decoding="async"
                className="max-h-full max-w-full w-auto h-auto object-contain select-none shadow-2xl pointer-events-auto"
                onClick={(e) => {
                  // Ngăn click vào ảnh kích hoạt backdrop close
                  e.stopPropagation();
                }}
              />
            </div>
          );
        })}

        {/* Nút lùi ảnh (Desktop & Tablet) */}
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            aria-label={vi.ui.pagination.previous}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 hidden sm:flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-md hover:bg-black/70 hover:text-white transition-all active:scale-90"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}

        {/* Nút tiến ảnh (Desktop & Tablet) */}
        {currentIndex < total - 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            aria-label={vi.ui.pagination.next}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 hidden sm:flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-md hover:bg-black/70 hover:text-white transition-all active:scale-90"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </main>

      {/* THANH ĐIỀU KHIỂN DƯỚI (Footer) — Nút thả tim to rõ ràng */}
      {/* ------------------------------------------------------------------
          BB-180 — Ô GHI CHÚ CHO THỢ CHỈNH ẢNH
          ------------------------------------------------------------------
          BB-144 đã dựng xong đường lưu (`PATCH /api/g/selection`, trường
          `retouchNote`) nhưng khách **chưa bao giờ có ô để nhập**. Đây là nửa
          còn lại, đặt đúng chỗ khách nghĩ ra điều muốn dặn: lúc đang nhìn kỹ
          một tấm, không phải lúc lướt lưới.

          Lưu khi rời ô (onBlur), không lưu theo từng phím gõ: mạng yếu là
          chuyện thường ở Việt Nam, gọi máy chủ mỗi chữ là vừa tốn vừa dễ trượt.
      */}
      <footer className="relative z-20 px-4 py-3 pb-5 sm:pb-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent shrink-0">
        {onLuuGhiChu && (
          <div className="mx-auto w-full max-w-2xl">
            <label htmlFor="ghi-chu-anh" className="sr-only">
              {vi.gallery.noteHint}
            </label>
            <textarea
              id="ghi-chu-anh"
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              onBlur={luuGhiChu}
              onClick={(e) => e.stopPropagation()}
              disabled={isLocked || dangLuuGhiChu || !isCurrentSelected}
              rows={2}
              maxLength={500}
              placeholder={
                isLocked
                  ? vi.gallery.noteLocked
                  : !isCurrentSelected
                    ? vi.gallery.noteNeedsSelect
                    : vi.gallery.noteHint
              }
              className="w-full resize-none rounded-xl bg-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-white/45 backdrop-blur-md outline-hidden ring-1 ring-white/15 focus:ring-white/40 disabled:opacity-50"
            />
            <div className="mt-1 h-4 text-xs" aria-live="polite">
              {ketQuaLuu === "ok" && <span className="text-emerald-300">{vi.gallery.noteSaved}</span>}
              {ketQuaLuu === "loi" && <span className="text-amber-300">{vi.gallery.noteSaveFailed}</span>}
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
