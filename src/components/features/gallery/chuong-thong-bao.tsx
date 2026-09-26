"use client";

/**
 * Chuông thông báo — góc phải màn khách.
 *
 * OWNER: Sonnet (BB-261). Chủ studio 26/09/2026: "bật tự động khách chỉ cần
 * chấp nhận và biểu tượng là cái chuông ở góc phải thôi, và thông báo nếu
 * khách chưa đọc cũng sẽ được báo lại và hiện ở đó."
 *
 * ---------------------------------------------------------------------------
 * ĐỨNG RIÊNG — KHÔNG gắn vào gallery-app.tsx
 * ---------------------------------------------------------------------------
 * Một Sonnet khác đang sửa màn khách trong cùng đợt này. Opus gắn component
 * này vào đúng chỗ lúc gộp hai nhánh. Gắn mẫu (props tối giản):
 *
 *   <ChuongThongBao galleryId={galleryId} status={gallery.status} />
 *
 * đặt cạnh phần header/hành động của trang, neo bên phải (`ml-auto` hoặc
 * trong một hàng flex đã có `justify-between`).
 *
 * ---------------------------------------------------------------------------
 * Tự hỏi quyền ở cú chạm ĐẦU TIÊN, không phải lúc tải trang
 * ---------------------------------------------------------------------------
 * Gọi `Notification.requestPermission()` ngay khi trang tải bị trình duyệt
 * chặn hoặc phạt (Chrome tự ẩn hộp thoại nếu trang xin quá sớm). Nên chỉ xin
 * ở `pointerdown` ĐẦU TIÊN của khách trên trang — nghe một lần
 * (`{ once: true }`), và chỉ khi cả bốn điều kiện sau đúng:
 *  1. Có khoá VAPID (studio đã cấu hình).
 *  2. Trình duyệt hỗ trợ Push + Notification.
 *  3. Quyền đang ở trạng thái mặc định (`default`) — chưa hỏi lần nào.
 *  4. Bộ ảnh đã ở trạng thái `submitted` trở đi (đã có việc để báo).
 *
 * Bị từ chối (`denied`) thì không hỏi lại nữa — trình duyệt cũng không cho
 * hỏi lại — nhưng chuông vẫn chạy: khách thấy thông báo khi TỰ mở app, chỉ là
 * không nhận được đẩy tức thì.
 *
 * ---------------------------------------------------------------------------
 * iPhone chưa "Thêm ra màn hình chính"
 * ---------------------------------------------------------------------------
 * iOS Safari không cấp Web Push cho tab trình duyệt thường — không hỏi quyền
 * ở ca này (hỏi cũng vô ích, có thể còn gây hiểu lầm là đã bật). Thay vào đó
 * hiện một dòng gợi ý ngay trong bảng chuông.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { isSubmittedOrLater } from "@/lib/gallery-status";
import {
  VAPID_PUBLIC_KEY,
  hoTroPush,
  laIphoneChuaCai,
  xinQuyenVaDangKyPush,
} from "@/lib/thong-bao/dung-day";

export interface ChuongThongBaoProps {
  galleryId: string;
  status: string;
  className?: string;
}

interface MucThongBao {
  id: string;
  loai: string;
  tieuDe: string;
  noiDung: string;
  createdAt: string;
  daDoc: boolean;
}

interface PhanHoiHopThu {
  data?: { thongBao: MucThongBao[]; soChuaDoc: number };
}

/** Nhãn thời gian tương đối, tiếng Việt — không cần thư viện ngoài cho vài mốc đơn giản. */
function thoiGianTuongDoi(iso: string): string {
  const moc = new Date(iso).getTime();
  if (Number.isNaN(moc)) return "";
  const giay = Math.max(0, Math.floor((Date.now() - moc) / 1000));
  if (giay < 60) return "Vừa xong";
  const phut = Math.floor(giay / 60);
  if (phut < 60) return `${phut} phút trước`;
  const gio = Math.floor(phut / 60);
  if (gio < 24) return `${gio} giờ trước`;
  const ngay = Math.floor(gio / 24);
  if (ngay < 30) return `${ngay} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

export function ChuongThongBao({ galleryId, status, className }: ChuongThongBaoProps) {
  const [mo, setMo] = useState(false);
  const [dsThongBao, setDsThongBao] = useState<MucThongBao[]>([]);
  const [soChuaDoc, setSoChuaDoc] = useState(0);
  const [dangTai, setDangTai] = useState(false);
  const [goiIosThemManHinh, setGoiIosThemManHinh] = useState(false);
  const hopRef = useRef<HTMLDivElement>(null);

  const taiHopThu = useCallback(async () => {
    setDangTai(true);
    try {
      const res = await fetch("/api/g/thong-bao-khach", { credentials: "same-origin" });
      if (!res.ok) return;
      const json = (await res.json()) as PhanHoiHopThu;
      if (!json.data) return;
      setDsThongBao(json.data.thongBao);
      setSoChuaDoc(json.data.soChuaDoc);
    } catch {
      // Mạng chập chờn — chuông vẫn hiện, chỉ là chưa cập nhật số mới nhất.
    } finally {
      setDangTai(false);
    }
  }, []);

  // Tải lần đầu, lúc tab mở lại, và khi service worker báo có push mới
  // (public/sw.js gửi `postMessage({ type: "BB_PUSH_NHAN" })` sau khi hiện
  // thông báo — xem ghi chú trong sw.js).
  useEffect(() => {
    void taiHopThu();
    setGoiIosThemManHinh(laIphoneChuaCai());

    const khiHienLai = () => {
      if (document.visibilityState === "visible") void taiHopThu();
    };
    document.addEventListener("visibilitychange", khiHienLai);

    const khiCoTinSw = (event: MessageEvent) => {
      if (event.data && event.data.type === "BB_PUSH_NHAN") void taiHopThu();
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", khiCoTinSw);
    }

    return () => {
      document.removeEventListener("visibilitychange", khiHienLai);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", khiCoTinSw);
      }
    };
  }, [taiHopThu]);

  // Tự hỏi quyền ở cú chạm đầu tiên trên trang — xem ghi chú đầu file.
  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || !hoTroPush()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    if (!isSubmittedOrLater(status)) return;
    if (laIphoneChuaCai()) return;

    const khiCham = () => {
      void xinQuyenVaDangKyPush(galleryId);
    };
    document.addEventListener("pointerdown", khiCham, { once: true });
    return () => document.removeEventListener("pointerdown", khiCham);
  }, [galleryId, status]);

  // Bấm ra ngoài thì đóng bảng.
  useEffect(() => {
    if (!mo) return;
    const khiBamNgoai = (e: MouseEvent) => {
      if (hopRef.current && !hopRef.current.contains(e.target as Node)) setMo(false);
    };
    document.addEventListener("mousedown", khiBamNgoai);
    return () => document.removeEventListener("mousedown", khiBamNgoai);
  }, [mo]);

  const moBang = useCallback(async () => {
    const dangMo = !mo;
    setMo(dangMo);
    if (!dangMo) return;

    // Mở ra là đánh dấu đã đọc — cập nhật lạc quan trước, rồi gọi API.
    if (soChuaDoc > 0) {
      setDsThongBao((ds) => ds.map((d) => ({ ...d, daDoc: true })));
      setSoChuaDoc(0);
      try {
        await fetch("/api/g/thong-bao-khach", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ tatCa: true }),
        });
      } catch {
        // Đánh dấu hỏng thì lượt mở sau thử lại — không phải lỗi khách thấy được.
      }
    }
  }, [mo, soChuaDoc]);

  return (
    <div ref={hopRef} className={`relative inline-block ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => void moBang()}
        aria-label={soChuaDoc > 0 ? `Thông báo, ${soChuaDoc} chưa đọc` : "Thông báo"}
        aria-expanded={mo}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--bb-border)] bg-[var(--bb-surface)] text-[var(--bb-fg)] transition-colors hover:bg-[var(--bb-surface-2)]"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {soChuaDoc > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C4645A] px-1 text-[10px] font-semibold leading-none text-white"
          >
            {soChuaDoc > 9 ? "9+" : soChuaDoc}
          </span>
        )}
      </button>

      {mo && (
        <div
          role="dialog"
          aria-label="Danh sách thông báo"
          className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-[20px] border-t border-[var(--bb-border)] bg-[var(--bb-surface)] p-4 shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-96 sm:w-80 sm:rounded-2xl sm:border sm:p-3"
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[var(--bb-border)] sm:hidden" />

          {goiIosThemManHinh && (
            <p className="mb-3 rounded-lg bg-[var(--bb-surface-2)] p-2 text-xs text-muted-foreground">
              Thêm app ra màn hình chính để nhận thông báo ngay khi có tin mới.
            </p>
          )}

          {dsThongBao.length === 0 ? (
            <div className="flex flex-col items-center py-4">
              {/* Tranh banana BB-262 "chuông trống" — hộp rỗng có tranh đỡ trơ
                  hơn một dòng chữ xám. */}
              {!dangTai && (
                <img
                  src="/minh-hoa/chuong-trong-320.webp"
                  srcSet="/minh-hoa/chuong-trong-320.webp 320w, /minh-hoa/chuong-trong-640.webp 640w"
                  sizes="128px"
                  alt=""
                  width={128}
                  height={128}
                  className="h-32 w-32 rounded-lg object-cover"
                />
              )}
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {dangTai ? "Đang tải…" : "Chưa có thông báo"}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {dsThongBao.map((tb) => (
                <li
                  key={tb.id}
                  className="rounded-lg px-2 py-2 hover:bg-[var(--bb-surface-2)]"
                >
                  <p className={`text-sm ${tb.daDoc ? "font-normal" : "font-semibold"} text-[var(--bb-fg)]`}>
                    {tb.tieuDe}
                  </p>
                  <p className="text-xs text-muted-foreground">{tb.noiDung}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {thoiGianTuongDoi(tb.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
