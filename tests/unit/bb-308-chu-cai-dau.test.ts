/**
 * BB-308 (bản vẽ BB-301 khach-hang.html, admin duyệt 28/09/2026) —
 * `chuCaiDau` (avatar khách hàng, customers-manager.tsx) trước đây (BB-294)
 * ghép HAI chữ cái: đầu HỌ + đầu TÊN ("Nguyễn Thị Mai" → "NM"). Bản vẽ
 * khách hàng đã duyệt chỉ vẽ MỘT chữ cho mỗi avatar — đúng chữ cái đầu của
 * TÊN GỌI (chữ cuối cùng trong họ tên đầy đủ): "Nguyễn Thị Mai" → "M",
 * "Trần Thu Hà" → "H". Không có phép thử nào của BB-294 từng canh riêng
 * logic của hàm này (bb-294-mau-avatar.test.ts chỉ canh MÀU nền, băm trên
 * cả chuỗi tên — không đụng `chuCaiDau`), nên đây là lần đầu hàm có phép
 * thử trực tiếp.
 *
 * Thước đo AGENTS.md §5a: hoàn nguyên về `(dau + cuoi).toUpperCase()` (bản
 * BB-294 cũ) thì ca đầu tiên dưới đây phải ĐỎ ("NM" !== "M").
 */

import { describe, it, expect } from "vitest";
import { chuCaiDau } from "@/components/features/admin/customers-manager";

describe("BB-308: chuCaiDau — một chữ cái của tên gọi (chữ cuối họ tên)", () => {
  it("họ tên ba từ trở lên -> chữ cái đầu của TỪ CUỐI, không phải họ", () => {
    expect(chuCaiDau("Nguyễn Thị Mai")).toBe("M");
    expect(chuCaiDau("Trần Thu Hà")).toBe("H");
    expect(chuCaiDau("Hoàng Bảo Châu")).toBe("C");
  });

  it("họ tên hai từ -> chữ cái đầu của từ thứ hai (vẫn là từ cuối)", () => {
    expect(chuCaiDau("Lê Anh")).toBe("A");
  });

  it("một từ duy nhất -> chữ cái đầu của chính từ đó", () => {
    expect(chuCaiDau("Mai")).toBe("M");
  });

  it("luôn viết hoa, kể cả khi nhập thường", () => {
    expect(chuCaiDau("nguyễn thị mai")).toBe("M");
  });

  it("khoảng trắng thừa ở hai đầu hoặc giữa không làm sai từ cuối", () => {
    expect(chuCaiDau("  Nguyễn   Thị   Mai  ")).toBe("M");
  });

  it("chuỗi rỗng hoặc chỉ khoảng trắng -> '?'", () => {
    expect(chuCaiDau("")).toBe("?");
    expect(chuCaiDau("   ")).toBe("?");
  });
});
