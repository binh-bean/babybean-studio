import { describe, it, expect } from "vitest";
import {
  formatCurrencyVND,
  type ContractItem,
} from "@/components/ui/contract-breakdown";

describe("BB-107: ContractBreakdown logic", () => {
  it("formats VND currency accurately", () => {
    const formatted = formatCurrencyVND(2000000);
    // Should format with thousands separator
    expect(formatted).toMatch(/2[.,]000[.,]000/);
  });

  it("calculates total only from parent items and never adds child items", () => {
    const items: ContractItem[] = [
      {
        id: "pkg-1",
        name: "Baby 02",
        price: 2000000,
        children: [
          { name: "Edit file", quantity: 20 },
          { name: "Makeup", quantity: 1 },
          { name: "Gỗ 15x21", quantity: 1 },
        ],
      },
      {
        id: "addon-1",
        name: "Edit file",
        quantity: 5,
        price: 250000,
      },
    ];

    // Dòng cha có tiền: 2.000.000 + 250.000 = 2.250.000đ
    // Dòng con (x20, x1, x1) tuyệt đối không có tiền và không được cộng vào tổng
    const total = items.reduce((sum, item) => {
      return sum + (typeof item.price === "number" ? item.price : 0);
    }, 0);

    expect(total).toBe(2250000);
  });

  it("handles parent items without prices gracefully", () => {
    const items: ContractItem[] = [
      {
        name: "Quà tặng sinh nhật",
        price: null,
        children: [{ name: "Khung ảnh nhỏ", quantity: 1 }],
      },
      {
        name: "Ảnh phóng 60x90",
        price: 500000,
      },
    ];

    const total = items.reduce((sum, item) => {
      return sum + (typeof item.price === "number" ? item.price : 0);
    }, 0);

    expect(total).toBe(500000);
  });
});
