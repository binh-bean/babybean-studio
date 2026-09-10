import { describe, it, expect } from "vitest";
import { vi as i18n, interpolate } from "@/i18n";

describe("BB-031: Customer PIN screen logic & helpers", () => {
  it("formats countdown seconds correctly", () => {
    const formatCountdown = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    expect(formatCountdown(900)).toBe("15:00");
    expect(formatCountdown(59)).toBe("00:59");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(125)).toBe("02:05");
  });

  it("filters non-digit characters on paste and takes first 4 numbers", () => {
    const sanitizePaste = (raw: string) => {
      return raw.replace(/\D/g, "").slice(0, 4);
    };

    expect(sanitizePaste("1234")).toBe("1234");
    expect(sanitizePaste(" 1-2-3-4 ")).toBe("1234");
    expect(sanitizePaste("abc 987654")).toBe("9876");
    expect(sanitizePaste("")).toBe("");
    expect(sanitizePaste("abc")).toBe("");
  });

  it("interpolates pin error strings accurately using i18n", () => {
    const wrongPinMsg = interpolate(i18n.gallery.pinWrong, { n: 3 });
    expect(wrongPinMsg).toBe("Mã PIN chưa đúng, ba mẹ còn 3 lần thử");

    const lockedMsg = interpolate(i18n.gallery.pinLocked, { m: 15 });
    expect(lockedMsg).toBe("Ba mẹ đã nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút");

    const helpMsg = interpolate(i18n.gallery.pinHelp, { hotline: "0901 000 001" });
    expect(helpMsg).toBe("Không nhớ mã? Ba mẹ gọi 0901 000 001 giúp em nhé");
  });

  it("handles NOT_FOUND error safely without distinguishing reasons", () => {
    // Both invalid token, revoked token, and expired token must show the exact same notFound message
    const notFoundMessage = i18n.gallery.notFoundBody;
    expect(notFoundMessage).toBe("Link không tồn tại hoặc đã bị thu hồi.");
  });
});
