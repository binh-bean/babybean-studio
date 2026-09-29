import { describe, expect, it } from "vitest";
import { laChiNhanhCongKhai } from "@/lib/utils/chi-nhanh-cong-khai";

// BB-328 — trang gốc từng hiện "Fixture DANHGIA5-… Chi nhánh" cho khách.
describe("laChiNhanhCongKhai", () => {
  it("loại chi nhánh do phép thử dựng (tên Fixture…)", () => {
    expect(laChiNhanhCongKhai({ name: "Fixture DANHGIA5-0av3qc Chi nhánh", code: "FXDG5-0av3qc" })).toBe(false);
    expect(laChiNhanhCongKhai({ name: "fixture BB-166 abc Chi nhánh", code: null })).toBe(false);
  });

  it("loại theo mã fixture kể cả khi tên không bắt đầu bằng Fixture", () => {
    expect(laChiNhanhCongKhai({ name: "Chi nhánh thử", code: "FIXTURE-BB295-x1" })).toBe(false);
    expect(laChiNhanhCongKhai({ name: "Chi nhánh thử", code: "FX321K-x1" })).toBe(false);
  });

  it("giữ chi nhánh thật, kể cả khi tên có chữ fixture ở giữa", () => {
    expect(laChiNhanhCongKhai({ name: "Chi nhánh Mẫu 1", code: "CN1" })).toBe(true);
    expect(laChiNhanhCongKhai({ name: "Chi nhánh Mẫu 2", code: null })).toBe(true);
    expect(laChiNhanhCongKhai({ name: "Studio Fixtures Lane", code: "SFL" })).toBe(true);
  });

  it("loại chi nhánh không có tên", () => {
    expect(laChiNhanhCongKhai({ name: "  ", code: "CN9" })).toBe(false);
    expect(laChiNhanhCongKhai({ name: null })).toBe(false);
  });
});
