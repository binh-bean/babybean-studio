/**
 * Luật bật/tắt nút ở vòng duyệt ảnh đã chỉnh.
 *
 * Đây là các hàm màn hình GỌI THẬT (review-panel.tsx), không phải bản chép
 * lại. Dự án chưa có thư viện dựng DOM, nên luật quan trọng được tách ra hàm
 * thuần để thử được — cùng cách đã làm với `buildHeartPayload`.
 */

import { describe, it, expect } from "vitest";
import { canApprove, canRequestRevision } from "@/lib/selection/review-rules";

const CHO_DUYET = { status: "awaiting_approval", finalDriveUrl: "https://drive/x" };

describe("Vòng duyệt: khi nào khách bấm được", () => {
  it("1. Đang chờ duyệt và CÓ link -> duyệt được", () => {
    expect(canApprove(CHO_DUYET)).toBe(true);
  });

  it("2. Đang chờ duyệt nhưng CHƯA có link -> không duyệt được", () => {
    // Studio quên dán link mà khách vẫn duyệt được thì bộ ảnh đi thẳng vào
    // xưởng in, và cái sai chỉ lộ ra lúc khách cầm ảnh trên tay.
    expect(canApprove({ status: "awaiting_approval", finalDriveUrl: null })).toBe(false);
    expect(canApprove({ status: "awaiting_approval", finalDriveUrl: "" })).toBe(false);
  });

  it("3. Chưa tới bước duyệt -> không duyệt được, dù có link", () => {
    for (const s of ["in_review", "submitted", "in_retouch", "approved", "delivered"]) {
      expect(canApprove({ status: s, finalDriveUrl: "https://drive/x" })).toBe(false);
    }
  });

  it("4. Yêu cầu sửa phải viết gì đó", () => {
    expect(canRequestRevision(CHO_DUYET, "")).toBe(false);
    expect(canRequestRevision(CHO_DUYET, "   ")).toBe(false);
    expect(canRequestRevision(CHO_DUYET, "Ảnh số 3 sáng quá")).toBe(true);
  });

  it("5. Ghi chú quá dài -> chặn ở màn hình, không để route trả lỗi", () => {
    expect(canRequestRevision(CHO_DUYET, "a".repeat(1000))).toBe(true);
    expect(canRequestRevision(CHO_DUYET, "a".repeat(1001))).toBe(false);
  });

  it("6. Chưa có link thì viết gì cũng không gửi được", () => {
    // Không có link nghĩa là khách chưa xem bản nào — "sửa chỗ này" lúc đó
    // không chỉ vào được thứ gì.
    expect(
      canRequestRevision({ status: "awaiting_approval", finalDriveUrl: null }, "sửa giúp"),
    ).toBe(false);
  });
});
