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
  /**
   * Bảng "tấm này in ra cái gì" — dựng bên ngoài rồi truyền vào, vì nó cần dữ
   * liệu hợp đồng và danh mục giá mà lightbox không có.
   *
   * Nhận HÀM chứ không nhận phần tử dựng sẵn: bảng phụ thuộc vào tấm ĐANG XEM,
   * mà lightbox mới là chỗ biết tấm nào đang xem.
   */
  bangSanPham?: (photo: PhotoPublic) => React.ReactNode;
  /** Ô quảng cáo của studio, chỉ hiện ở màn rộng. */
  banner?: React.ReactNode;
  /**
   * Tấm này đang được dùng cho những sản phẩm nào — "Gỗ 40x60 · trong gói",
   * "Album"… Hiện thành một hàng nhãn ngay trên nút tim, để ba mẹ biết tấm
   * đang xem sẽ in ra cái gì mà không phải mở bảng sản phẩm.
   */
  dungCho?: (photo: PhotoPublic) => string[];
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
  bangSanPham,
  banner,
  dungCho,
}: PhotoLightboxProps) {
  /**
   * Tấm trượt từ dưới lên trên điện thoại: bảng sản phẩm hoặc ô ghi chú.
   *
   * Bản cũ đặt cả hai thẳng dưới tấm ảnh (bảng cao tới 38% màn hình, cộng ô
   * ghi chú) — ảnh bị ép còn hơn nửa màn. Nay chúng chỉ mở ra khi ba mẹ bấm,
   * và tấm ảnh được trọn chiều cao.
   */
  const [tamMo, setTamMo] = useState<null | "san-pham" | "ghi-chu">(null);
  /** Đổi giá trị mỗi lần tim bật lên — làm khoá cho hiệu ứng chạy lại. */
  const [timBat, setTimBat] = useState(0);
  const chamTruocRef = useRef(0);
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
        if (tamMo) setTamMo(null);
        else onClose();
      } else if (tamMo) {
        // Đang gõ ghi chú thì mũi tên là để di con trỏ chữ, không phải để lật ảnh.
        return;
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
  }, [goNext, goPrev, onClose, tamMo]);

  // Hỗ trợ Touch Swipe mượt mà trên thiết bị di động
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  /** Ngón tay có trượt đi không — trượt là lật ảnh, không phải chạm. */
  const daDiChuyenRef = useRef(false);

  /**
   * Chạm hai lần vào ảnh = thả tim — cử chỉ ba mẹ đã quen từ Instagram, và là
   * cách chọn ảnh bằng MỘT tay khi tay kia đang bế con.
   *
   * Chỉ CHỌN, không bao giờ BỎ chọn: chạm hai lần nhầm vào tấm đã chọn mà nó
   * mất tim thì ba mẹ không biết vì sao.
   */
  const thaTimNhanh = () => {
    const anh = photos[currentIndex];
    if (!anh || isLocked || mutatingIds.has(anh.id)) return;
    setTimBat((n) => n + 1);
    if (anh.mark !== "selected") onToggleHeart(anh);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
      daDiChuyenRef.current = false;
      setSwipeOffset(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touchStartRef.current || !touch) return;
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) daDiChuyenRef.current = true;

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

    if (!daDiChuyenRef.current) {
      const bayGio = Date.now();
      if (bayGio - chamTruocRef.current < 300) {
        chamTruocRef.current = 0;
        thaTimNhanh();
      } else {
        chamTruocRef.current = bayGio;
      }
      return;
    }

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
  const nhanDungCho = dungCho?.(currentPhoto) ?? [];

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
      {/* THANH TRÊN — chỉ còn thứ tự ảnh, tải về, đóng. */}
      {/* ------------------------------------------------------------------
          Tim đã rời góc trên xuống ĐÁY màn hình (chủ studio duyệt 23/09/2026).

          Góc trên bên phải là chỗ xa ngón cái nhất khi cầm điện thoại một tay —
          mà thả tim là việc ba mẹ làm nhiều nhất ở màn này. Tên file cũng rời
          khỏi đây: nó là di chứng của thời chọn ảnh qua Zalo.
      */}
      <header className="relative z-20 flex shrink-0 items-center justify-between px-3 py-2.5 sm:px-4">
        <span className="px-2 text-[13px] tabular-nums text-white/75">
          {currentIndex + 1} / {total}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          {onTaiAnh && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTaiAnh(currentPhoto);
              }}
              aria-label={vi.gallery.downloadThis}
              title={vi.gallery.downloadThis}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 active:scale-90 touch-manipulation focus:outline-hidden"
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v12" />
                <path d="M7 11l5 5 5-5" />
                <path d="M4 20h16" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label={vi.common.close}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 active:scale-95 touch-manipulation focus:outline-hidden"
          >
            <X className="h-6 w-6" strokeWidth={1.8} />
          </button>
        </div>
      </header>

      {/*
        BỐ CỤC BA CỘT TỪ `lg`: quảng cáo — ảnh — bảng sản phẩm.

        Chủ studio 22/09/2026 chỉ vào ảnh chụp màn hình: hai bên tấm ảnh đang
        trống trơn trên máy tính, mà đó chính là chỗ nên hỏi "tấm này in ra cái
        gì". Dưới `lg` thì không chia cột — điện thoại chỉ đủ chỗ cho tấm ảnh,
        bảng sản phẩm rơi xuống dưới ô ghi chú.
      */}
      <div className="relative flex min-h-0 flex-1 w-full">
        {banner && (
          <aside className="hidden w-56 shrink-0 items-center justify-center p-3 xl:flex">
            {banner}
          </aside>
        )}

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
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (isCurrent) thaTimNhanh();
                }}
              />
            </div>
          );
        })}

        {/* Tim bật lên giữa ảnh khi chạm hai lần. */}
        {timBat > 0 && (
          <div
            key={timBat}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
          >
            <Heart className="h-24 w-24 fill-[#c4645a] text-[#c4645a] drop-shadow-2xl motion-safe:animate-[tim-bat_.9s_ease-out_forwards] opacity-0" />
          </div>
        )}

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

        {/* Bảng "tấm này in ra cái gì" — cột phải trên máy tính. */}
        {(bangSanPham || onLuuGhiChu) && currentPhoto && (
          <aside
            className="hidden w-72 shrink-0 space-y-4 overflow-y-auto border-l border-white/10 bg-black/30 p-4 lg:block"
            onClick={(e) => e.stopPropagation()}
          >
            {bangSanPham?.(currentPhoto)}

            {onLuuGhiChu && (
              <div>
                <label
                  htmlFor="ghi-chu-anh-ben-phai"
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-white/50"
                >
                  Ghi chú cho thợ chỉnh ảnh
                </label>
                <textarea
                  id="ghi-chu-anh-ben-phai"
                  value={ghiChu}
                  onChange={(e) => setGhiChu(e.target.value)}
                  onBlur={luuGhiChu}
                  disabled={isLocked || dangLuuGhiChu || !isCurrentSelected}
                  rows={3}
                  maxLength={500}
                  placeholder={
                    isLocked
                      ? vi.gallery.noteLocked
                      : !isCurrentSelected
                        ? vi.gallery.noteNeedsSelect
                        : vi.gallery.noteHint
                  }
                  className="w-full resize-none rounded-xl bg-white/10 px-3 py-2 text-xs text-white outline-hidden ring-1 ring-white/15 placeholder:text-white/45 focus:ring-white/40 disabled:opacity-50"
                />
                <div className="mt-1 h-4 text-[11px]" aria-live="polite">
                  {ketQuaLuu === "ok" && (
                    <span className="text-emerald-300">{vi.gallery.noteSaved}</span>
                  )}
                  {ketQuaLuu === "loi" && (
                    <span className="text-amber-300">{vi.gallery.noteSaveFailed}</span>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ------------------------------------------------------------------
          THANH ĐÁY — nút tim to, ngay dưới ngón cái.
          ------------------------------------------------------------------
          Chủ studio duyệt 23/09/2026. Hàng nhãn phía trên nói tấm này đang
          dùng cho sản phẩm nào; hai nút hai bên mở tấm trượt (chỉ trên điện
          thoại — máy tính đã có cột phải).

          Thanh này KHÔNG phủ lên ảnh: nó là một hàng riêng dưới tấm ảnh, nên
          chân ảnh (thường là chân bé) không bị che — đúng điều chủ studio đã
          chốt ngày 17/09 khi bỏ hai nút to đè lên đáy ảnh.
      */}
      <footer
        className="relative z-20 shrink-0 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        {nhanDungCho.length > 0 && (
          <div className="mx-auto mb-2.5 flex max-w-md flex-wrap justify-center gap-1.5">
            {nhanDungCho.map((n) => (
              <span
                key={n}
                className="rounded-full border border-[#9db08b]/50 bg-[#6c7a5f]/30 px-3 py-1 text-[12px] text-white/90"
              >
                ✓ {n}
              </span>
            ))}
          </div>
        )}

        <div className="mx-auto grid max-w-md grid-cols-[1fr_auto_1fr] items-center">
          <div className="flex justify-center lg:invisible">
            {onLuuGhiChu && (
              <button
                type="button"
                onClick={() => setTamMo("ghi-chu")}
                className="flex flex-col items-center gap-1 px-3 py-1 text-[11.5px] text-white/75 transition hover:text-white"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M4 5h16v11H8l-4 4z" />
                </svg>
                {currentPhoto.retouchNote ? "Đã ghi chú" : "Ghi chú"}
              </button>
            )}
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              disabled={isLocked || isMutating}
              onClick={() => onToggleHeart(currentPhoto)}
              aria-label={isCurrentSelected ? vi.gallery.deselect : vi.gallery.select}
              aria-pressed={isCurrentSelected}
              className={cn(
                "grid h-16 w-16 place-items-center rounded-full transition-all active:scale-90 touch-manipulation focus:outline-hidden disabled:opacity-40",
                isCurrentSelected
                  ? "bg-[#c4645a] text-white shadow-[0_10px_26px_-6px_rgba(196,100,90,.65)]"
                  : "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/15",
              )}
            >
              <Heart
                className="h-7 w-7"
                fill={isCurrentSelected ? "currentColor" : "none"}
                strokeWidth={1.8}
              />
            </button>
            {typeof daChon === "number" && (
              <span
                className={cn(
                  "text-[11.5px] tabular-nums",
                  hanMuc != null && daChon > hanMuc ? "text-[#e0b25c]" : "text-white/60",
                )}
                title={vi.gallery.quotaInline}
              >
                {daChon}
                {hanMuc != null ? ` / ${hanMuc}` : ""} tấm
              </span>
            )}
          </div>

          <div className="flex justify-center lg:invisible">
            {bangSanPham && (
              <button
                type="button"
                onClick={() => setTamMo("san-pham")}
                className="flex flex-col items-center gap-1 px-3 py-1 text-[11.5px] text-white/75 transition hover:text-white"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <rect x="4" y="3" width="16" height="18" rx="1.5" />
                  <rect x="7.5" y="6.5" width="9" height="8" />
                </svg>
                In ảnh này
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* ------------------------------------------------------------------
          TẤM TRƯỢT (điện thoại) — bảng sản phẩm hoặc ô ghi chú.
          ------------------------------------------------------------------
          Gốc của màn xem lớn chặn mọi cử chỉ chạm (`touch-none`) để vuốt lật
          ảnh không làm trang nhảy. Tấm trượt cần cuộn được, nên mở lại cử chỉ
          cuộn dọc riêng cho nó (`touch-pan-y`).
      */}
      {tamMo && (
        <div
          className="fixed inset-0 z-40 flex flex-col justify-end bg-black/55 lg:hidden"
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) {
              if (tamMo === "ghi-chu") void luuGhiChu();
              setTamMo(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-label={tamMo === "san-pham" ? "In ảnh này" : "Ghi chú cho thợ chỉnh ảnh"}
            className="max-h-[75vh] touch-pan-y overflow-y-auto rounded-t-[28px] bg-[#231e1a] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 text-white shadow-2xl animate-in slide-in-from-bottom-8"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/25" aria-hidden="true" />

            {tamMo === "san-pham" && bangSanPham?.(currentPhoto)}

            {tamMo === "ghi-chu" && onLuuGhiChu && (
              <div>
                <label htmlFor="ghi-chu-anh" className="mb-2 block font-display text-lg">
                  Ghi chú cho thợ chỉnh ảnh
                </label>
                <textarea
                  id="ghi-chu-anh"
                  value={ghiChu}
                  onChange={(e) => setGhiChu(e.target.value)}
                  onBlur={luuGhiChu}
                  disabled={isLocked || dangLuuGhiChu || !isCurrentSelected}
                  rows={4}
                  maxLength={500}
                  placeholder={
                    isLocked
                      ? vi.gallery.noteLocked
                      : !isCurrentSelected
                        ? vi.gallery.noteNeedsSelect
                        : vi.gallery.noteHint
                  }
                  className="w-full resize-none rounded-2xl bg-white/10 px-4 py-3 text-[15px] text-white outline-hidden ring-1 ring-white/15 placeholder:text-white/45 focus:ring-white/40 disabled:opacity-50"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs" aria-live="polite">
                    {ketQuaLuu === "ok" && <span className="text-emerald-300">{vi.gallery.noteSaved}</span>}
                    {ketQuaLuu === "loi" && <span className="text-amber-300">{vi.gallery.noteSaveFailed}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await luuGhiChu();
                      setTamMo(null);
                    }}
                    className="h-11 rounded-full bg-[#fffdf9] px-6 text-sm font-medium text-[#2a2420]"
                  >
                    Xong
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
