/**
 * Thân yêu cầu lưu ghi chú phải qua được CHÍNH luật kiểm của máy chủ.
 *
 * 24/09/2026: bản cũ thiếu `clientOpId`, máy chủ trả 400 cho mọi lần lưu ghi
 * chú — không phép thử nào bắt được vì phía khách và phía máy chủ không bao
 * giờ được đặt cạnh nhau. Đây đặt chúng cạnh nhau.
 */
import { describe, it, expect } from "vitest";
import { SelectionPatchSchema } from "@/app/api/g/selection/schema";
import { buildGhiChuPayload, buildHeartPayload } from "@/lib/selection/heart-payload";

const ID = "7f1c2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b";
const OP = "0b9e8d7c-6a5f-4e3d-9c2b-1a0f9e8d7c6b";

describe("thân yêu cầu PATCH /api/g/selection", () => {
  it("lưu ghi chú qua được luật kiểm máy chủ", () => {
    expect(SelectionPatchSchema.safeParse(buildGhiChuPayload(ID, "Làm sáng da bé", OP)).success).toBe(true);
  });

  it("xoá ghi chú (chuỗi toàn dấu cách) gửi null, vẫn hợp lệ", () => {
    const body = buildGhiChuPayload(ID, "   ", OP);
    expect(body.ops[0].retouchNote).toBeNull();
    expect(SelectionPatchSchema.safeParse(body).success).toBe(true);
  });

  it("thả tim qua được luật kiểm máy chủ", () => {
    expect(SelectionPatchSchema.safeParse(buildHeartPayload(ID, false, OP)).success).toBe(true);
  });
});
