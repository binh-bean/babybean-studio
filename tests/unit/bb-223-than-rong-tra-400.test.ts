import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/g/selection/route";

/**
 * BB-223 — thân yêu cầu rỗng/hỏng phải trả 400 INVALID_INPUT, không phải 500.
 *
 * VÌ SAO: trước bản vá, `PATCH /api/g/selection` gọi `await request.json()`
 * trần ở bước "1. Parse". Thân rỗng (yêu cầu bị cắt giữa chừng, hoặc lỗi
 * client gửi `Content-Length: 0`) ném SyntaxError "Unexpected end of JSON
 * input" — không route nào bắt riêng, rơi xuống catch ngoài cùng, ghi log
 * `unhandled_error` và trả 500 INTERNAL. Thấy thật ngày 24/09/2026.
 *
 * Ca này gọi thẳng route handler với thân rỗng. Bước Parse đứng TRƯỚC bước
 * Authenticate trong route (xem comment "1. Parse" / "2. Authenticate" trong
 * route.ts), nên phép thử này không cần mock phiên đăng nhập — nếu route lỡ
 * đổi thứ tự và parse rơi xuống sau xác thực, phép thử sẽ đỏ vì lý do khác
 * (401 thay vì 400), báo cho người sửa biết trật tự đã đổi.
 */
describe("PATCH /api/g/selection — thân hỏng (BB-223)", () => {
  it("thân rỗng -> 400 INVALID_INPUT, không phải 500", async () => {
    const req = new NextRequest("http://localhost/api/g/selection", {
      method: "PATCH",
      body: "",
    });

    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("INVALID_INPUT");
  });

  it("JSON bị cắt giữa chừng -> 400 INVALID_INPUT, không phải 500", async () => {
    const req = new NextRequest("http://localhost/api/g/selection", {
      method: "PATCH",
      body: '{"clientOpId": "abc", "ops": [',
    });

    const res = await PATCH(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe("INVALID_INPUT");
  });
});
