"use client";

/**
 * Nút "Bật thông báo" — ba mẹ bấm một lần, rồi nhận tin khi ảnh đã chỉnh xong,
 * mời duyệt (bộ ảnh sang `awaiting_approval`), không cần mở lại link để biết.
 *
 * OWNER: Sonnet (BB-246). Gửi thật ở src/lib/thong-bao/gui-day.ts, đăng ký ở
 * src/app/api/g/thong-bao/route.ts, service worker ở public/sw.js.
 *
 * ---------------------------------------------------------------------------
 * Chỉ hiện khi CHẮC CHẮN dùng được
 * ---------------------------------------------------------------------------
 * Năm điều kiện, thiếu một là ẩn hẳn (không phải hiện rồi báo lỗi khi bấm):
 *  1. Có khoá `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — studio chưa sinh khoá thì chưa
 *     có gì để đăng ký.
 *  2. Bộ ảnh đã ở trạng thái `submitted` trở đi — bộ ảnh còn đang chọn ảnh thì
 *     chưa có gì để "chờ thông báo".
 *  3. Trình duyệt có `PushManager` + `Notification` (Firefox cũ, một số
 *     WebView trong app không có).
 *  4. Quyền thông báo chưa bị TỪ CHỐI hẳn — từ chối rồi thì trình duyệt không
 *     cho hỏi lại, hiện nút mà bấm luôn im lặng là hứa sai.
 *  5. KHÔNG phải iPhone đang mở bằng trình duyệt (chưa "Thêm ra màn hình
 *     chính"): iOS Safari chỉ cấp Web Push cho app đã cài standalone, dù các
 *     API kể trên có vẻ tồn tại. Ca này thay bằng lời gợi ý thêm ra màn hình
 *     chính, dùng lại tấm hướng dẫn có sẵn (huong-dan-them-man-hinh.tsx, gắn ở
 *     gallery-app.tsx) qua prop `onMoHuongDanLuuApp`.
 *
 * ---------------------------------------------------------------------------
 * Đăng ký service worker ở đây
 * ---------------------------------------------------------------------------
 * BB-213 (lưu app ra màn hình chính) không đăng ký service worker nào —
 * `beforeinstallprompt` không cần nó. Route BB-246 là chỗ ĐẦU TIÊN cần SW
 * (nhận `push`, mở đúng bộ ảnh lúc `notificationclick`), nên component này tự
 * đăng ký `/sw.js` với `scope: "/"` nếu chưa có, thay vì giả định đã có sẵn.
 */

import React, { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { nhanBietMay } from "@/lib/utils/nhan-biet-may";
import { isSubmittedOrLater } from "@/lib/gallery-status";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export interface BatThongBaoProps {
  galleryId: string;
  status: string;
  /** Mở tấm hướng dẫn "Lưu app ra màn hình chính" có sẵn — dùng cho ca iPhone chưa standalone. */
  onMoHuongDanLuuApp: () => void;
}

function hoTroPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window.PushManager !== "undefined" &&
    typeof window.Notification !== "undefined"
  );
}

function dangChayNhuApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * `PushManager.subscribe` cần `BufferSource` chạm thẳng một `ArrayBuffer`
 * (không phải `ArrayBufferLike`), khoá VAPID thì ở dạng base64url. Tạo
 * `ArrayBuffer` tường minh rồi bọc `Uint8Array` lên trên — `new
 * Uint8Array(length)` một mình vẫn khớp kiểu `Uint8Array<ArrayBufferLike>`,
 * thứ TypeScript coi là KHÔNG khớp `BufferSource` (cần `ArrayBuffer` chắc chắn).
 */
function base64UrlSangUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function BatThongBao({ galleryId, status, onMoHuongDanLuuApp }: BatThongBaoProps) {
  const [sanSang, setSanSang] = useState(false);
  const [choPhep, setChoPhep] = useState<NotificationPermission | null>(null);
  const [daBat, setDaBat] = useState(false);
  const [dangXuLy, setDangXuLy] = useState(false);
  const [laIphoneChuaCai, setLaIphoneChuaCai] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || !hoTroPush()) {
      setSanSang(true);
      return;
    }

    const loai = nhanBietMay(window.navigator.userAgent).loai;
    const iosChuaCai = (loai === "ios-safari" || loai === "ios-khac") && !dangChayNhuApp();
    setLaIphoneChuaCai(iosChuaCai);
    setChoPhep(Notification.permission);

    if (iosChuaCai) {
      setSanSang(true);
      return;
    }

    let huy = false;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (reg) => {
        // Báo cho SW biết URL của bộ ảnh đang mở, để `notificationclick` mở
        // đúng chỗ — chỉ gửi được khi SW đã "control" trang này.
        const guiUrl = () => {
          navigator.serviceWorker.controller?.postMessage({
            type: "BB_GALLERY_URL",
            galleryId,
            url: window.location.pathname,
          });
        };
        if (navigator.serviceWorker.controller) {
          guiUrl();
        } else {
          navigator.serviceWorker.addEventListener("controllerchange", guiUrl, { once: true });
        }

        const sub = await reg.pushManager.getSubscription();
        if (!huy) setDaBat(Boolean(sub));
      })
      .catch(() => {
        // Đăng ký SW hỏng (môi trường lạ, quyền bị chặn...) — coi như chưa bật,
        // không chặn phần còn lại của trang.
      })
      .finally(() => {
        if (!huy) setSanSang(true);
      });

    return () => {
      huy = true;
    };
  }, [galleryId]);

  const bat = async () => {
    if (!VAPID_PUBLIC_KEY) return;
    setDangXuLy(true);
    setLoi(null);
    try {
      const perm = await Notification.requestPermission();
      setChoPhep(perm);
      if (perm !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlSangUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON();

      const res = await fetch("/api/g/thong-bao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("Đăng ký thông báo không thành công");

      setDaBat(true);
    } catch {
      setLoi("Không bật được thông báo, ba mẹ thử lại sau nhé.");
    } finally {
      setDangXuLy(false);
    }
  };

  const tat = async () => {
    setDangXuLy(true);
    setLoi(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/g/thong-bao", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setDaBat(false);
    } catch {
      setLoi("Không tắt được, ba mẹ thử lại sau nhé.");
    } finally {
      setDangXuLy(false);
    }
  };

  if (!sanSang || !VAPID_PUBLIC_KEY) return null;
  if (!isSubmittedOrLater(status)) return null;

  if (laIphoneChuaCai) {
    return (
      <button
        type="button"
        onClick={onMoHuongDanLuuApp}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        <BellRing className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Thêm app ra màn hình chính để nhận thông báo khi ảnh chỉnh xong
      </button>
    );
  }

  if (!hoTroPush() || choPhep === "denied") return null;

  if (daBat) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Đã bật thông báo</span>
        <button
          type="button"
          onClick={tat}
          disabled={dangXuLy}
          className="font-medium underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
        >
          Tắt
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={bat}
        disabled={dangXuLy}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        <BellRing className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Bật thông báo để biết ngay khi ảnh chỉnh xong
      </button>
      {loi && <p className="text-[11px] text-destructive">{loi}</p>}
    </div>
  );
}
