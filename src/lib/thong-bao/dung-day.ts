/**
 * Đăng ký Web Push của trình duyệt hiện tại — logic dùng chung.
 *
 * OWNER: Sonnet (BB-246, BB-261). Tách ra từ `bat-thong-bao.tsx` (BB-246) để
 * `chuong-thong-bao.tsx` (BB-261) dùng lại đúng một đường đăng ký, thay vì
 * chép lại: hai bản trôi nhau là chuyện đã xảy ra ở nhiều chỗ khác trong dự
 * án này (xem AGENTS.md §5, ví dụ danh sách trạng thái từng nằm ở sáu chỗ).
 *
 * File này CHỈ chạy trong trình duyệt (gọi `navigator`, `window`,
 * `Notification`) — không import vào đây bất cứ gì có `"server-only"`.
 */

import { nhanBietMay } from "@/lib/utils/nhan-biet-may";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function hoTroPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window.PushManager !== "undefined" &&
    typeof window.Notification !== "undefined"
  );
}

export function dangChayNhuApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iPhone mở bằng Safari/trình duyệt khác, CHƯA "Thêm ra màn hình chính". */
export function laIphoneChuaCai(): boolean {
  if (typeof window === "undefined") return false;
  const loai = nhanBietMay(window.navigator.userAgent).loai;
  return (loai === "ios-safari" || loai === "ios-khac") && !dangChayNhuApp();
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

/**
 * Đăng ký service worker `/sw.js` (nếu chưa có) và báo cho nó biết URL của bộ
 * ảnh đang mở — để `notificationclick` mở đúng chỗ (xem public/sw.js).
 */
export async function dangKyServiceWorker(galleryId: string): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

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

  return reg;
}

/** Đăng ký đang có sẵn cho trang này, nếu có. */
export async function docDangKyHienCo(): Promise<PushSubscription | null> {
  if (!hoTroPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/**
 * Xin quyền thông báo rồi đăng ký Web Push cho `galleryId`. Trả `true` khi
 * đăng ký thành công (quyền `granted` + gửi lên `/api/g/thong-bao` thành
 * công), `false` ở mọi ca còn lại — không ném, gọi nơi nào cũng tự quyết định
 * hiển thị gì khi trả `false`.
 */
export async function xinQuyenVaDangKyPush(galleryId: string): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !hoTroPush()) return false;

  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;

    const reg = await dangKyServiceWorker(galleryId);
    const daSan = await reg.pushManager.getSubscription();
    const sub =
      daSan ??
      (await (await navigator.serviceWorker.ready).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlSangUint8Array(VAPID_PUBLIC_KEY),
      }));
    const json = sub.toJSON();

    const res = await fetch("/api/g/thong-bao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
