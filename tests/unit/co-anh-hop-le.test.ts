/**
 * Mọi chỗ xin ảnh qua `/api/img/<id>?w=…` phải xin cỡ máy chủ NHẬN.
 *
 * Soát khi gộp BB-212 (24/09/2026): dải ảnh nhỏ trong hộp "Chốt danh sách"
 * xin `?w=120`. Route ảnh chỉ nhận THUMBNAIL_WIDTHS (200, 400, 800, 1600,
 * 2048) nên trả 400 — ba mẹ thấy một hàng ô ảnh vỡ đúng ở bước quan trọng
 * nhất. tsc, lint và phép thử của agent đều xanh: không cái nào nhìn vào
 * chuỗi địa chỉ ảnh.
 *
 * Phép thử quét mã nguồn tìm mọi `/api/img/…?w=<số>` viết thẳng và đối chiếu
 * với THUMBNAIL_WIDTHS thật (import, không chép lại danh sách).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { THUMBNAIL_WIDTHS } from "@/types/domain";

const GOC = path.resolve(__dirname, "../..");

function cacTep(thuMuc: string): string[] {
  const kq: string[] = [];
  for (const m of fs.readdirSync(thuMuc, { withFileTypes: true })) {
    const p = path.join(thuMuc, m.name);
    if (m.isDirectory()) kq.push(...cacTep(p));
    else if (/\.(tsx?|jsx?)$/.test(m.name)) kq.push(p);
  }
  return kq;
}

describe("Cỡ ảnh xin qua /api/img", () => {
  it("chỉ dùng cỡ trong THUMBNAIL_WIDTHS", () => {
    const hopLe = new Set<number>(THUMBNAIL_WIDTHS);
    const sai: string[] = [];
    let soCho = 0;
    for (const tep of cacTep(path.join(GOC, "src"))) {
      const ma = fs.readFileSync(tep, "utf-8");
      for (const m of ma.matchAll(/\/api\/img\/[^"'`\s]*\?w=(\d+)/g)) {
        soCho++;
        const co = Number(m[1]);
        if (!hopLe.has(co)) {
          const dong = ma.slice(0, m.index).split("\n").length;
          sai.push(`${path.relative(GOC, tep)}:${dong} w=${co}`);
        }
      }
    }
    expect(sai, `Cỡ ảnh máy chủ không nhận:\n${sai.join("\n")}`).toEqual([]);
    // Không để phép thử xanh vì quét trượt chỗ nào.
    expect(soCho).toBeGreaterThan(5);
  });
});
