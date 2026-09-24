/**
 * BB-213 — nhận máy/trình duyệt từ User-Agent thật, để hướng dẫn đúng cách
 * thêm app ra màn hình chính.
 *
 * Chuỗi User-Agent dưới đây là chuỗi THẬT của từng loại máy/trình duyệt (ghi
 * lại ngày 24/09/2026), không bịa — sai một mảnh (ví dụ thiếu "CriOS" của
 * Chrome trên iPhone) là hàm nhận nhầm thành Safari và chỉ sai bước.
 *
 * Ca quan trọng nhất: Zalo/Facebook trong app PHẢI được nhận ra trước
 * iOS/Android, vì UA của chúng vẫn còn nguyên các dấu hiệu "iPhone" hay
 * "Chrome" — đây là lý do BB-213 tồn tại (link gửi qua Zalo là phổ biến
 * nhất, và trình duyệt trong Zalo không cài PWA được).
 */

import { describe, it, expect } from "vitest";
import { nhanBietMay } from "@/lib/utils/nhan-biet-may";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  zaloIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo/10.9.0 Safari/604.1",
  zaloAndroid:
    "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 Zalo/10.9.0",
  facebookIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.36.109;FBBV/577762233;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/vi_VN;FBOP/5]",
  chromeMayTinh:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

describe("BB-213: nhanBietMay — nhận đúng máy để hướng dẫn đúng bước", () => {
  it("iPhone Safari", () => {
    expect(nhanBietMay(UA.iphoneSafari)).toEqual({
      loai: "ios-safari",
      laTrinhDuyetTrongApp: false,
    });
  });

  it("iPhone Chrome (CriOS) — không phải Safari dù cùng iOS", () => {
    expect(nhanBietMay(UA.iphoneChrome)).toEqual({
      loai: "ios-khac",
      laTrinhDuyetTrongApp: false,
    });
  });

  it("Android Chrome", () => {
    expect(nhanBietMay(UA.androidChrome)).toEqual({
      loai: "android-chrome",
      laTrinhDuyetTrongApp: false,
    });
  });

  it("Samsung Internet — không lẫn vào Android Chrome dù UA cũng có chữ Chrome", () => {
    expect(nhanBietMay(UA.samsungInternet)).toEqual({
      loai: "samsung-internet",
      laTrinhDuyetTrongApp: false,
    });
  });

  it("Zalo trong app trên iOS — không được nhận thành iPhone Safari", () => {
    expect(nhanBietMay(UA.zaloIOS)).toEqual({
      loai: "zalo-app",
      laTrinhDuyetTrongApp: true,
    });
  });

  it("Zalo trong app trên Android — không được nhận thành Android Chrome", () => {
    expect(nhanBietMay(UA.zaloAndroid)).toEqual({
      loai: "zalo-app",
      laTrinhDuyetTrongApp: true,
    });
  });

  it("Facebook trong app trên iOS", () => {
    expect(nhanBietMay(UA.facebookIOS)).toEqual({
      loai: "facebook-app",
      laTrinhDuyetTrongApp: true,
    });
  });

  it("Chrome trên máy tính", () => {
    expect(nhanBietMay(UA.chromeMayTinh)).toEqual({
      loai: "may-tinh",
      laTrinhDuyetTrongApp: false,
    });
  });

  it("chuỗi rỗng/lạ không làm hàm ném lỗi, rơi về 'khac'", () => {
    expect(nhanBietMay("")).toEqual({ loai: "khac", laTrinhDuyetTrongApp: false });
  });

  // KIỂM NGƯỢC: thứ tự kiểm Zalo/Facebook TRƯỚC iOS/Android là lý do task
  // này tồn tại — nếu ai đó đảo lại thứ tự (kiểm iOS trước), Zalo trên iPhone
  // sẽ bị nhận nhầm thành "ios-safari" và lời khuyên "chạm Chia sẻ → Thêm vào
  // MH chính" sẽ không có tác dụng gì trong WebView của Zalo.
  it("kiểm ngược — cố tình kiểm iOS trước Zalo thì ca Zalo/iOS đỏ", () => {
    const nhanBietMaySai = (userAgent: string) => {
      const ua = userAgent || "";
      const laIOS = /iPad|iPhone|iPod/.test(ua) && !/Windows/.test(ua);
      const laZalo = /Zalo/i.test(ua);
      const laSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
      if (laIOS) return laSafari ? "ios-safari" : "ios-khac";
      if (laZalo) return "zalo-app";
      return "khac";
    };
    // Bản sai: iOS được kiểm trước, nên Zalo trên iPhone lọt vào nhánh iOS.
    expect(nhanBietMaySai(UA.zaloIOS)).not.toBe("zalo-app");
    // Bản đúng (hàm thật đang test): Zalo được nhận đúng, không lọt vào iOS.
    expect(nhanBietMay(UA.zaloIOS).loai).toBe("zalo-app");
  });
});
