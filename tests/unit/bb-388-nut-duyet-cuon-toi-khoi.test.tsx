/**
 * BB-388 — nút "Xem & duyệt N ảnh chỉnh" ở thanh đáy cuộn tới `#anh-da-chinh`.
 *
 * Thanh đáy hiện ngay khi bộ ảnh tải xong, còn khối ảnh chỉnh tự tải thêm ~1–2 giây. Trước bản
 * vá, ô "đang tải" của khối KHÔNG mang id đó → bấm sớm thì `getElementById` ra null, nút không
 * làm gì (e2e bb-384 ca 3, 07/10). Canh: lần dựng ĐẦU (dữ liệu chưa về) đã có `id="anh-da-chinh"`.
 *
 * Dựng bằng `renderToStaticMarkup` (lần dựng đầu, effect không chạy — không giả lập hook, AGENTS
 * §5a); `fetch` giả ở biên để không gọi mạng.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnhChinhSuaKhach } from "@/components/features/gallery/anh-chinh-sua-khach";

afterEach(() => vi.unstubAllGlobals());

describe("BB-388 — khối ảnh chỉnh mang id đích của nút thanh đáy ngay cả lúc đang tải", () => {
  it("lần dựng đầu (chưa có dữ liệu) có đúng một phần tử id=anh-da-chinh", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const html = renderToStaticMarkup(<AnhChinhSuaKhach onDaQuyet={() => {}} />);
    expect(html.match(/id="anh-da-chinh"/g)?.length).toBe(1);
  });
});
