import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

try { process.loadEnvFile?.('.env.local'); } catch {}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
