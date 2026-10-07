"use client";

/**
 * Tấm trượt "Lưu ra màn hình chính" — mở từ lời mời ở trang bộ ảnh / trang
 * gia đình / màn người được mời.
 *
 * OWNER: DEV-FE. BB-213 (hướng dẫn theo máy) → BB-378 (anh, Bản yêu cầu P1):
 * "nếu không phải người thiết kế thì không biết nó để làm gì — cần nó giống như
 * gợi ý cho khách biết". Nay đọc theo thứ tự ba mẹ nghĩ:
 *   1. LỢI ÍCH: "Mở ảnh của bé chỉ bằng một chạm" + vì sao (không phải tìm lại
 *      tin nhắn).
 *   2. Trình duyệt cho cài một chạm (`beforeinstallprompt`) → MỘT nút "Lưu ngay".
 *   3. Không thì các bước ĐÚNG MÁY, mỗi bước một hình nhỏ khoanh chỗ cần chạm
 *      (`minh-hoa-luu-app.tsx`, SVG — không ảnh chụp thật). Máy đoán sai thì
 *      đổi được iPhone ↔ Android ngay trên tấm.
 *
 * Zalo/Facebook (trình duyệt trong app) không có "Thêm vào MH chính": bước đầu
 * là "Mở bằng trình duyệt". Nhận biết máy: `src/lib/utils/nhan-biet-may.ts`.
 * Không hiện khi đã chạy dạng app (`dangChayNhuApp`).
 */

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { nhanBietMay, type LoaiThietBi } from "@/lib/utils/nhan-biet-may";
import { dangChayNhuApp } from "@/lib/utils/luu-app-dung-luc";
import { vi } from "@/i18n";
import { giuA, giuCuoi } from "@/lib/utils/giu-a";
import { cn } from "@/components/ui/utils";
import { MinhHoaLuuApp, type LoaiMinhHoa } from "@/components/features/gallery/minh-hoa-luu-app";
import { useCaiApp } from "@/components/features/gallery/use-cai-app";

const L = vi.gallery.luuApp;

export interface HuongDanThemManHinhProps {
  mo: boolean;
  onDong: () => void;
  /** BB-358 — link "Mời gia đình": lời hướng dẫn gọi "gia đình". */
  laNguoiXem?: boolean;
}

export interface BuocLuuApp {
  hinh: LoaiMinhHoa;
  chu: string;
}

/** Nhóm cách lưu — mỗi nhóm một bộ bước; "iphone"/"android" đổi qua lại được. */
export type NhomMay = "iphone" | "iphone-khac" | "android" | "samsung" | "trong-app" | "may-tinh";

export function nhomTheoLoai(loai: LoaiThietBi): NhomMay {
  switch (loai) {
    case "ios-safari":
      return "iphone";
    case "ios-khac":
      return "iphone-khac";
    case "android-chrome":
      return "android";
    case "samsung-internet":
      return "samsung";
    case "zalo-app":
    case "facebook-app":
      return "trong-app";
    case "may-tinh":
      return "may-tinh";
    default:
      // Không nhận ra máy: đa số khách Việt dùng iPhone; đổi sang Android ngay trên tấm.
      return "iphone";
  }
}

export function buocTheoNhom(nhom: NhomMay): BuocLuuApp[] {
  const B = L.buoc;
  switch (nhom) {
    case "iphone":
      return [
        { hinh: "safari-chia-se", chu: B.iphoneChiaSe },
        { hinh: "bang-chia-se", chu: B.iphoneThem },
        { hinh: "man-hinh-chinh", chu: B.iphoneXong },
      ];
    case "iphone-khac":
      return [
        { hinh: "safari-chia-se", chu: B.iphoneChiaSeKhac },
        { hinh: "bang-chia-se", chu: B.iphoneThem },
        { hinh: "man-hinh-chinh", chu: B.iphoneXong },
      ];
    case "android":
      return [
        { hinh: "chrome-menu", chu: B.androidMenu },
        { hinh: "menu-them", chu: B.androidThem },
        { hinh: "man-hinh-chinh", chu: B.androidXong },
      ];
    case "samsung":
      return [
        { hinh: "samsung-menu", chu: B.samsungMenu },
        { hinh: "menu-them", chu: B.samsungThem },
        { hinh: "man-hinh-chinh", chu: B.androidXong },
      ];
    case "trong-app":
      return [
        { hinh: "trong-app-menu", chu: B.trongAppMenu },
        { hinh: "mo-trinh-duyet", chu: B.trongAppMo },
        { hinh: "man-hinh-chinh", chu: B.trongAppTiep },
      ];
    case "may-tinh":
      return [
        { hinh: "may-tinh-cai", chu: B.mayTinhCai },
        { hinh: "man-hinh-chinh", chu: B.mayTinhXong },
      ];
  }
}

/** BB-358 — người được mời: lời nói với "gia đình" thay vì "ba mẹ". */
function choGiaDinh(chu: string): string {
  return chu.replace(/Ba mẹ/g, "Gia đình").replace(/ba mẹ/g, "gia đình");
}

export function HuongDanThemManHinh({ mo, onDong, laNguoiXem = false }: HuongDanThemManHinhProps) {
  const [loai, setLoai] = useState<LoaiThietBi>("khac");
  const [nhomChon, setNhomChon] = useState<NhomMay | null>(null);
  const { coTheCaiNgay, caiNgay } = useCaiApp();

  useEffect(() => {
    setLoai(nhanBietMay(window.navigator.userAgent).loai);
  }, []);

  // Mỗi lần mở lại: về đúng máy đang dùng.
  useEffect(() => {
    if (mo) setNhomChon(null);
  }, [mo]);

  // Esc để đóng, như mọi tấm trượt khác trong màn khách.
  useEffect(() => {
    if (!mo) return;
    const phim = (e: KeyboardEvent) => e.key === "Escape" && onDong();
    document.addEventListener("keydown", phim);
    return () => document.removeEventListener("keydown", phim);
  }, [mo, onDong]);

  if (!mo || dangChayNhuApp()) return null;

  const nhom = nhomChon ?? nhomTheoLoai(loai);
  const doiLoi = (chu: string) => giuA(laNguoiXem ? choGiaDinh(chu) : chu);
  const trongApp = nhom === "trong-app";
  const moTa = trongApp
    ? doiLoi(L.moTrinhDuyet.replace("{app}", loai === "facebook-app" ? "Facebook" : "Zalo"))
    : giuA(laNguoiXem ? L.loiIchGiaDinh : L.loiIch);
  const buoc = buocTheoNhom(nhom).map((b) => ({ ...b, chu: doiLoi(b.chu) }));
  // Đổi máy chỉ có nghĩa giữa hai điện thoại phổ biến; Zalo/máy tính có bước riêng.
  const doiDuoc = nhom === "iphone" || nhom === "iphone-khac" || nhom === "android" || nhom === "samsung";
  const nhomDoi: Array<{ ma: NhomMay; nhan: string }> = [
    { ma: loai === "ios-khac" ? "iphone-khac" : "iphone", nhan: L.may.iphone },
    { ma: loai === "samsung-internet" ? "samsung" : "android", nhan: L.may.android },
  ];
  const laIphone = nhom === "iphone" || nhom === "iphone-khac";

  const luuNgay = async () => {
    const xong = await caiNgay();
    if (xong) onDong();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-[1px] animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Lưu app ra màn hình chính"
    >
      <button type="button" aria-label="Đóng" onClick={onDong} className="absolute inset-0 cursor-default" />

      <div
        data-testid="huong-dan-luu-app"
        data-nhom={nhom}
        className="giao-dien-khach relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#fbf7f2] p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-[#2e2a27] shadow-2xl animate-in slide-in-from-bottom-6 sm:mb-6 sm:rounded-3xl"
      >
        <button
          type="button"
          onClick={onDong}
          aria-label="Đóng"
          className="absolute right-4 top-4 rounded-full p-1.5 text-[#6f665f] transition hover:bg-[#f3ede6]"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 1 — LỢI ÍCH trước. */}
        <h3 className="pr-8 font-display text-[22px] font-normal not-italic leading-tight">{giuCuoi(L.tieuDe)}</h3>
        <p data-testid="huong-dan-luu-app-mo-ta" className="mt-1.5 text-pretty text-[14px] leading-relaxed text-[#6f665f]">
          {moTa}
        </p>

        {/* 2 — cài một chạm khi trình duyệt cho phép. */}
        {coTheCaiNgay && !trongApp && (
          <button
            type="button"
            data-testid="nut-luu-ngay"
            onClick={() => void luuNgay()}
            className="mt-4 h-12 w-full rounded-full bg-[#2e2a27] text-[15px] font-medium text-[#fbf7f2] transition active:scale-[0.98]"
          >
            {L.luuNgay}
          </button>
        )}

        {/* 3 — các bước đúng máy, mỗi bước một hình. */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#6f665f]">
            {L.cachLuuTren}{" "}
            {trongApp ? (loai === "facebook-app" ? "Facebook" : "Zalo") : nhom === "may-tinh" ? L.may.mayTinh : laIphone ? L.may.iphone : L.may.android}
          </p>
          {doiDuoc && (
            <div role="group" aria-label="Chọn loại máy" className="flex rounded-full bg-[#f3ede6] p-0.5 text-[12px]">
              {nhomDoi.map((n) => {
                const dangChon = n.ma === "iphone" || n.ma === "iphone-khac" ? laIphone : !laIphone;
                return (
                  <button
                    key={n.ma}
                    type="button"
                    aria-pressed={dangChon}
                    onClick={() => setNhomChon(n.ma)}
                    className={cn(
                      "h-7 rounded-full px-3 font-medium transition",
                      dangChon ? "bg-white text-[#2e2a27] shadow-sm" : "text-[#6f665f]",
                    )}
                  >
                    {n.nhan}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <ol className="mt-3 space-y-2.5" data-testid="buoc-luu-app">
          {buoc.map((b, i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl border border-[#e5dcd2] bg-white p-2.5 pr-3">
              <MinhHoaLuuApp loai={b.hinh} className="h-[52px] w-[74px] shrink-0" />
              <span className="flex min-w-0 items-start gap-2 text-[14px] leading-snug">
                <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#2e2a27] text-[11px] font-medium text-[#fbf7f2]">
                  {i + 1}
                </span>
                <span className="text-pretty">{b.chu}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onDong}
            className="text-sm text-[#2e2a27] underline underline-offset-4 transition hover:opacity-70"
          >
            {L.daHieu}
          </button>
        </div>
      </div>
    </div>
  );
}
