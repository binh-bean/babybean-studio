import { describe, expect, it } from "vitest";
import { CAI_DAT_SUA_DUOC } from "@/app/api/admin/settings/schema";

// 29/09: anh dán link Meta "m.me/<số>" (không có https://) và bị báo "không hợp lệ".
const schema = CAI_DAT_SUA_DUOC.find((d) => d.key === "chat.page_url")!.schema;

describe("chat.page_url", () => {
  it("tự thêm https:// cho link m.me dán thiếu", () => {
    expect(schema.parse("m.me/113878833349843")).toBe("https://m.me/113878833349843");
    expect(schema.parse("  m.me/000000000000000  ")).toBe("https://m.me/000000000000000");
  });

  it("giữ nguyên link đã đủ, cho phép để trống", () => {
    expect(schema.parse("https://m.me/000000000000000")).toBe("https://m.me/000000000000000");
    expect(schema.parse("")).toBe("");
  });

  it("vẫn từ chối http:// và chuỗi rác", () => {
    expect(schema.safeParse("http://m.me/000000000000000").success).toBe(false);
    expect(schema.safeParse("javascript://x").success).toBe(false);
  });
});
