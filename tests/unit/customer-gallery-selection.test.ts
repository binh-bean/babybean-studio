/**
 * BB-112 — khách thả tim để chọn ảnh.
 *
 * Bản đầu của phép thử này TỰ VIẾT LẠI hàm dựng nội dung gửi đi rồi kiểm chính
 * bản sao đó. Nó trông như một đảm bảo mà không đảm bảo gì: component gửi sai
 * thì phép thử vẫn xanh. Giờ import ĐÚNG hàm mà gallery-app.tsx đang gọi.
 */

import { describe, it, expect } from "vitest";
import { buildHeartPayload } from "@/lib/selection/heart-payload";

describe("BB-112: Khách thả tim để chọn ảnh", () => {
  it("Thả tim gửi mark='selected', TUYỆT ĐỐI KHÔNG gửi isFavorite", () => {
    const body = buildHeartPayload("photo-123", false, "op-1");

    expect(body.ops).toHaveLength(1);
    expect(body.ops[0]?.mark).toBe("selected");
    expect(body.ops[0]?.photoId).toBe("photo-123");

    // Đây là dòng quan trọng nhất của cả phép thử.
    //
    // API nhận CẢ HAI trường. Gửi isFavorite sẽ thành công, HTTP 200, không
    // lỗi gì — nhưng hạn mức chỉ đếm mark='selected', nên khách thả tim 30 ảnh
    // mà hệ thống báo 0, không ai trả tiền vượt, báo cáo thất thoát mù.
    expect(Object.keys(body.ops[0] ?? {})).toEqual(["photoId", "mark"]);
    expect("isFavorite" in (body.ops[0] ?? {})).toBe(false);
  });

  it("Bỏ tim gửi mark=null, không phải xoá dòng", () => {
    const body = buildHeartPayload("photo-123", true, "op-2");

    // null nghĩa là "khách chưa quyết định gì về ảnh này" — 0009 cố ý cho cột
    // mark nhận null. Ảnh còn tim hoặc còn ghi chú thì dòng vẫn ở lại.
    expect(body.ops[0]?.mark).toBeNull();
    expect("isFavorite" in (body.ops[0] ?? {})).toBe(false);
  });

  it("clientOpId đi vào nguyên vẹn, để gửi lại không áp dụng hai lần", () => {
    // patch_selection_batch nhận ra mã trùng và trả kết quả cũ thay vì ghi
    // thêm. Hàm này phải chuyển mã qua nguyên vẹn, không tự sinh mã mới.
    expect(buildHeartPayload("p", false, "op-abc").clientOpId).toBe("op-abc");
  });

  it("Hai lần bấm liên tiếp cho ra hai trạng thái ngược nhau", () => {
    const on = buildHeartPayload("p", false, "op-3");
    const off = buildHeartPayload("p", true, "op-4");
    expect(on.ops[0]?.mark).toBe("selected");
    expect(off.ops[0]?.mark).toBeNull();
  });
});
