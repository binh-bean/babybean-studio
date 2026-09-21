/**
 * Mã nguồn đọc biến môi trường nào thì .env.example phải có biến đó.
 *
 * OWNER: DEV-OPS. Task BB-163.
 *
 * Vì sao có phép thử này: BB-152 dựng đường kéo Lark định kỳ, đọc
 * `process.env.SYNC_CRON_SECRET`, nhưng không ai thêm tên biến đó vào
 * `.env.example` hay docs/11. Bảng kiểm khi lên máy chủ đi theo .env.example,
 * nên biến không được đặt trên Vercel — và route trả 401 mọi lượt gọi.
 *
 * Đo ngày 16/09/2026: `vercel env ls production` có 10 biến, không có
 * SYNC_CRON_SECRET. Tính năng chủ studio đặt hàng ("dữ liệu Lark cập nhật gần
 * thời gian thật") nằm đó, đã gộp, đã thử, và KHÔNG CHẠY.
 *
 * Cửa đóng đúng cách (401 chứ không mở toang) nên không ai thấy gì hỏng. Đó
 * chính là lý do cần phép thử: một tính năng chết im lặng khó thấy hơn một
 * tính năng báo lỗi.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const goc = path.resolve(__dirname, "../..");

/**
 * Biến do môi trường chạy tự đặt, không phải thứ studio khai.
 *
 * `VITEST` do chính vitest đặt khi chạy — cùng loại với `CI` và `NODE_ENV`.
 * `src/lib/lark/notify.ts` đọc nó để biết đừng bắn tin thật vào nhóm Lark của
 * studio trong lúc chạy phép thử. Đặt nó trên Vercel là vô nghĩa và có hại.
 */
const TU_CO = new Set(["NODE_ENV", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "CI", "VITEST"]);

function moiTepTs(thuMuc: string): string[] {
  const ra: string[] = [];
  for (const m of fs.readdirSync(thuMuc, { withFileTypes: true })) {
    const duong = path.join(thuMuc, m.name);
    if (m.isDirectory()) ra.push(...moiTepTs(duong));
    else if (/\.(ts|tsx)$/.test(m.name)) ra.push(duong);
  }
  return ra;
}

describe("BB-163: biến môi trường mã nguồn đọc phải có trong .env.example", () => {
  it("không biến nào bị bỏ ra ngoài bảng kiểm", () => {
    const mau = fs.readFileSync(path.join(goc, ".env.example"), "utf8");
    const daKhai = new Set(
      mau
        .split(/\r?\n/)
        .map((d) => d.trim())
        .filter((d) => d.length > 0 && !d.startsWith("#"))
        .map((d) => (d.split("=")[0] ?? "").trim()),
    );

    const dung = new Map<string, string[]>();
    for (const tep of moiTepTs(path.join(goc, "src"))) {
      const noi = fs.readFileSync(tep, "utf8");
      for (const khop of noi.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
        const ten = khop[1];
        if (!ten || TU_CO.has(ten)) continue;
        const ds = dung.get(ten) ?? [];
        const ngan = path.relative(goc, tep).split(path.sep).join("/");
        if (!ds.includes(ngan)) ds.push(ngan);
        dung.set(ten, ds);
      }
    }

    const thieu = [...dung.entries()]
      .filter(([ten]) => !daKhai.has(ten))
      .map(([ten, tep]) => `${ten} (đọc ở ${tep.join(", ")})`);

    expect(
      thieu,
      `Thiếu trong .env.example:\n  ${thieu.join("\n  ")}\n` +
        "Thêm tên biến vào .env.example VÀ vào docs/11-deployment.md, " +
        "rồi đặt giá trị trên Vercel — không thì tính năng sẽ chết im lặng.",
    ).toEqual([]);
  });
});
