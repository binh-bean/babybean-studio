"use client";

/**
 * BB-279 — lưới chọn NHIỀU tấm ảnh, mở từ trong cửa hàng.
 *
 * OWNER: DEV-FE. Chủ studio 27/09/2026: "phần chọn ảnh có hai cách một chọn
 * ngay trong lúc chọn ảnh chỉnh hoặc chọn trong trang bán hàng". Đây là ĐƯỜNG
 * THỨ HAI (chọn ngay trong cửa hàng) — đường thứ nhất ("Đặt in tấm này" từ màn
 * xem ảnh lớn) không cần lưới này, vì tấm đã biết sẵn.
 *
 * Mặc định lọc "Đã thả tim" (đúng nghĩa ảnh ba mẹ đang cân nhắc mua), có nút
 * chuyển "Tất cả" cho trường hợp muốn in một tấm chưa thả tim. Ảnh thu nhỏ đi
 * qua `/api/img` như lưới ảnh chính — không tự chế đường dẫn khác.
 *
 * BB-282 — GIAO DIỆN đúng bản vẽ `BB-281/html/cua-hang-chon-anh.html`: tiêu
 * đề giữa serif + nút quay lại "‹", chip lọc dạng viên, lưới 3 cột khoảng hở
 * 4px, ô chọn viền mực 2px + dấu ✓ tròn mực, thanh đáy viên kem mờ nổi trên
 * lưới (không phải footer viền trên full-width như trước).
 */

import React from "react";
import { cn } from "@/components/ui/utils";
import { useBayFocusHopThoai } from "@/lib/utils/bay-focus-hop-thoai";
import { formatSo } from "@/lib/utils/dinh-dang";
import { anhNhoTheoO, thuLaiAnhQuaRoute } from "@/lib/utils/chon-co-anh";

export interface AnhTrongLuoiChon {
  id: string;
  fileName: string;
}

export interface ChonAnhNhieuTamProps {
  mo: boolean;
  onDong: () => void;
  /** Ảnh ba mẹ đã thả tim — lọc mặc định. */
  anhDaThaTim: AnhTrongLuoiChon[];
  /** Toàn bộ ảnh của bộ ảnh — dùng khi bấm "Tất cả". */
  tatCaAnh: AnhTrongLuoiChon[];
  /** Đã chọn sẵn (vd. mở lại sau khi đổi số lượng). */
  daChonSan?: string[];
  dangLuu: boolean;
  onXacNhan: (photoIds: string[]) => void;
  /**
   * BB-339 — tiêu đề riêng (vd "Ảnh cho Gỗ 40×60"); thiếu thì "Chọn ảnh để in".
   */
  tieuDe?: string;
  /**
   * BB-339 — số tấm TỐI ĐA (suất in trong gói: "Gỗ 40×60 ×2" nhận đúng 2 tấm).
   * Đủ rồi mà bấm tấm khác: tối đa 1 thì ĐỔI sang tấm mới; lớn hơn 1 thì
   * không nhận thêm (bỏ bớt một tấm trước). Thiếu = không giới hạn.
   */
  toiDa?: number;
  /** BB-339 — cho phép bấm "Xong" khi chưa chọn tấm nào (bỏ hết ảnh khỏi một suất). */
  choXongKhiTrong?: boolean;
}

export function ChonAnhNhieuTam({
  mo,
  onDong,
  anhDaThaTim,
  tatCaAnh,
  daChonSan,
  dangLuu,
  onXacNhan,
  tieuDe,
  toiDa,
  choXongKhiTrong = false,
}: ChonAnhNhieuTamProps) {
  const [locTatCa, setLocTatCa] = React.useState(anhDaThaTim.length === 0);
  const [daChon, setDaChon] = React.useState<Set<string>>(() => new Set(daChonSan ?? []));
  const hopThoaiRef = React.useRef<HTMLDivElement>(null);

  useBayFocusHopThoai(mo, onDong, hopThoaiRef);

  React.useEffect(() => {
    if (mo) setDaChon(new Set(daChonSan ?? []));
  }, [mo, daChonSan]);

  if (!mo) return null;

  const danhSach = locTatCa ? tatCaAnh : anhDaThaTim;

  const bat = (id: string) => {
    setDaChon((truoc) => {
      const ke = new Set(truoc);
      if (ke.has(id)) {
        ke.delete(id);
        return ke;
      }
      if (toiDa != null && ke.size >= toiDa) {
        // Một suất một tấm: bấm tấm khác là đổi luôn, không bắt bỏ tấm cũ trước.
        if (toiDa === 1) return new Set([id]);
        return truoc;
      }
      ke.add(id);
      return ke;
    });
  };

  return (
    <div
      ref={hopThoaiRef}
      role="dialog"
      aria-modal="true"
      aria-label="Chọn ảnh để đặt in"
      className="pointer-events-auto fixed inset-0 z-[60] flex flex-col bg-background"
    >
      {/* Đầu trang — nút quay lại "‹" bên trái, tiêu đề serif giữa — bản vẽ. */}
      <header className="grid shrink-0 grid-cols-[40px_1fr_40px] items-center border-b border-[var(--bb-border)] px-4 py-3.5">
        <button
          type="button"
          aria-label="Đóng"
          onClick={onDong}
          className="flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-foreground transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2"
        >
          ‹
        </button>
        <h2 className="truncate text-center font-display text-xl font-normal leading-tight text-foreground">
          {tieuDe ?? "Chọn ảnh để in"}
        </h2>
        <span aria-hidden />
      </header>

      <div className="flex shrink-0 justify-center px-5 py-3.5">
        <div className="inline-flex gap-1 rounded-full bg-[var(--bb-surface-2)] p-1">
          <button
            type="button"
            onClick={() => setLocTatCa(false)}
            disabled={anhDaThaTim.length === 0}
            className={cn(
              "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40",
              !locTatCa ? "bg-white text-foreground shadow-sm" : "text-foreground/60",
            )}
          >
            ♡ Đã thả tim · {formatSo(anhDaThaTim.length)}
          </button>
          <button
            type="button"
            onClick={() => setLocTatCa(true)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
              locTatCa ? "bg-white text-foreground shadow-sm" : "text-foreground/60",
            )}
          >
            Tất cả · {formatSo(tatCaAnh.length)}
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-1 pb-24">
        {danhSach.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {locTatCa
              ? "Bộ ảnh chưa có tấm nào."
              : "Ba mẹ thả tim chọn vài tấm trước, hoặc bấm \"Tất cả\"."}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1 px-1 sm:grid-cols-5 lg:grid-cols-6">
            {danhSach.map((a) => {
              const dangChon = daChon.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => bat(a.id)}
                  aria-pressed={dangChon}
                  className={cn(
                    "relative aspect-[3/4] overflow-hidden rounded-[4px] transition-shadow",
                    dangChon && "outline outline-2 -outline-offset-2 outline-[var(--bb-fg)]",
                  )}
                >
                  {/*
                    BB-339 mục 1 — trước đây cứng `?w=200` nên ô ~300px (máy
                    tính) / ~125px × DPR 2–3 (điện thoại) bị kéo giãn, nhìn mờ.
                    `srcSet` 400w/800w + `sizes` đúng bề rộng ô (3/5/6 cột).
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    {...anhNhoTheoO(a.id)}
                    sizes="(min-width: 1024px) 17vw, (min-width: 640px) 20vw, 34vw"
                    alt={a.fileName}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    onError={(e) => thuLaiAnhQuaRoute(e.currentTarget)}
                  />
                  <span
                    className={cn(
                      "absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] text-[12px] font-bold",
                      dangChon
                        ? "border-[var(--bb-fg)] bg-[var(--bb-fg)] text-[var(--bb-bg)]"
                        : "border-white bg-white/35",
                    )}
                  >
                    {dangChon ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Thanh đáy viên kem mờ, nổi trên lưới — cùng ngôn ngữ với thanh chọn
          nổi ngoài trang khách (BB-258, `thanh-chon-dien-thoai.png`). */}
      <footer className="pointer-events-none absolute inset-x-4 bottom-[18px] sm:inset-x-8">
        <div className="pointer-events-auto flex h-[52px] items-center justify-between rounded-full border border-[var(--bb-border)] bg-[rgba(253,251,249,0.92)] pl-5 pr-1.5 shadow-[0_6px_24px_-8px_rgba(46,42,39,0.25)] backdrop-blur-[8px]">
          {/* BB-305 — thanh đếm "Đã chọn N tấm" là nội dung: bỏ font-display, tabular-nums cho số. */}
          <p className="text-[16px] font-medium tabular-nums text-foreground">
            {toiDa != null
              ? `Đã chọn ${formatSo(daChon.size)}/${formatSo(toiDa)} tấm`
              : `Đã chọn ${formatSo(daChon.size)} tấm`}
          </p>
          <button
            type="button"
            disabled={(daChon.size === 0 && !choXongKhiTrong) || dangLuu}
            onClick={() => onXacNhan(Array.from(daChon))}
            className="h-10 shrink-0 rounded-full bg-[var(--bb-fg)] px-6 text-sm font-medium text-[var(--bb-bg)] transition hover:opacity-90 disabled:opacity-40"
          >
            Xong
          </button>
        </div>
      </footer>
    </div>
  );
}
