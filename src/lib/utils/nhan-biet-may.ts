/**
 * Nhận máy/trình duyệt của khách từ chuỗi User-Agent, để hướng dẫn ĐÚNG cách
 * thêm app ra màn hình chính cho từng loại (BB-213).
 *
 * OWNER: Sonnet (BB-213). Hàm THUẦN, không đụng `window`/`navigator` — nơi gọi
 * (huong-dan-them-man-hinh.tsx) tự đọc `navigator.userAgent` rồi truyền vào,
 * để tách phần "đọc trình duyệt" khỏi phần "đoán loại máy", phép thử canh
 * bằng chuỗi User-Agent thật không cần giả lập DOM (xem
 * tests/unit/nhan-biet-may.test.ts).
 *
 * Thứ tự kiểm QUAN TRỌNG: Zalo/Facebook phải kiểm TRƯỚC iOS/Android, vì
 * WebView trong app của chúng vẫn mang đủ dấu hiệu "iPhone"/"Android"/
 * "Safari"/"Chrome" trong UA — kiểm sai thứ tự sẽ đưa hướng dẫn "chạm biểu
 * tượng Chia sẻ" cho một trình duyệt không có nút Chia sẻ đó.
 */

export type LoaiThietBi =
  | "ios-safari"
  | "ios-khac"
  | "android-chrome"
  | "samsung-internet"
  | "zalo-app"
  | "facebook-app"
  | "may-tinh"
  | "khac";

export interface KetQuaNhanBietMay {
  loai: LoaiThietBi;
  /** Trình duyệt trong app (Zalo/Facebook) — không có API cài PWA, dù ở iOS hay Android. */
  laTrinhDuyetTrongApp: boolean;
}

export function nhanBietMay(userAgent: string): KetQuaNhanBietMay {
  const ua = userAgent || "";

  const laIOS = /iPad|iPhone|iPod/.test(ua) && !/Windows/.test(ua);
  const laAndroid = /Android/.test(ua);
  // Zalo và Facebook đều chèn thẻ riêng vào UA của WebView (Zalo/x.x.x,
  // FBAN/FBAV/FB_IAB/FBIOS) — đo trên vài chuỗi UA thật ngày 24/09/2026.
  const laZalo = /Zalo/i.test(ua);
  const laFacebook = /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua);
  const laSamsung = /SamsungBrowser/i.test(ua);
  // CriOS/FxiOS/EdgiOS/OPiOS = Chrome/Firefox/Edge/Opera trên iOS — engine vẫn
  // là WebKit của Apple nên hướng dẫn "Chia sẻ → Thêm vào MH chính" vẫn đúng,
  // nhưng không phải Safari nên KHÔNG gộp chung để tránh nói sai tên nút.
  const laSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
  const laChrome = /Chrome/.test(ua) && !/Edg\/|OPR\/|SamsungBrowser/.test(ua);

  if (laZalo) return { loai: "zalo-app", laTrinhDuyetTrongApp: true };
  if (laFacebook) return { loai: "facebook-app", laTrinhDuyetTrongApp: true };

  if (laIOS) {
    return {
      loai: laSafari ? "ios-safari" : "ios-khac",
      laTrinhDuyetTrongApp: false,
    };
  }

  if (laAndroid) {
    if (laSamsung) return { loai: "samsung-internet", laTrinhDuyetTrongApp: false };
    if (laChrome) return { loai: "android-chrome", laTrinhDuyetTrongApp: false };
    return { loai: "khac", laTrinhDuyetTrongApp: false };
  }

  if (laChrome || /Edg\//.test(ua)) return { loai: "may-tinh", laTrinhDuyetTrongApp: false };

  return { loai: "khac", laTrinhDuyetTrongApp: false };
}
