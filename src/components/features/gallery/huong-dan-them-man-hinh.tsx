"use client";

/**
 * Tấm trượt "Lưu app ra màn hình chính" — hướng dẫn ĐÚNG theo máy khách đang
 * dùng, mở từ nút "Lưu app" ở đầu trang khách (gallery-app.tsx).
 *
 * OWNER: Sonnet (BB-213). Chủ studio 24/09/2026: "hướng dẫn khách dán app ra
 * màn hình chính của các loại máy khách đang dùng để thao tác."
 *
 * Phần nhận biết máy tách riêng, hàm thuần: src/lib/utils/nhan-biet-may.ts.
 *
 * TRƯỜNG HỢP GẶP NHIỀU NHẤT: khách mở link từ tin nhắn Zalo, tức là đang ở
 * TRÌNH DUYỆT TRONG APP Zalo (và tương tự với Facebook) — hai nơi này không
 * có API "Thêm vào màn hình chính" (WebView không có), làm đúng theo các bước
 * cài đặt thông thường sẽ không ra kết quả gì. Hướng dẫn riêng cho ca này là
 * "mở bằng Safari/Chrome trước", không phải các bước cài thường.
 *
 * Không hiện khi đã chạy dạng app chuẩn — hai cách nhận biết cùng lúc
 * (display-mode: standalone cho Android/Chrome, navigator.standalone cho
 * iOS) vì mỗi hệ chỉ hỗ trợ đúng một cách.
 */

import React, { useEffect, useState } from "react";
import { X, Share2, MoreVertical, ExternalLink, SquarePlus } from "lucide-react";
import { nhanBietMay, type LoaiThietBi } from "@/lib/utils/nhan-biet-may";
import { vi } from "@/i18n";
import { giuA } from "@/lib/utils/giu-a";

/**
 * BB-361 (người chấm vòng 9, mục 10) — MỘT tiêu đề cho cùng một việc trên mọi
 * điện thoại (iPhone, Android, Samsung): trước đây iPhone "Thêm vào màn hình
 * chính" còn Android "Lưu app ra màn hình chính". Lấy đúng chữ của iOS/Android.
 */
const TIEU_DE_DIEN_THOAI = "Thêm vào màn hình chính";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface HuongDanThemManHinhProps {
  mo: boolean;
  onDong: () => void;
  /** BB-358 — link "Mời gia đình": lời hướng dẫn gọi "gia đình". */
  laNguoiXem?: boolean;
}

function dangChayNhuApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

interface Buoc {
  bieuTuong: React.ReactNode;
  chu: string;
}

interface NoiDungHuongDan {
  tieuDe: string;
  moTa: string;
  buoc: Buoc[];
  nutCaiTrucTiep: boolean;
}

function noiDungTheoLoai(loai: LoaiThietBi): NoiDungHuongDan {
  const buocChiaSe: Buoc = {
    bieuTuong: <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />,
    chu: "Chạm biểu tượng Chia sẻ ở thanh dưới màn hình",
  };
  const buocThemMH: Buoc = {
    bieuTuong: <SquarePlus className="h-4 w-4 shrink-0" aria-hidden="true" />,
    chu: 'Chọn "Thêm vào MH chính"',
  };

  switch (loai) {
    case "zalo-app":
    case "facebook-app":
      return {
        tieuDe: "Mở bằng trình duyệt để lưu app",
        moTa: vi.gallery.loiBean.luuAppMoTrinhDuyet.replace("{app}", loai === "zalo-app" ? "Zalo" : "Facebook"),
        buoc: [
          {
            bieuTuong: <MoreVertical className="h-4 w-4 shrink-0" aria-hidden="true" />,
            chu: "Chạm dấu ba chấm (⋮) hoặc nút chia sẻ ở góc",
          },
          {
            bieuTuong: <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />,
            chu: "Chọn \"Mở bằng trình duyệt\" (Safari hoặc Chrome)",
          },
          {
            bieuTuong: <SquarePlus className="h-4 w-4 shrink-0" aria-hidden="true" />,
            chu: "Mở link trong Safari/Chrome rồi lưu app như hướng dẫn",
          },
        ],
        nutCaiTrucTiep: false,
      };
    case "ios-safari":
      // BB-330 — iPhone Safari: "Thêm vào màn hình chính", câu nói rõ để làm gì,
      // hai bước ngắn có hình (Chia sẻ → Thêm vào MH chính).
      return {
        tieuDe: TIEU_DE_DIEN_THOAI,
        moTa: vi.gallery.loiBean.luuAppMoNhanhAnhBe,
        buoc: [buocChiaSe, buocThemMH],
        nutCaiTrucTiep: false,
      };
    case "ios-khac":
      return {
        tieuDe: TIEU_DE_DIEN_THOAI,
        moTa: vi.gallery.loiBean.luuAppIphone,
        buoc: [buocChiaSe, buocThemMH],
        nutCaiTrucTiep: false,
      };
    case "samsung-internet":
      return {
        tieuDe: TIEU_DE_DIEN_THOAI,
        moTa: vi.gallery.loiBean.luuAppNhuAppRieng,
        buoc: [
          {
            bieuTuong: <MoreVertical className="h-4 w-4 shrink-0" aria-hidden="true" />,
            chu: "Chạm dấu ba chấm (⋮) ở góc dưới màn hình",
          },
          {
            bieuTuong: <SquarePlus className="h-4 w-4 shrink-0" aria-hidden="true" />,
            chu: 'Chọn "Thêm trang vào" → "Màn hình Home"',
          },
        ],
        nutCaiTrucTiep: false,
      };
    case "android-chrome":
      return {
        tieuDe: TIEU_DE_DIEN_THOAI,
        moTa: vi.gallery.loiBean.luuAppNhuAppRieng,
        buoc: [
          {
            bieuTuong: <MoreVertical className="h-4 w-4 shrink-0" aria-hidden="true" />,
            chu: "Chạm dấu ba chấm (⋮) ở góc trên bên phải",
          },
          {
            bieuTuong: <SquarePlus className="h-4 w-4 shrink-0" aria-hidden="true" />,
            chu: 'Chọn "Thêm vào màn hình chính"',
          },
        ],
        // Có sự kiện beforeinstallprompt thì thay khối các bước bằng một nút
        // bấm thẳng — xem HuongDanThemManHinh bên dưới.
        nutCaiTrucTiep: true,
      };
    case "may-tinh":
      return {
        tieuDe: "Lưu app ra máy tính",
        moTa: vi.gallery.loiBean.luuAppMayTinh,
        buoc: [
          {
            bieuTuong: <MoreVertical className="h-4 w-4 shrink-0" aria-hidden="true" />,
            chu: "Chạm biểu tượng cài đặt (⊕) ở cuối thanh địa chỉ",
          },
          {
            bieuTuong: <SquarePlus className="h-4 w-4 shrink-0" aria-hidden="true" />,
            chu: 'Chọn "Cài đặt"',
          },
        ],
        nutCaiTrucTiep: false,
      };
    default:
      return {
        tieuDe: TIEU_DE_DIEN_THOAI,
        moTa: vi.gallery.loiBean.luuAppCanSafari,
        buoc: [],
        nutCaiTrucTiep: false,
      };
  }
}

/** BB-358 — người được mời: lời hướng dẫn nói với "gia đình" thay vì "ba mẹ". */
function choGiaDinh(chu: string): string {
  return chu.replace(/Ba mẹ/g, "Gia đình").replace(/ba mẹ/g, "gia đình");
}

export function HuongDanThemManHinh({ mo, onDong, laNguoiXem = false }: HuongDanThemManHinhProps) {
  const [loai, setLoai] = useState<LoaiThietBi>("khac");
  const [promptCai, setPromptCai] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setLoai(nhanBietMay(window.navigator.userAgent).loai);

    const bat = (e: Event) => {
      e.preventDefault();
      setPromptCai(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", bat);
    return () => window.removeEventListener("beforeinstallprompt", bat);
  }, []);

  // Esc để đóng, như mọi tấm trượt khác trong màn khách.
  useEffect(() => {
    if (!mo) return;
    const phim = (e: KeyboardEvent) => e.key === "Escape" && onDong();
    document.addEventListener("keydown", phim);
    return () => document.removeEventListener("keydown", phim);
  }, [mo, onDong]);

  if (!mo || dangChayNhuApp()) return null;

  const noiDungGoc = noiDungTheoLoai(loai);
  const doiLoi = (chu: string) => giuA(laNguoiXem ? choGiaDinh(chu) : chu);
  // BB-361 (vòng 9, mục 2) — mọi câu của tấm hướng dẫn đi qua `giuA`: Android từng để
  // "…như một app riêng" / "ạ." rơi một chữ xuống dòng riêng.
  const noiDung = {
    ...noiDungGoc,
    tieuDe: giuA(noiDungGoc.tieuDe),
    moTa: noiDungGoc.moTa ? doiLoi(noiDungGoc.moTa) : noiDungGoc.moTa,
    buoc: noiDungGoc.buoc.map((b) => ({ ...b, chu: doiLoi(b.chu) })),
  };

  const caiTrucTiep = async () => {
    if (!promptCai) return;
    await promptCai.prompt();
    await promptCai.userChoice;
    setPromptCai(null);
    onDong();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-[1px] animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Lưu app ra màn hình chính"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onDong}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-foreground shadow-2xl animate-in slide-in-from-bottom-6 sm:mb-6 sm:rounded-3xl">
        <button
          type="button"
          onClick={onDong}
          aria-label="Đóng"
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition hover:bg-surface-2"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="pr-8 font-display text-xl">{noiDung.tieuDe}</h3>
        {noiDung.moTa && (
          <p data-testid="huong-dan-luu-app-mo-ta" className="mt-1.5 text-pretty text-sm text-muted-foreground">{noiDung.moTa}</p>
        )}

        {noiDung.buoc.length > 0 && (
          <ol className="mt-4 space-y-3">
            {noiDung.buoc.map((buoc, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-medium">
                  {i + 1}
                </span>
                <span className="flex items-center gap-2 leading-relaxed">
                  {buoc.bieuTuong}
                  {buoc.chu}
                </span>
              </li>
            ))}
          </ol>
        )}

        {noiDung.nutCaiTrucTiep && promptCai && (
          <button
            type="button"
            onClick={caiTrucTiep}
            className="mt-5 h-11 w-full rounded-full bg-foreground text-sm font-medium text-background transition active:scale-[0.98]"
          >
            Thêm vào màn hình chính
          </button>
        )}

        {/*
          BB-281 — dựng đúng `babybean-assets/BB-281/goi-y-luu-app.png`: nút
          chữ "Đã hiểu" gạch chân, không phải một nút nền đặc — cùng hành
          động đóng như nút × ở góc, chỉ thêm một lối đóng THEO ĐÚNG bản vẽ
          cho ca không có `beforeinstallprompt` (đa số — Zalo/Facebook/iOS
          Safari không có sự kiện này).
        */}
        <div className="mt-5 flex justify-center">
          {/* BB-305 — nút là nội dung, không phải tiêu đề: bỏ font-display. */}
          <button
            type="button"
            onClick={onDong}
            className="text-sm text-foreground underline underline-offset-4 transition hover:opacity-70"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}
