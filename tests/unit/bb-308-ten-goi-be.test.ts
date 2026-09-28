/**
 * BB-308 (vòng 4, mục #8 báo cáo chấm 28/09/2026: "Bé Bé Na" lặp ở danh sách
 * bộ ảnh, chi tiết, khách hàng) — `tenGoiBe` (src/lib/utils/dinh-dang.ts) là
 * NGUỒN DUY NHẤT quyết định có thêm tiền tố "Bé " hay không. Trước bản vá,
 * bốn nơi quản trị tự viết `` `Bé ${tenBe}` `` không điều kiện; 5/258 bé thật
 * đã có "Bé" trong `nickname`, nên bốn nơi đó hiện "Bé Bé Na" trong khi bìa
 * gửi khách chỉ in "Bé Na".
 *
 * Bốn ca đề bài yêu cầu đúng nguyên văn: "Na" → "Bé Na", "Bé Na" → "Bé Na",
 * "bé na" → "bé na", rỗng → rỗng.
 *
 * Thước đo AGENTS.md §5a: hoàn nguyên về `` `Bé ${ten}` `` không điều kiện
 * thì ca #2 và #3 dưới đây phải ĐỎ ("Bé Bé Na" !== "Bé Na").
 */

import { describe, it, expect } from "vitest";
import { tenGoiBe } from "@/lib/utils/dinh-dang";

describe("BB-308: tenGoiBe — chỉ thêm 'Bé ' khi tên chưa có sẵn", () => {
  it("tên trần chưa có 'Bé' -> thêm tiền tố", () => {
    expect(tenGoiBe("Na")).toBe("Bé Na");
  });

  it("tên đã có 'Bé' hoa -> giữ nguyên, không lặp", () => {
    expect(tenGoiBe("Bé Na")).toBe("Bé Na");
  });

  it("tên đã có 'bé' thường -> giữ nguyên chữ thường, không tự viết hoa", () => {
    expect(tenGoiBe("bé na")).toBe("bé na");
  });

  it("chuỗi rỗng -> rỗng", () => {
    expect(tenGoiBe("")).toBe("");
  });

  it("null/undefined -> rỗng (không văng lỗi)", () => {
    expect(tenGoiBe(null)).toBe("");
    expect(tenGoiBe(undefined)).toBe("");
  });

  it("khoảng trắng thừa hai đầu bị cắt trước khi so", () => {
    expect(tenGoiBe("  Bé Na  ")).toBe("Bé Na");
    expect(tenGoiBe("  Na  ")).toBe("Bé Na");
  });

  it("tên khác bắt đầu bằng âm tiết gần giống 'Bé' nhưng không phải cả từ -> vẫn thêm tiền tố", () => {
    // "Bean" không phải "Bé" — so khớp CẢ TỪ ĐẦU, không phải tiền tố ký tự.
    expect(tenGoiBe("Bean")).toBe("Bé Bean");
  });
});
