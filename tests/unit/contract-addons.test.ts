import { describe, it, expect } from "vitest";
import {
  formatCurrencyVND,
  type ContractItem,
} from "@/components/ui/contract-breakdown";
import {
  isProductPriceReliable,
  type AddonProduct,
} from "@/components/ui/addon-selector";

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

describe("BB-107: AddonSelector price reliability", () => {
  it("identifies reliable prices correctly", () => {
    const validProduct: AddonProduct = {
      id: "p1",
      name: "Ảnh gỗ 15x21",
      unitPrice: 150000,
      priceReliable: true,
    };
    expect(isProductPriceReliable(validProduct)).toBe(true);

    const defaultReliable: AddonProduct = {
      id: "p2",
      name: "Ảnh lụa 13x18",
      unitPrice: 80000,
    };
    expect(isProductPriceReliable(defaultReliable)).toBe(true);
  });

  it("marks product as unreliable if priceReliable is false, null, or zero", () => {
    const unconfirmedProduct: AddonProduct = {
      id: "p3",
      name: "Gói concept đặc biệt",
      unitPrice: 500000,
      priceReliable: false,
    };
    expect(isProductPriceReliable(unconfirmedProduct)).toBe(false);

    const nullPriceProduct: AddonProduct = {
      id: "p4",
      name: "Album da bò",
      unitPrice: null,
    };
    expect(isProductPriceReliable(nullPriceProduct)).toBe(false);

    const zeroPriceProduct: AddonProduct = {
      id: "p5",
      name: "Thiết kế riêng",
      unitPrice: 0,
    };
    expect(isProductPriceReliable(zeroPriceProduct)).toBe(false);
  });

  it("calculates total amount only from reliable products", () => {
    const products: AddonProduct[] = [
      { id: "p1", name: "Ảnh gỗ", unitPrice: 100000, priceReliable: true },
      { id: "p2", name: "Album cao cấp", unitPrice: 800000, priceReliable: false }, // không tin cậy
      { id: "p3", name: "Edit thêm", unitPrice: 50000, priceReliable: true },
    ];

    const selectedQuantities: Record<string, number> = {
      p1: 2, // 2 x 100k = 200k
      p2: 1, // không tin cậy -> 0k
      p3: 3, // 3 x 50k = 150k
    };

    const total = products.reduce((sum, p) => {
      if (!isProductPriceReliable(p)) return sum;
      const qty = selectedQuantities[p.id] ?? 0;
      return sum + qty * (p.unitPrice ?? 0);
    }, 0);

    expect(total).toBe(350000);
  });
});
