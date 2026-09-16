import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

try { process.loadEnvFile?.('.env.local'); } catch {}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],

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
