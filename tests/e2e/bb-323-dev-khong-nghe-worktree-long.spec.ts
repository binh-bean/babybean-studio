/**
 * BB-323 — dev server KHÔNG được dựng lại/đẩy HMR khi có tệp đổi trong
 * `<gốc>/.claude/` (nơi chứa worktree của các agent khác).
 *
 * OWNER: QA-BOT (tệp này) / DEV-OPS (`next.config.ts`, thứ được canh).
 *
 * Vì sao có phép thử này: 29/09/2026 lượt chạy e2e ở thư mục GỐC (cổng 3150)
 * đỏ bb-200 (a)(b1)(b2)(c) và bb-245 — trang kẹt "Đang tải…", API treo quá 30 s,
 * 14 lượt HMR trong 30 giây — trong khi đúng các tệp đó chạy ở worktree riêng thì
 * xanh. Nguyên nhân: worktree nằm LỒNG trong gốc (`.claude/worktrees/bbNNN/`),
 * Tailwind v4 khai `.claude` làm phụ thuộc thư mục, webpack nghe đệ quy cả cây —
 * mỗi ảnh chụp Playwright của agent khác ghi vào worktree của nó là một lượt HMR
 * ở dev server gốc. `next.config.ts` nay bỏ `<gốc>/.claude/` khỏi danh sách nghe
 * (chỉ khi dev).
 *
 * Cách đo: mở /login, đếm yêu cầu `*.hot-update.json` trình duyệt gửi đi.
 *   · Ghi ảnh .png giả vào `.claude/worktrees/<tạm>/test-results/` (đúng thứ
 *     Playwright của agent khác ghi) → phải 0 lượt HMR.
 *   · ĐỐI CHỨNG: ghi tệp .tsx vào một thư mục tạm trong `src/` → phải CÓ HMR —
 *     không có đối chứng thì "0 lượt" có thể chỉ vì máy đo hỏng (vd máy chủ
 *     không phải `next dev`).
 * Mọi tệp tạm bị xoá trong `finally`.
 *
 * KIỂM NGƯỢC (chạy tay, dán vào bàn giao BB-323): bỏ khối `webpack(...)` trong
 * `next.config.ts`, khởi động lại dev server → ca này ĐỎ (mỗi ảnh ghi vào
 * `.claude/worktrees/…` là một lượt HMR). Trả lại → XANH.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const runId = Math.random().toString(36).slice(2, 10);
const GOC = process.cwd();
const THU_MUC_LONG = path.join(GOC, ".claude", "worktrees", `__bb323-do-hmr-${runId}__`);
const THU_MUC_SRC = path.join(GOC, "src", `__bb323_do_hmr_${runId}__`);

function xoaThuMucTam(): void {
  fs.rmSync(THU_MUC_LONG, { recursive: true, force: true });
  fs.rmSync(THU_MUC_SRC, { recursive: true, force: true });
  // `.claude/worktrees` do chính phép thử tạo ra thì dọn luôn khi đã rỗng.
  const worktrees = path.join(GOC, ".claude", "worktrees");
  try {
    if (fs.existsSync(worktrees) && fs.readdirSync(worktrees).length === 0) fs.rmdirSync(worktrees);
  } catch {
    // Có worktree thật bên trong (đang chạy ở gốc) — để nguyên.
  }
}

test.describe("BB-323: dev server không nghe worktree lồng trong .claude/", () => {
  test.afterAll(() => xoaThuMucTam());

  test("ghi ảnh vào .claude/worktrees/… không gây HMR; ghi mã vào src/ thì có (đối chứng)", async ({ page }) => {
    test.setTimeout(90_000);
    let soHmr = 0;
    page.on("request", (r) => {
      if (r.url().includes("hot-update.json")) soHmr++;
    });

    await page.goto("/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(3_000); // để mọi lượt biên dịch lúc mở trang lắng xuống

    try {
      // 1. Mô phỏng Playwright của agent khác chụp ảnh vào worktree của nó.
      soHmr = 0;
      const thuMucAnh = path.join(THU_MUC_LONG, "test-results");
      fs.mkdirSync(thuMucAnh, { recursive: true });
      for (let i = 0; i < 4; i++) {
        fs.writeFileSync(path.join(thuMucAnh, `chup-${i}.png`), `anh gia ${Date.now()}`);
        await page.waitForTimeout(1_500);
      }
      await page.waitForTimeout(2_000);
      const hmrKhiGhiWorktreeLong = soHmr;

      // 2. Đối chứng: sửa mã trong src/ của CHÍNH dự án thì dev server phải nghe.
      soHmr = 0;
      fs.mkdirSync(THU_MUC_SRC, { recursive: true });
      for (let i = 0; i < 2; i++) {
        fs.writeFileSync(
          path.join(THU_MUC_SRC, `thu-${i}.tsx`),
          `export const ThuHmr${i} = () => <div className="mt-[${i + 1}7px]">x</div>;\n`,
        );
        await page.waitForTimeout(2_000);
      }
      const hmrKhiGhiSrc = soHmr;

      expect(hmrKhiGhiSrc, "Đối chứng: sửa src/ phải gây HMR — không thì máy đo không đo được gì").toBeGreaterThan(0);
      expect(
        hmrKhiGhiWorktreeLong,
        "Ảnh ghi vào .claude/worktrees/… (worktree agent khác) KHÔNG được làm dev server đẩy HMR",
      ).toBe(0);
    } finally {
      xoaThuMucTam();
    }
  });
});
