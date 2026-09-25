import { describe, it, expect } from "vitest";
import { readJsonBody } from "@/lib/api-response";

/**
 * BB-223 — hàm đọc thân JSON dùng chung cho mọi route trong src/app/api/**.
 *
 * VÌ SAO cần bốn ca này: trước bản vá, 28 tuyến gọi `await request.json()`
 * trần. Thân rỗng hoặc JSON bị cắt giữa chừng ném SyntaxError không ai bắt,
 * rơi xuống catch ngoài cùng và trả 500 INTERNAL thay vì 400 INVALID_INPUT
 * (thấy thật ở PATCH /api/g/selection ngày 24/09/2026). Ca "không phải
 * object" xác nhận hàm không tự ý gạt JSON hợp lệ nhưng khác hình dạng —
 * việc đó để Zod schema ở từng route tự quyết.
 */
describe("readJsonBody (BB-223)", () => {
  it("JSON hợp lệ (object) -> ok:true kèm đúng dữ liệu", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ ten: "Mai", tuoi: 3 }),
    });

    const result = await readJsonBody<{ ten: string; tuoi: number }>(req);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ ten: "Mai", tuoi: 3 });
    }
  });

  it("thân rỗng -> ok:false, không ném SyntaxError ra ngoài", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: "",
    });

    const result = await readJsonBody(req);

    expect(result.ok).toBe(false);
  });

  it("JSON hỏng (bị cắt giữa chừng) -> ok:false", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: '{"ten": "Mai", "tuoi":',
    });

    const result = await readJsonBody(req);

    expect(result.ok).toBe(false);
  });

  it("JSON hợp lệ nhưng không phải object (chuỗi) -> vẫn ok:true, để schema quyết định hình dạng", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify("chỉ là một chuỗi"),
    });

    const result = await readJsonBody(req);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe("chỉ là một chuỗi");
    }
  });

  it("JSON hợp lệ nhưng là mảng -> vẫn ok:true", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify([1, 2, 3]),
    });

    const result = await readJsonBody(req);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([1, 2, 3]);
    }
  });
});
