import { describe, expect, it } from "vitest";
import { laNhanSuThat } from "@/lib/utils/nhan-su-cong-khai";

// BB-354 — màn Nhân sự từng hiện "Fixture DANHGIA5-… Chủ studio".
describe("laNhanSuThat", () => {
  it("ẩn nhân sự do phép thử dựng", () => {
    expect(laNhanSuThat({ fullName: "Fixture DANHGIA5-0av3qc Chủ studio" })).toBe(false);
    expect(laNhanSuThat({ fullName: "Fixture DANHGIA5-0av3qc Quản lý chi nhánh" })).toBe(false);
    expect(laNhanSuThat({ fullName: "  fixture BB-160 abc" })).toBe(false);
  });
  it("giữ nhân viên thật, kể cả khi tên có chữ fixture ở giữa", () => {
    expect(laNhanSuThat({ fullName: "Đỗ Chủ Quán" })).toBe(true);
    expect(laNhanSuThat({ fullName: "Anh Fixture Nguyễn" })).toBe(true);
    expect(laNhanSuThat({ fullName: "Fixtures Lane" })).toBe(true);
  });
});
