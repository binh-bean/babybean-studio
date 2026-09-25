/**
 * Service worker của màn khách — BB-246: thông báo đẩy (Web Push).
 *
 * OWNER: Sonnet (BB-246). Chưa có service worker nào trước đây (soát lúc làm
 * BB-246: BB-213 chỉ dựng `beforeinstallprompt` + tấm hướng dẫn, không đăng ký
 * SW). Tệp này chỉ làm ĐÚNG hai việc thông báo đẩy cần — không cache tài
 * nguyên, không làm app "offline-first": thêm việc đó sau này thì sửa ở đây,
 * không cần tệp riêng.
 *
 * ---------------------------------------------------------------------------
 * Vì sao KHÔNG gửi link khách qua payload đẩy
 * ---------------------------------------------------------------------------
 * Mã link khách là BÍ MẬT — máy chủ chỉ giữ bản BĂM (share_links.token_hash)
 * hoặc bản MÃ HOÁ ở máy chủ (0070, share_link_ma), không bao giờ gửi lại mã
 * gốc qua một kênh khác. Payload đẩy đi qua hạ tầng của bên thứ ba
 * (FCM/APNs/Mozilla) — gửi link trong đó là để lộ đường vào thẳng ảnh của một
 * đứa bé cho một bên không cần biết nó.
 *
 * Thay vào đó: lúc khách bật thông báo (bat-thong-bao.tsx), trang gửi
 * `{ galleryId, url: location.pathname }` cho SW này qua `postMessage`. SW lưu
 * cặp đó vào IndexedDB TRÊN MÁY của khách. Thông báo đẩy chỉ mang `galleryId`
 * — lúc bấm vào thông báo, SW tra lại URL theo `galleryId` trong IndexedDB
 * của chính máy đó.
 */

const DB_NAME = "bb-thong-bao";
const DB_VERSION = 1;
const STORE = "gallery-url";

function moDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "galleryId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function luuUrlBoAnh(galleryId, url) {
  const db = await moDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ galleryId, url });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function docUrlBoAnh(galleryId) {
  const db = await moDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(galleryId);
    req.onsuccess = () => resolve(req.result ? req.result.url : null);
    req.onerror = () => reject(req.error);
  });
}

// Kích hoạt ngay, không đợi mọi tab cũ đóng — SW này không đổi hành vi cache
// của trang nào cả nên không có gì để "xung đột phiên bản" phải chờ.
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "BB_GALLERY_URL" && data.galleryId && data.url) {
    event.waitUntil(luuUrlBoAnh(data.galleryId, data.url));
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return; // Payload không phải JSON hợp lệ — không có gì hiện được, bỏ qua.
  }

  const tieuDe = payload.tieuDe || "BabyBean Studio";
  const noiDung = payload.noiDung || "";
  const galleryId = payload.galleryId || "";

  event.waitUntil(
    self.registration.showNotification(tieuDe, {
      body: noiDung,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { galleryId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const galleryId = event.notification.data && event.notification.data.galleryId;

  event.waitUntil(
    (async () => {
      const url = galleryId ? await docUrlBoAnh(galleryId) : null;
      const target = url || "/";

      // Ưu tiên focus tab đang mở đúng bộ ảnh thay vì mở tab mới — khách đã
      // có sẵn một tab với bộ ảnh này thì không cần thêm một tab trùng.
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if (client.url.includes(target) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    })(),
  );
});
