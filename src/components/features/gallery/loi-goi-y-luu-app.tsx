"use client";

/**
 * Lời mời "Lưu ra màn hình chính" — trang bộ ảnh, trang gia đình `/k`, màn
 * người được mời (ông bà).
 *
 * OWNER: DEV-FE. Lịch sử: BB-241 (thay nút biểu tượng) → BB-278/281 (chip trong
 * dòng chảy trang, KHÔNG `fixed` — thẻ nổi ở đáy từng đè thanh chọn/chốt) →
 * BB-289 (khách đã có tim từ trước phải thấy ngay) → BB-378.
 *
 * BB-378 — anh (Bản yêu cầu, P1): "nếu không phải người thiết kế thì không biết
 * nó để làm gì — cần nó giống như gợi ý cho khách biết". Hai thay đổi:
 *  1. NÓI LỢI ÍCH trước: "Mở ảnh của bé chỉ bằng một chạm" + "lần sau ba mẹ
 *     không phải tìm lại tin nhắn ạ", rồi mới tới nút (Lưu ngay một chạm nếu
 *     trình duyệt cho, không thì "Xem cách lưu" mở tấm hướng dẫn đúng máy).
 *  2. HIỆN ĐÚNG LÚC — luật ở `src/lib/utils/luu-app-dung-luc.ts`: lần mở thứ 2,
 *     hoặc đã có tim từ trước, hoặc trong phiên đã xem/chọn vài tấm. Bỏ qua được,
 *     nhớ đã bỏ qua (NGAY_AN ngày); không bao giờ hiện khi đã chạy dạng app.
 *
 * Vẫn nằm trong DÒNG CHẢY trang (không `fixed`) — đúng bài học BB-278.
 */

import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { vi } from "@/i18n";
import { giuA, giuCuoi } from "@/lib/utils/giu-a";
import {
  KHOA_DA_AN,
  KHOA_PHIEN,
  KHOA_SO_LAN_MO,
  dangChayNhuApp,
  nenHienGoiYLuuApp,
} from "@/lib/utils/luu-app-dung-luc";
import { useCaiApp } from "@/components/features/gallery/use-cai-app";

const L = vi.gallery.luuApp;

/** Đọc/ghi bộ nhớ trình duyệt bọc try/catch — chế độ ẩn danh/quota đầy không được làm vỡ màn khách. */
function doc(kho: "local" | "session", khoa: string): string | null {
  try {
    return (kho === "local" ? window.localStorage : window.sessionStorage).getItem(khoa);
  } catch {
    return null;
  }
}
function ghi(kho: "local" | "session", khoa: string, giaTri: string): void {
  try {
    (kho === "local" ? window.localStorage : window.sessionStorage).setItem(khoa, giaTri);
  } catch {
    // Bỏ qua — lời mời có thể hiện lại lần sau, không phải lỗi cần chặn màn khách.
  }
}

/** Đếm MỘT lần mở cho mỗi phiên trình duyệt (tải lại/chuyển trang trong phiên không đếm thêm). */
function demLanMo(): number {
  const truoc = Number(doc("local", KHOA_SO_LAN_MO) ?? "0") || 0;
  if (doc("session", KHOA_PHIEN)) return Math.max(1, truoc);
  ghi("session", KHOA_PHIEN, "1");
  ghi("local", KHOA_SO_LAN_MO, String(truoc + 1));
  return truoc + 1;
}

export interface LoiGoiYLuuAppProps {
  /** Số tấm đang có tim (ba mẹ: tấm đã chọn; người được mời: tấm gia đình thích). */
  daChon: number;
  /** Số tấm đã xem lớn trong phiên này. */
  daXem?: number;
  onXemCachLuu: () => void;
  /** BB-358 — link "Mời gia đình" (vai xem): lời nói với gia đình, không với ba mẹ. */
  laNguoiXem?: boolean;
}

export function LoiGoiYLuuApp({ daChon, daXem = 0, onXemCachLuu, laNguoiXem = false }: LoiGoiYLuuAppProps) {
  const [hien, setHien] = useState(false);
  const [daAn, setDaAn] = useState(false);
  const moc = useRef<{ soLanMo: number; daChonLucMo: number; lucDaAn: number | null; laApp: boolean } | null>(null);
  const { coTheCaiNgay, caiNgay } = useCaiApp();

  // Đo một lần lúc dựng: lần mở thứ mấy, tim có sẵn bao nhiêu, đã ẩn khi nào.
  useEffect(() => {
    if (moc.current) return;
    const lucDaAn = Number(doc("local", KHOA_DA_AN));
    moc.current = {
      soLanMo: demLanMo(),
      daChonLucMo: daChon,
      lucDaAn: Number.isFinite(lucDaAn) && lucDaAn > 0 ? lucDaAn : null,
      laApp: dangChayNhuApp(),
    };
    // Chỉ đo lúc dựng — các lần sau tính theo `daChon`/`daXem` ở effect dưới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = moc.current;
    if (!m || daAn || hien) return;
    const tinHieuTrongPhien = Math.max(0, daChon - m.daChonLucMo) + daXem;
    if (
      nenHienGoiYLuuApp({
        dangLaApp: m.laApp,
        lucDaAn: m.lucDaAn,
        bayGio: Date.now(),
        soLanMo: m.soLanMo,
        daChonLucMo: m.daChonLucMo,
        tinHieuTrongPhien,
      })
    ) {
      setHien(true);
    }
  }, [daChon, daXem, daAn, hien]);

  const an = () => {
    setHien(false);
    setDaAn(true);
    ghi("local", KHOA_DA_AN, String(Date.now()));
  };

  const xemCachLuu = () => {
    an();
    onXemCachLuu();
  };

  const luuNgay = async () => {
    const xong = await caiNgay();
    if (xong) an();
  };

  if (!hien) return null;

  const loiIch = giuA(laNguoiXem ? L.loiIchGiaDinh : L.loiIch);

  return (
    <div
      role="status"
      aria-label={L.tieuDe}
      data-testid="goi-y-luu-app"
      className={cn(
        "relative mx-auto flex w-full max-w-[420px] items-start gap-3 rounded-[18px] border border-[#e5dcd2] bg-white py-3 pl-3 pr-9 text-left text-[#2e2a27] shadow-[0_2px_10px_-2px_rgba(46,42,39,0.12)]",
        "animate-in fade-in slide-in-from-top-2 duration-300 motion-reduce:animate-none",
      )}
    >
      {/* Biểu tượng: điện thoại có hạt đậu Bean trên màn hình chính — nói bằng hình "app ở màn hình". */}
      <svg viewBox="0 0 36 44" className="h-11 w-9 shrink-0" aria-hidden="true">
        <rect x="3" y="1.5" width="30" height="41" rx="6" fill="#fbf7f2" stroke="#d9cdbf" strokeWidth="1.5" />
        <rect x="8.5" y="8" width="7" height="7" rx="2" fill="#e5dcd2" />
        <rect x="20.5" y="8" width="7" height="7" rx="2" fill="#e5dcd2" />
        <rect x="8.5" y="19" width="7" height="7" rx="2" fill="#e5dcd2" />
        <rect x="20.5" y="19" width="7" height="7" rx="2" fill="#e8a598" />
        <ellipse cx="24" cy="22.5" rx="1.7" ry="2.3" fill="#fff" transform="rotate(-18 24 22.5)" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-snug">{giuCuoi(L.tieuDe)}</p>
        <p className="mt-0.5 text-pretty text-[12.5px] leading-snug text-[#6f665f]">{loiIch}</p>
        <div className="mt-2 flex items-center gap-3">
          {coTheCaiNgay ? (
            <button
              type="button"
              data-testid="goi-y-luu-ngay"
              onClick={() => void luuNgay()}
              className="h-8 rounded-full bg-[#2e2a27] px-3.5 text-[12.5px] font-medium text-[#fbf7f2] transition active:scale-[0.98]"
            >
              {L.luuNgay}
            </button>
          ) : (
            <button
              type="button"
              data-testid="goi-y-xem-cach-luu"
              onClick={xemCachLuu}
              className="h-8 rounded-full bg-[#2e2a27] px-3.5 text-[12.5px] font-medium text-[#fbf7f2] transition active:scale-[0.98]"
            >
              {L.xemCach}
            </button>
          )}
          <button
            type="button"
            onClick={an}
            className="text-[12.5px] text-[#6f665f] underline-offset-4 hover:underline"
          >
            {L.deSau}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={an}
        // Tên riêng, không "Đóng": trùng tên nút đóng màn xem ảnh lớn.
        aria-label={L.anGoiY}
        className="absolute right-2 top-2 rounded-full p-1 text-[#6f665f] transition hover:bg-[#f3ede6]"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
