/**
 * BB-063 — tên tài khoản nội bộ cho nhân viên không dùng email.
 *
 * Chỗ dễ sai nhất trong tính năng này là hàm ghép: một màn đăng nhập phải nhận
 * cả `linh.q1` lẫn `linh.q1@gmail.com`, và nếu ghép nhầm thì người ta gõ đúng
 * mật khẩu vẫn không vào được, mà thông báo lỗi lại nói là sai mật khẩu.
 */

import { describe, it, expect } from "vitest";
import {
  toAuthEmail,
  toDisplayIdentifier,
  isValidUsername,
  normalizeUsername,
  passwordProblem,
  STAFF_DOMAIN,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth/username";

describe("BB-063 — tên tài khoản", () => {
  it("tên tài khoản được ghép tên miền nội bộ", () => {
    expect(toAuthEmail("linh.q1")).toBe(`linh.q1@${STAFF_DOMAIN}`);
  });

  it("email thật thì giữ nguyên, không ghép gì thêm", () => {
    expect(toAuthEmail("linh@gmail.com")).toBe("linh@gmail.com");
  });

  it("gõ hoa hay có khoảng trắng thừa vẫn ra cùng một tài khoản", () => {
    expect(toAuthEmail("  Linh.Q1 ")).toBe(`linh.q1@${STAFF_DOMAIN}`);
    expect(toAuthEmail("LINH@Gmail.COM")).toBe("linh@gmail.com");
  });

  it("ghép rồi tách lại thì về đúng cái đã nhập", () => {
    expect(toDisplayIdentifier(toAuthEmail("phuc.td"))).toBe("phuc.td");
  });

  it("email thật hiển thị nguyên vẹn, không bị cắt mất tên miền", () => {
    expect(toDisplayIdentifier("chu@babybeanstudio.vn")).toBe("chu@babybeanstudio.vn");
  });

  it("chấp nhận chữ thường, số, chấm, gạch", () => {
    for (const name of ["linh", "linh.q1", "phuc_td", "anh-thu", "cs01"]) {
      expect(isValidUsername(name), name).toBe(true);
    }
  });

  it("từ chối tên có dấu, có khoảng trắng, bắt đầu bằng số, hoặc quá ngắn", () => {
    // Tiếng Việt có dấu không đi qua được địa chỉ email sinh ra từ nó.
    for (const name of ["Linh", "phúc", "hai ba", "1linh", "ab", "a".repeat(31), "cs@q1"]) {
      expect(isValidUsername(name), name).toBe(false);
    }
  });

  it("normalize không tự ý bỏ ký tự, chỉ hạ chữ và cắt khoảng trắng", () => {
    expect(normalizeUsername("  Cs@Q1  ")).toBe("cs@q1");
  });
});

describe("BB-063 — mật khẩu", () => {
  it("dưới 10 ký tự bị từ chối", () => {
    expect(passwordProblem("a".repeat(MIN_PASSWORD_LENGTH - 1))).toContain("10");
  });

  it("đủ 10 ký tự thì nhận", () => {
    expect(passwordProblem("chupanhbe2026")).toBeNull();
  });

  it("toàn số bị từ chối kể cả khi đủ dài", () => {
    // Ngày sinh và số điện thoại là hai thứ người ta hay gõ vào đây nhất.
    expect(passwordProblem("0901234567")).not.toBeNull();
  });
});
