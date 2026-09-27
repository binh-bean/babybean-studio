/**
 * BB-294 (P1, mục cũ #40) — avatar chữ cái đầu trong danh sách Khách hàng
 * (quản trị) trước đây LUÔN xám một màu (`--bb-surface-2`/`--bb-fg-muted`)
 * bất kể khách nào — người chấm độc lập ghi "avatar xám một màu, không theo
 * bảng màu thương hiệu".
 *
 * Canh hai điều bản vá phải giữ đúng:
 *   1. KHÔNG còn một màu duy nhất cho mọi khách (tập nhiều tên phải sinh ra
 *      nhiều hơn một màu).
 *   2. Quyết định (deterministic): cùng một tên luôn ra cùng một màu.
 *
 * Nếu hoàn nguyên bản vá (mọi khách lại dùng chung một cặp màu cố định), ca 1
 * dưới đây phải ĐỎ.
 */

import { describe, it, expect } from "vitest";
import { mauAvatar, mauAvatarStyle, BANG_MAU_AVATAR } from "@/lib/utils/mau-avatar";

describe("BB-294: mauAvatar — bảng màu thương hiệu, không xám một màu", () => {
  it("nhiều tên khách khác nhau sinh ra HƠN MỘT màu (không dồn về một cặp cố định)", () => {
    const ten = [
      "Nguyễn Thị Mai",
      "Trần Thu Hà",
      "Lê Minh Anh",
      "Phạm Ngọc Lan",
      "Võ Thanh Tâm",
      "Đỗ Hải Yến",
      "Hoàng Bảo Châu",
      "Bùi Thu Trang",
    ];
    const mauKhacNhau = new Set(ten.map((t) => mauAvatar(t).bg));
    expect(mauKhacNhau.size).toBeGreaterThan(1);
  });

  it("chỉ dùng token có sẵn trong bảng màu thương hiệu (không bịa hex mới)", () => {
    for (const { bg, fg } of BANG_MAU_AVATAR) {
      expect(bg).toMatch(/^var\(--bb-/);
      expect(fg).toMatch(/^var\(--bb-/);
    }
  });

  it("cùng một tên luôn ra cùng một màu (deterministic)", () => {
    expect(mauAvatar("Nguyễn Thị Mai")).toEqual(mauAvatar("Nguyễn Thị Mai"));
  });

  it("mauAvatarStyle trả object style dùng được cho React (backgroundColor/color)", () => {
    const s = mauAvatarStyle("Nguyễn Thị Mai");
    expect(s).toHaveProperty("backgroundColor");
    expect(s).toHaveProperty("color");
  });
});
