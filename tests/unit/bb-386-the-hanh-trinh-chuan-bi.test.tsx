/**
 * BB-386 — thẻ hành trình ở bước "Duyệt ảnh" nói CÙNG ý với vùng duyệt (BB-384):
 * app chưa có ảnh chỉnh (`khoiVungDuyet` = "dang_chuan_bi") thì tiêu đề thẻ là lời
 * Bean "đang chuẩn bị", KHÔNG "Ảnh đã chỉnh xong, mời ba mẹ duyệt ạ". Thuần: dựng thẻ
 * thật bằng renderToStaticMarkup, quyết định lấy từ chính `khoiVungDuyet`.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TheHanhTrinh } from "@/components/features/gallery/the-hanh-trinh";
import { khoiVungDuyet } from "@/lib/anh-chinh-sua/vong-duyet";
import { vi } from "@/i18n/vi";

const CHU = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "").replace(/\u00A0/g, " ");

function dung(soAnhChinhTrongApp: number, gop: boolean) {
  const status = "awaiting_approval";
  const khoiDuyet = khoiVungDuyet({ status, soAnhChinhTrongApp, giaiDoan: null, coVongSuaMo: false });
  return CHU(
    renderToStaticMarkup(
      React.createElement(TheHanhTrinh, {
        status,
        giaiDoan: null,
        photoCount: 20,
        khoiDuyet,
        gop: gop ? { dongPhu: null, moiOngBa: null } : null,
      }),
    ),
  );
}

describe("BB-386 · tiêu đề thẻ hành trình theo khoiVungDuyet", () => {
  for (const gop of [true, false]) {
    const ten = gop ? "thẻ gộp" : "thẻ có tranh";
    it(`${ten}: chưa có ảnh chỉnh trong app → lời Bean đang chuẩn bị`, () => {
      const chu = dung(0, gop);
      expect(chu).toContain(vi.gallery.anhChinh.chuanBiTieuDe);
      expect(chu).not.toContain("đã chỉnh xong");
    });
    it(`${ten}: đã có ảnh chỉnh trong app → giữ "mời ba mẹ duyệt"`, () => {
      const chu = dung(3, gop);
      expect(chu).toContain("Ảnh đã chỉnh xong, mời ba mẹ duyệt");
      expect(chu).not.toContain("đang chuẩn bị");
    });
  }
});
