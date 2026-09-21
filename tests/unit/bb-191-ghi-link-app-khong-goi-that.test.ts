import { describe, it, expect, vi, afterEach } from "vitest";
import { ghiLinkAppVeLark } from "@/lib/lark/ghi-link-app";

describe("BB-191: chốt chặn ghiLinkAppVeLark không được gọi thật ra ngoài trong lúc chạy phép thử", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gọi ghiLinkAppVeLark({ ghiThat: true }) thì không có lượt fetch nào được gọi", async () => {
    // 1. Dựng fetch giả đếm số lần gọi
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({}), { status: 200 });
    });

    // 2. Gọi hàm, đòi ghi thật
    const kq = await ghiLinkAppVeLark({
      recordId: "mock-record-id",
      diaChi: "https://test.babybean.vn/g/123456",
      ghiThat: true,
    });

    // 3. Kiểm chứng
    expect(kq.ghiDuoc).toBe(false);
    expect(kq.chayThu).toBe(true);
    expect(kq.lyDo).toContain("Đang chạy phép thử");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
