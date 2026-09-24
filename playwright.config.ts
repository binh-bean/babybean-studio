/**
 * Playwright configuration for BabyBean Studio E2E tests.
 *
 * OWNER: QA-BOT.
 *
 * Spins up a Next.js dev server on port 3099 with the Drive network
 * interceptor pre-loaded, so /api/img returns a valid 1×1 JPEG without
 * hitting the internet.  Everything else — Supabase queries, cookie
 * signing, permission checks — runs for real.
 */

import { defineConfig, devices } from "@playwright/test";

// Load .env.local the same way Next.js does, so the dev server and the
// test helpers share the same DB connection string and APP_SECRET.
try {
  process.loadEnvFile?.(".env.local");
} catch {
  // .env.local may not exist in CI
}

// Cổng chọn được qua PW_PORT (mặc định 3099). Có từ 24/09/2026 khi nhiều agent
// chạy phép thử trình duyệt song song, mỗi agent một worktree: cùng một cổng
// thì agent sau dùng lại máy chủ của agent trước (reuseExistingServer) — tức
// chạy phép thử trên MÃ CỦA NGƯỜI KHÁC mà vẫn báo xanh.
const PORT = Number(process.env.PW_PORT) || 3099;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,

  /* No parallel — fixtures share one database. */
  fullyParallel: false,
  workers: 1,

  /* Generous timeout: dev server is slow on first compile. */
  timeout: 60_000,
  expect: { timeout: 15_000 },

  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: `node --require ./tests/fixtures/mock-drive-network.cjs ./node_modules/next/dist/bin/next dev -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
