/**
 * doc-tep-env — đọc một tệp kiểu `.env` (KEY=VALUE mỗi dòng) thành một object.
 *
 * OWNER: DEV-OPS. Task BB-315.
 *
 * ---------------------------------------------------------------------------
 * Vì sao cần cái này, đã có `node --env-file` rồi
 * ---------------------------------------------------------------------------
 * `node --env-file=.env.local` nạp MỘT tệp, TRƯỚC KHI script bắt đầu chạy —
 * chọn được lúc gõ lệnh, không chọn được lúc script đang chạy. Vài công cụ ở
 * BB-315 (`chep-cau-hinh.mjs`, `so-sanh-migration.mjs`) cần nối tới HAI cơ sở
 * dữ liệu cùng lúc (nguồn và đích) — hai tệp `.env` khác nhau, cùng trong một
 * lượt chạy. `--env-file` của Node không làm được việc đó.
 *
 * `parseEnvContent` tách riêng khỏi việc đọc tệp để phép thử đơn vị kiểm được
 * logic phân tích cú pháp mà không phải tạo tệp thật trên đĩa (AGENTS.md §5a —
 * không cần chạm hệ thống tệp cho phần logic thuần).
 *
 * KHÔNG bao giờ in nội dung đã đọc ra console — tệp `.env.prod.local` có thể
 * chứa khoá bí mật. Hàm ở đây chỉ trả object, việc có in ra hay không là của
 * nơi gọi, và nơi gọi trong kho này không được in.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Phân tích nội dung một tệp `.env`: `KEY=VALUE`, bỏ dòng trống và dòng bắt
 * đầu bằng `#`. Bỏ dấu nháy đơn/kép bọc quanh giá trị nếu có. KHÔNG hỗ trợ
 * biến lồng biến hay xuống dòng trong giá trị — tệp `.env.local`/`.env.prod.local`
 * của kho này không dùng kiểu đó (xem `.env.example`).
 */
export function parseEnvContent(noiDung) {
  const ket = {};
  for (const dongGoc of noiDung.split(/\r?\n/)) {
    const dong = dongGoc.trim();
    if (!dong || dong.startsWith("#")) continue;
    const iEq = dong.indexOf("=");
    if (iEq === -1) continue;
    const key = dong.slice(0, iEq).trim();
    if (!key) continue;
    let val = dong.slice(iEq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    ket[key] = val;
  }
  return ket;
}

/** Đọc một tệp `.env` từ đĩa. Trả `null` nếu không thấy tệp — KHÔNG ném lỗi. */
export function docTepEnv(duongDan) {
  const tep = path.resolve(duongDan);
  if (!fs.existsSync(tep)) return null;
  return parseEnvContent(fs.readFileSync(tep, "utf8"));
}
