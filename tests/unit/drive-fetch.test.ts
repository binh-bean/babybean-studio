/**
 * OWNER: DEV-INT. Task BB-011.
 * Tests for driveFetch() — retry, backoff+jitter, timeout, error handling, logging security.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));

import {
  driveFetch,
  backoffMs,
  DriveAccessDeniedError,
  DriveUnavailableError,
  TIMEOUT_MS,
  MAX_ATTEMPTS,
} from "@/lib/drive/client";

describe("BB-011: driveFetch & client", () => {
  const originalEnv = process.env.GOOGLE_DRIVE_API_KEY;
  const FAKE_KEY = "AIzaSyFakeKeyForTesting123456789";

  beforeEach(() => {
    process.env.GOOGLE_DRIVE_API_KEY = FAKE_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.GOOGLE_DRIVE_API_KEY = originalEnv;
    vi.useRealTimers();
  });

  describe("constants & backoffMs", () => {
    it("has correct timeout and attempt limits", () => {
      expect(TIMEOUT_MS).toBe(10_000);
      expect(MAX_ATTEMPTS).toBe(5);
    });

    it("calculates exponential backoff within ±30% jitter range", () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const base = 250 * 2 ** attempt;
        const min = Math.round(base * 0.7);
        const max = Math.round(base * 1.3);

        for (let run = 0; run < 20; run++) {
          const ms = backoffMs(attempt);
          expect(ms).toBeGreaterThanOrEqual(min);
          expect(ms).toBeLessThanOrEqual(max);
        }
      }
    });
  });

  describe("error handling & retries", () => {
    it("throws immediately without retry on 403 (unshared folder)", async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: { code: 403, message: "Forbidden" } }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      });

      await expect(
        driveFetch("/files", { q: "'root' in parents" }, { requestId: "req-403", folderId: "folder-123" }),
      ).rejects.toThrow(DriveAccessDeniedError);

      expect(callCount).toBe(1);
    });

    it("throws immediately without retry on 404 (folder not found / deleted)", async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: { code: 404, message: "Not Found" } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      });

      await expect(
        driveFetch("/files", {}, { requestId: "req-404", folderId: "missing-folder" }),
      ).rejects.toThrow(DriveAccessDeniedError);

      expect(callCount).toBe(1);
    });

    it("retries on 429 and succeeds on subsequent attempt", async () => {
      vi.useFakeTimers();
      let callCount = 0;

      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return new Response(JSON.stringify({ error: { code: 429, message: "Rate limit" } }), {
            status: 429,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const promise = driveFetch("/files", {}, { requestId: "req-retry" });

      // Advance timers through the sleep pauses
      await vi.advanceTimersByTimeAsync(2000);
      const res = await promise;

      expect(res.ok).toBe(true);
      expect(callCount).toBe(3);
    });

    it("retries on 500/502/503 and exhausts retries after MAX_ATTEMPTS", async () => {
      vi.useFakeTimers();
      let callCount = 0;

      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: { code: 503, message: "Service Unavailable" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      });

      const promise = driveFetch("/files", {}, { requestId: "req-503" });

      // Advance through all 5 attempts
      const timerProgression = (async () => {
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
          await vi.advanceTimersByTimeAsync(5000);
        }
      })();

      await Promise.all([
        expect(promise).rejects.toThrow(DriveUnavailableError),
        timerProgression,
      ]);

      expect(callCount).toBe(MAX_ATTEMPTS);
    });

    it("retries transient network errors (fetch reject)", async () => {
      vi.useFakeTimers();
      let callCount = 0;

      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Network connection reset");
        }
        return new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const promise = driveFetch("/files", {}, { requestId: "req-net-retry" });
      await vi.advanceTimersByTimeAsync(1000);
      const res = await promise;

      expect(res.ok).toBe(true);
      expect(callCount).toBe(2);
    });

    it("never leaks the API key in logged messages", async () => {
      const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      global.fetch = vi.fn().mockImplementation(async (url: URL | string) => {
        const urlStr = url.toString();
        expect(urlStr).toContain(`key=${FAKE_KEY}`);
        return new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      await driveFetch("/files", { pageToken: "tok123" }, { requestId: "req-log", folderId: "fld-abc" });

      expect(consoleInfoSpy).toHaveBeenCalled();
      for (const call of consoleInfoSpy.mock.calls) {
        const loggedText = call.join(" ");
        expect(loggedText).not.toContain(FAKE_KEY);
        const parsed = JSON.parse(loggedText);
        expect(parsed.requestId).toBe("req-log");
        expect(parsed.folderId).toBe("fld-abc");
        expect(parsed.pageToken).toBe("tok123");
        expect(parsed.status).toBe(200);
      }
    });

    it("throws when GOOGLE_DRIVE_API_KEY is not set", async () => {
      delete process.env.GOOGLE_DRIVE_API_KEY;

      await expect(
        driveFetch("/files", {}, { requestId: "req-no-key" }),
      ).rejects.toThrow("GOOGLE_DRIVE_API_KEY is not configured");
    });
  });
});
