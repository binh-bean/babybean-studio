/**
 * BB-216 — trang gốc theo chuẩn thiết kế mới.
 *
 * Hai điều ca này canh:
 * 1. Hàm thuần đọc `chat.page_url` — chỉ nhận `https://`, mọi trường hợp
 *    khác (rỗng, `http://`, thiếu cấu hình) trả `null` để nút "Nhắn cho
 *    studio" ẨN thay vì trỏ tới `https://m.me/` (lỗi bản cũ mắc phải).
 * 2. Mã nguồn trang gốc không còn chuỗi cứng "https://m.me/" — quét trực
 *    tiếp tệp nguồn để chốt chặn ai đó lỡ thêm lại đường tắt này.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { duongNhanTinTuCaiDat } from "@/lib/lien-lac/duong-nhan-tin";

describe("BB-216: duongNhanTinTuCaiDat", () => {
  it("https hợp lệ thì trả đúng địa chỉ", () => {
    expect(duongNhanTinTuCaiDat("https://m.me/babybean.hauky")).toBe(
      "https://m.me/babybean.hauky",
    );
  });

  it("rỗng thì trả null (nút ẩn, không phải lỗi nhập liệu)", () => {
    expect(duongNhanTinTuCaiDat("")).toBeNull();
  });

  it("http:// (không mã hoá) thì trả null", () => {
    expect(duongNhanTinTuCaiDat("http://m.me/babybean.hauky")).toBeNull();
  });

  it("thiếu cấu hình (null/undefined từ cột value chưa có dòng) thì trả null", () => {
    expect(duongNhanTinTuCaiDat(null)).toBeNull();
    expect(duongNhanTinTuCaiDat(undefined)).toBeNull();
  });

  it("kiểu không phải chuỗi (vd. số hoặc object từ jsonb lỗi) thì trả null", () => {
    expect(duongNhanTinTuCaiDat(123)).toBeNull();
    expect(duongNhanTinTuCaiDat({ url: "https://m.me/x" })).toBeNull();
  });

  // Kiểm ngược: chốt chặn bằng cách gọi lại chính hàm khoá cửa của luật này —
  // nếu ai đó nới lỏng thành cho phép http:// thì URL rác này sẽ lọt qua.
  it("kiểm ngược — chuỗi bắt đầu bằng http:// (không phải https://) không bao giờ lọt qua dù case khác", () => {
    const cacTruongHopXau = ["http://m.me/x", "ftp://m.me/x", "m.me/x", "  https://m.me/x"];
    for (const xau of cacTruongHopXau) {
      expect(duongNhanTinTuCaiDat(xau)).toBeNull();
    }
  });
});

describe("BB-216: trang gốc không còn chuỗi cứng https://m.me/", () => {
  it("quét mã nguồn trang gốc — không còn m.me cứng, đọc từ settings.chat.page_url", () => {
    const duongDan = join(process.cwd(), "src/app/(customer)/page.tsx");
    const noiDung = readFileSync(duongDan, "utf-8");

    expect(noiDung).not.toContain("https://m.me/");
    expect(noiDung).toContain("getChatPageUrl");
  });
});
