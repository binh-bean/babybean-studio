import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * BB-223 — phép thử QUÉT MÃ, canh hai lớp lỗi đã thấy thật ngày 24/09/2026:
 *
 *   A. Một route trong src/app/api/** gọi `.json()` trên request TRẦN, không
 *      qua `readJsonBody()` dùng chung — thân rỗng/hỏng lại ném SyntaxError
 *      không ai bắt, quay lại thành 500 thay vì 400.
 *   B. Một lời gọi `fail(...)` truyền `message` là MÃ LỖI TRẦN (chuỗi hằng
 *      TOÀN CHỮ HOA/gạch dưới, ví dụ "FORBIDDEN") hoặc `err.message` /
 *      `error.message` của một lỗi CHƯA KIỂM SOÁT — mã lỗi trần hoặc lỗi
 *      Postgres/tiếng Anh lọt ra màn hình người dùng.
 *
 * ĐÂY LÀ PHÉP THỬ QUÉT MÃ CÓ CHỦ ĐÍCH, không phải "đọc mã nguồn làm dữ liệu
 * thử" kiểu BB-108 (đọc một tệp rồi so khớp CHÍNH TẢ của nó). Ở đây quét TOÀN
 * BỘ src/app/api để canh một BẤT BIẾN kiến trúc — "không ai được viết lại
 * request.json() trần" và "không ai được truyền mã lỗi/err.message trần vào
 * fail()" — nên đổi tên biến, format lại code, thêm route mới đều không làm
 * phép thử này đỏ SAI; nó chỉ đỏ khi ai đó thật sự đưa lại đúng hai lỗi trên.
 *
 * KIỂM NGƯỢC (24/09/2026): thêm tạm `await request.json()` trần vào một route
 * bất kỳ -> ca A đỏ, đúng dòng, đúng file. Thêm tạm
 * `fail(err.code, err.message)` cho AuthError -> ca B đỏ. Bỏ lại bản vá ->
 * cả hai xanh.
 */

const API_ROOT = path.join(process.cwd(), "src", "app", "api");
const LIB_ROOT = path.join(process.cwd(), "src", "lib");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const routeFiles = walk(API_ROOT).filter((f) => f.endsWith("route.ts"));
const libFiles = walk(LIB_ROOT);

/**
 * Ngoại lệ CÓ LÝ DO, càng ít càng tốt — khớp theo ĐÚNG NỘI DUNG DÒNG (trim),
 * không theo tên tệp. Một tệp có thể vừa có một dòng hợp lệ vừa có một dòng
 * tái phạm; cho qua cả tệp sẽ che mất dòng tái phạm đó, đúng lỗ hổng kiểm
 * ngược 24/09/2026 phát hiện trong chính phép thử này (bản đầu allowlist
 * theo tên tệp, và phục hồi lỗi `fail(err.code, err.message)` cho AuthError
 * trong `admin/galleries/route.ts` KHÔNG làm phép thử đỏ, vì tệp đó đã có sẵn
 * một dòng err.message hợp lệ khác được cho qua).
 *
 * Mỗi dòng dưới đây có `err.message`/`error.message` tới từ một lớp lỗi tự
 * viết, có message tiếng Việt cố định ngay tại constructor (InvalidDriveLinkError,
 * GalleryNotFoundError) hoặc từ một kiểu dữ liệu `{ code, message? }` do
 * chính src/lib/selection/mutate.ts trả về và đã được BB-223 dọn sạch mã trần
 * / lỗi Postgres. Xoá điều kiện `instanceof` đứng trước dòng này đi mà vẫn
 * giữ dòng trong danh sách là tự lừa dối phép thử.
 */
const NGOAI_LE_ERR_MESSAGE = new Set([
  'return fail("INVALID_INPUT", err.message);',
  'if (err instanceof GalleryNotFoundError) return fail("NOT_FOUND", err.message);',
  "return fail(error.code, error.message);",
]);

function relPath(f: string): string {
  return path.relative(process.cwd(), f).replace(/\\/g, "/");
}

describe("Quét mã BB-223 — không request.json() trần trong src/app/api", () => {
  it("không route nào gọi request.json()/req.json() trực tiếp", () => {
    const viPham: string[] = [];
    for (const file of routeFiles) {
      const noi_dung = readFileSync(file, "utf8");
      // Khớp .json() ngay sau `request` hoặc `req`, nhưng KHÔNG khớp khi nó là
      // phần của readJsonBody(request) — readJsonBody gọi request.json() bên
      // TRONG src/lib/api-response.ts, không phải trong route.
      const khopTran = /\b(request|req)\.json\(\)/.test(noi_dung);
      if (khopTran) viPham.push(relPath(file));
    }
    expect(viPham).toEqual([]);
  });
});

describe("Quét mã BB-223 — fail() không nhận message trần", () => {
  it("không có fail(...) nào truyền message là chuỗi hằng TOÀN CHỮ HOA (mã lỗi trần)", () => {
    const viPham: string[] = [];
    const reAllCaps = /fail\(\s*[^,()]+,\s*"([A-Z][A-Z0-9_]*)"/g;
    for (const file of [...routeFiles, ...libFiles]) {
      const noi_dung = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = reAllCaps.exec(noi_dung))) {
        viPham.push(`${relPath(file)} :: "${m[1]}"`);
      }
    }
    expect(viPham).toEqual([]);
  });

  it("không có fail(...) nào truyền thẳng err.message/error.message chưa kiểm soát", () => {
    const viPham: string[] = [];
    for (const file of [...routeFiles, ...libFiles]) {
      const noiDung = readFileSync(file, "utf8");
      const dongs = noiDung.split("\n");
      dongs.forEach((dong, idx) => {
        if (!/fail\(/.test(dong)) return;
        if (!/\b(err|error)\.message\b/.test(dong)) return;
        const daChoPhep = NGOAI_LE_ERR_MESSAGE.has(dong.trim());
        if (!daChoPhep) {
          viPham.push(`${relPath(file)}:${idx + 1} :: ${dong.trim()}`);
        }
      });
    }
    expect(viPham).toEqual([]);
  });
});
