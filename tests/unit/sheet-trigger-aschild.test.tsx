/**
 * `SheetTrigger asChild` không được sinh ra `<button>` lồng `<button>`.
 *
 * Tìm ra ngày 22/09/2026 khi soát màn Khách hàng trên trình duyệt: mọi màn
 * quản trị đều in ba lỗi ra console, trong đó có
 * "Hydration failed because the server rendered HTML didn't match the client".
 *
 * Nguyên nhân: `asChild` có trong kiểu dữ liệu của `SheetTriggerProps` nhưng
 * thân hàm không đọc tới, nên nó rơi vào `...props` rồi đổ thẳng lên thẻ
 * `<button>` của DOM — và phần tử con (cũng là một `<button>`) nằm lồng bên
 * trong. HTML cấm chuyện đó.
 *
 * Vì sao đáng có phép thử canh: hydration hỏng KHÔNG làm màn hình trắng. Nó chỉ
 * khiến React vứt cây máy chủ dựng sẵn rồi vẽ lại toàn bộ bằng máy khách. Màn
 * hình vẫn hiện ra, chỉ chậm hơn — đúng loại hỏng âm thầm mà không ai báo.
 *
 * Phép thử dựng bằng `renderToStaticMarkup` nên không cần jsdom.
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";

describe("SheetTrigger asChild", () => {
  const markup = () =>
    renderToStaticMarkup(
      <Sheet>
        <SheetTrigger asChild>
          <button aria-label="Mở menu">menu</button>
        </SheetTrigger>
      </Sheet>,
    );

  it("giữ nguyên phần tử con, không bọc thêm một nút nữa", () => {
    const html = markup();
    expect(html).toBe('<button aria-label="Mở menu">menu</button>');
  });

  it("không có nút lồng nút", () => {
    expect(markup()).not.toMatch(/<button[^>]*>[\s\S]*<button/);
  });

  it("không rò thuộc tính asChild ra DOM", () => {
    expect(markup().toLowerCase()).not.toContain("aschild");
  });

  it("không có asChild thì vẫn tự dựng nút như cũ", () => {
    const html = renderToStaticMarkup(
      <Sheet>
        <SheetTrigger className="x">mở</SheetTrigger>
      </Sheet>,
    );
    expect(html).toContain("<button");
    expect(html).toContain('class="x"');
    expect(html).toContain("mở");
  });
});
