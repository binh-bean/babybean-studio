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
}

export function ChonAnhNhieuTam({
  mo,
  onDong,
  anhDaThaTim,
  tatCaAnh,
  daChonSan,
  dangLuu,
  onXacNhan,
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
      if (ke.has(id)) ke.delete(id);
      else ke.add(id);
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
          Chọn ảnh để in
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
            ♡ Đã thả tim · {anhDaThaTim.length}
          </button>
          <button
            type="button"
            onClick={() => setLocTatCa(true)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
              locTatCa ? "bg-white text-foreground shadow-sm" : "text-foreground/60",
            )}
          >
            Tất cả · {tatCaAnh.length}
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/img/${a.id}?w=200`}
                    alt={a.fileName}
                    loading="lazy"
                    className="h-full w-full object-cover"
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
        <div className="pointer-events-auto flex h-[52px] items-center justify-between rounded-full border border-[var(--bb-border)] bg-[rgba(251,247,242,0.92)] pl-5 pr-1.5 shadow-[0_6px_24px_-8px_rgba(46,42,39,0.25)] backdrop-blur-[8px]">
          {/* BB-305 — thanh đếm "Đã chọn N tấm" là nội dung: bỏ font-display, tabular-nums cho số. */}
          <p className="text-[17px] font-medium tabular-nums text-foreground">
            Đã chọn {daChon.size} tấm
          </p>
          <button
            type="button"
            disabled={daChon.size === 0 || dangLuu}
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
