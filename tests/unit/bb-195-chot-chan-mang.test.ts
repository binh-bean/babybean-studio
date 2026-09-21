import { describe, it, expect, vi, afterEach } from "vitest";
import { driveFetch } from "@/lib/drive/client";
import { readLarkTable, larkAuth } from "@/lib/lark/sync-retouch";

describe("BB-195: chốt chặn driveFetch và readLarkTable không được gọi thật ra ngoài trong lúc chạy phép thử", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gọi driveFetch thì ném lỗi Đang chạy phép thử", async () => {
    // Không mock fetch! 
    await expect(
      driveFetch("/files", {}, { requestId: "test" })
    ).rejects.toThrow("Đang chạy phép thử");
  });

  it("gọi larkAuth thì ném lỗi Đang chạy phép thử", async () => {
    await expect(
      larkAuth("appId", "appSecret")
    ).rejects.toThrow("Đang chạy phép thử");
  });

  it("gọi readLarkTable thì ném lỗi Đang chạy phép thử", async () => {
    await expect(
      readLarkTable({ authorization: "test" }, "baseToken", /test/)
    ).rejects.toThrow("Đang chạy phép thử");
  });
});
