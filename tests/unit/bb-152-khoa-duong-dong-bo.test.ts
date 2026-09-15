/**
 * BB-152 — cửa khoá của đường đồng bộ định kỳ.
 *
 * Đây là một đường GHI vào dữ liệu thật của studio, chạy tự động, không có
 * người ngồi nhìn. Nếu gọi được mà không cần bí mật thì bất kỳ ai trên Internet
 * cũng bắt được hệ thống kéo lại toàn bộ Lark bất cứ lúc nào — vừa sai dữ liệu
 * vừa đốt hạn mức Google.
 *
 * Ba ca này rẻ, và chúng canh đúng chỗ không ai nhìn tới.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "@/app/api/cron/sync-lark/route";

const BI_MAT_CU = process.env.SYNC_CRON_SECRET;

describe("BB-152: cửa khoá đường đồng bộ định kỳ", () => {
  beforeEach(() => {
    process.env.SYNC_CRON_SECRET = "bi-mat-de-thu-bb152";
  });

  afterEach(() => {
    if (BI_MAT_CU === undefined) delete process.env.SYNC_CRON_SECRET;
    else process.env.SYNC_CRON_SECRET = BI_MAT_CU;
  });

  const goi = (header?: string) =>
    POST(
      new Request("http://localhost/api/cron/sync-lark", {
        method: "POST",
        headers: header ? { authorization: header } : {},
      }),
    );

  it("Không mang bí mật -> 401, và không chạm vào dữ liệu", async () => {
    const res = await goi();
    expect(res.status).toBe(401);
  });

  it("Sai bí mật -> 401", async () => {
    const res = await goi("Bearer sai-bet");
    expect(res.status).toBe(401);
  });

  it("Đúng chuỗi nhưng thiếu chữ Bearer -> vẫn 401", async () => {
    // Dễ tưởng là chuyện nhỏ. Nhưng so sánh lỏng ở đây nghĩa là một chuỗi đoán
    // được cũng lọt, và đường này ghi thẳng vào dữ liệu khách.
    const res = await goi("bi-mat-de-thu-bb152");
    expect(res.status).toBe(401);
  });

  it("Máy chủ KHÔNG đặt bí mật -> từ chối tất cả, không mở toang", async () => {
    delete process.env.SYNC_CRON_SECRET;
    const res = await goi("Bearer bat-ky-thu-gi");
    expect(res.status).toBe(401);
  });
});
