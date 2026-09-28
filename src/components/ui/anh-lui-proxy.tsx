"use client";

import { useEffect } from "react";

/**
 * BB-314 (lượt gộp Đợt 10) — lưới đỡ CHUNG cho mọi thẻ <img> trỏ vào
 * `/api/img/...` cỡ nhỏ.
 *
 * Từ BB-314, `/api/img` với w<=800 xét quyền xong thì điều hướng 302 thẳng
 * sang lh3.googleusercontent.com. Lưới và màn xem lớn có `onError` riêng để
 * lùi về đường proxy (`&qua=1`) khi lh3 lỗi, nhưng còn khoảng hai mươi chỗ
 * khác (ảnh thu nhỏ quản trị, cửa hàng, chọn bìa album, trình thiết kế bìa…)
 * không có — lh3 lỗi là ô ảnh trắng vĩnh viễn. Thay vì rải `onError` vào
 * từng chỗ (dễ sót chỗ mới), lắng nghe sự kiện `error` ở pha capture trên
 * `document` (sự kiện lỗi của ảnh không nổi bọt, nhưng pha capture vẫn đi
 * qua `document`) và lùi đúng MỘT lần cho mọi ảnh `/api/img/`.
 *
 * `dataset.qua` đánh dấu đã lùi, để lỗi lần hai (proxy cũng hỏng) không lặp.
 */
function themQua(url: string): string {
  if (!url.includes("/api/img/") || /[?&]qua=1\b/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "qua=1";
}

export function AnhLuiProxy() {
  useEffect(() => {
    const khiLoi = (e: Event) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.dataset.qua === "1") return;
      const src = img.getAttribute("src") ?? "";
      if (!src.includes("/api/img/") || /[?&]qua=1\b/.test(src)) return;
      img.dataset.qua = "1";
      const srcSet = img.getAttribute("srcset");
      if (srcSet) {
        img.setAttribute(
          "srcset",
          srcSet
            .split(",")
            .map((phan) => {
              const [url, ...moTa] = phan.trim().split(/\s+/);
              return [themQua(url ?? ""), ...moTa].join(" ");
            })
            .join(", "),
        );
      }
      img.setAttribute("src", themQua(src));
    };
    document.addEventListener("error", khiLoi, true);
    return () => document.removeEventListener("error", khiLoi, true);
  }, []);
  return null;
}
