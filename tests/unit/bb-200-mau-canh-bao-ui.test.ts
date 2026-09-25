/**
 * BB-200 (3/3) — canhBaoUi() nối mã màu (xanh/cam/đỏ/tím) sang token CSS + chữ.
 *
 * KIỂM NGƯỢC đã chạy tay: xoá nhánh "tim" khỏi BANG trong
 * src/lib/lark/mau-canh-bao-ui.ts → test "bốn mức đều có nhãn" ĐỎ đúng lý do
 * (TypeError: Cannot read properties of undefined), rồi hoàn lại bằng Edit.
 */

import { describe, it, expect } from "vitest";
import { canhBaoUi } from "@/lib/lark/mau-canh-bao-ui";

describe("BB-200: canhBaoUi", () => {
  it("null (chưa đọc được Lark) thì không vẽ chấm", () => {
    expect(canhBaoUi(null)).toBeNull();
  });

  it("bốn mức đều có nhãn và dùng đúng token màu đã khai trong tokens.css", () => {
    expect(canhBaoUi("xanh")).toEqual({ mauToken: "var(--bb-success)", nhan: "An toàn" });
    expect(canhBaoUi("cam")).toEqual({ mauToken: "var(--bb-warning)", nhan: "Cảnh báo" });
    expect(canhBaoUi("do")).toEqual({ mauToken: "var(--bb-danger)", nhan: "Nguy hiểm" });
    expect(canhBaoUi("tim")).toEqual({
      mauToken: "var(--bb-urgent)",
      nhan: "Phải xong trong ngày",
    });
  });

  it("mỗi mức có một token màu KHÁC NHAU — hai mức trùng token là chấm không phân biệt được", () => {
    const tokens = (["xanh", "cam", "do", "tim"] as const).map((m) => canhBaoUi(m)?.mauToken);
    expect(new Set(tokens).size).toBe(4);
  });
});
