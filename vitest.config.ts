import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

try { process.loadEnvFile?.('.env.local'); } catch {}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],

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
  },
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/fixtures/empty.ts", import.meta.url)), "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
