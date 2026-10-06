import fs from "node:fs";
import path from "node:path";

/**
 * Thư mục lưu ảnh chụp đối chiếu — `babybean-assets/` nằm CẠNH repo, NGOÀI repo
 * (ảnh không bao giờ vào git). Đi ngược lên từ chính tệp này tới khi gặp, nên
 * chạy được ở main lẫn worktree `.claude/worktrees/bbNNN` (06/10: đường dẫn kiểu
 * `process.cwd() + "../../../.."` vỡ khi chạy từ main, đường tuyệt đối thì lộ
 * tên máy vào repo công khai). Không thấy thì về `test-results/` cho khỏi hỏng.
 */
export function thuMucAnh(...con: string[]): string {
  let d = __dirname;
  for (let i = 0; i < 10; i++) {
    const thu = path.join(d, "babybean-assets");
    if (fs.existsSync(thu)) return path.join(thu, ...con);
    d = path.dirname(d);
  }
  return path.resolve(__dirname, "../../../test-results", ...con);
}
