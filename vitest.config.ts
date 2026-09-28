import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

try { process.loadEnvFile?.('.env.local'); } catch {}

/**
 * BB-309 — CI không có Supabase thật (không secret cho database, cố ý: xem
 * AGENTS.md §6, bb-dev mang tên khách thật). Chạy `npm run test` ở đó vốn
 * gãy hàng loạt ngay từ `createClient(undefined, undefined)` ở dòng đầu mỗi
 * tệp — không phải một lỗi logic nào, chỉ là thiếu môi trường.
 *
 * Quét NỘI DUNG từng tệp .test.ts, không phải một danh sách tay: tệp nào
 * chạm `createClient(` hoặc đọc trực tiếp biến NEXT_PUBLIC_SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL thì coi là "cần cơ sở dữ liệu
 * thật". Thêm một tệp .test.ts mới chạm DB thì nó tự động rơi vào nhóm này,
 * không cần nhớ sửa cấu hình.
 *
 * CHỈ loại các tệp đó khi biến môi trường THẬT SỰ thiếu — máy dev có
 * `.env.local` thật thì `npm run test` vẫn chạy TOÀN BỘ như trước giờ, không
 * gì đổi. Việc bật lại phần này trên CI (trỏ vào bb-test, không phải bb-dev)
 * ghi ở docs/11-deployment.md §2a.
 */
function timTepPhepThuChamDb(gocTests: string): string[] {
  const KHOP =
    /createClient\s*\(|createAdminClient\s*\(|process\.env\.(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL)\b/;
  const ket: string[] = [];
  const duyet = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const ten of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ten.name);
      if (ten.isDirectory()) {
        duyet(p);
        continue;
      }
      if (!/\.test\.tsx?$/.test(ten.name)) continue;
      let noiDung = "";
      try {
        noiDung = fs.readFileSync(p, "utf8");
      } catch {
        continue;
      }
      if (KHOP.test(noiDung)) ket.push(p);
    }
  };
  duyet(gocTests);
  return ket;
}

const DB_MOI_TRUONG_THIEU = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
const gocTests = fileURLToPath(new URL("./tests", import.meta.url));
const tepChamDb = DB_MOI_TRUONG_THIEU
  ? timTepPhepThuChamDb(gocTests).map((p) => path.relative(process.cwd(), p).split(path.sep).join("/"))
  : [];

if (DB_MOI_TRUONG_THIEU && tepChamDb.length) {
  console.warn(
    `\n[vitest] Thiếu NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — ` +
      `bỏ qua ${tepChamDb.length} tệp phép thử cần cơ sở dữ liệu thật. ` +
      `Xem docs/11-deployment.md §2a để bật lại (trỏ vào bb-test).\n`,
  );
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ...tepChamDb,
    ],

    /**
     * Chạy lần lượt từng tệp, không song song.
     *
     * Bốn tệp test cùng chèn và xoá trong bảng `galleries` của MỘT database
     * dùng chung: fixtures/gallery-auth.ts, security/rbac.test.ts,
     * unit/admin-galleries.test.ts, unit/patch-selection.test.ts. Vitest mặc
     * định chạy các tệp song song, nên chúng giẫm lên dữ liệu của nhau.
     *
     * Ngày 11.09.2026 PM chạy `npm run verify` năm lần trên cùng một commit:
     * bốn lần xanh, một lần đỏ. Bộ test chập chờn tệ hơn bộ test đỏ — người ta
     * học được thói quen chạy lại cho tới khi xanh, và một lỗi thật sẽ trôi qua
     * giữa những lần chạy lại đó.
     *
     * Bộ bàn giao Studio OS ghi đúng bệnh này: "npm test đi từ 0 lỗi lên
     * 129/139 lỗi trên code không đổi một dòng. Chạy lẻ từng tệp thì xanh."
     *
     * Cái giá là bộ test chậm hơn. Đáng.
     */
    fileParallelism: false,

    /**
     * 20 giây cho mỗi phép thử, thay vì 5 giây mặc định.
     *
     * Phần lớn test ở đây gọi Supabase qua HTTP, mỗi lượt 1-2 giây. Một phép
     * thử làm ba lượt liên tiếp là đã chạm 5 giây, và sau khi bb-dev có dữ liệu
     * thật (432 bộ ảnh, 2.000 dòng hàng) thì chạm thật.
     *
     * Ngày 12.09.2026: test "thả tim vào ảnh ĐÃ CHỌN" hết giờ ở 5014ms — quá
     * đúng 14 mili-giây. Phép thử kế tiếp hỏng theo vì phép thử trước dừng
     * giữa chừng, để lại dữ liệu dở dang. Một lỗi thời gian chờ hoá thành hai
     * lỗi, và lỗi thứ hai chỉ vào nhầm chỗ.
     *
     * Nới thời gian chờ KHÔNG che được lỗi thật: phép thử sai vẫn sai, chỉ là
     * nó có đủ thời gian để sai cho đúng chỗ.
     */
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/fixtures/empty.ts", import.meta.url)), "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
