/**
 * BB-314 — quyết định "điều hướng 302 sang lh3, hay đi qua proxy" theo width
 * và cờ `qua`.
 *
 * Phép thử THUẦN, không đụng cơ sở dữ liệu, không đụng mạng, không đụng
 * phiên đăng nhập — canh đúng một hàm: `nenDieuHuongLh3(width, taiVe, quaProxy)`
 * trong `src/lib/drive/quyet-dinh-lh3.ts` (tách khỏi route.ts vì Next.js chặn
 * route file export thêm hàm ngoài GET/POST/… — xem chú thích đầu tệp đó).
 * Route `src/app/api/img/[photoId]/route.ts` gọi hàm này SAU KHI xét quyền
 * xong (khối staff/gallery-session) — xem phép thử
 * `tests/security/bb-314-anh-nho-lh3.test.ts` cho phần quyền.
 *
 * KIỂM NGƯỢC (chạy tay theo AGENTS §5a, dán cả hai kết quả vào bàn giao):
 * đổi `nenDieuHuongLh3` trong `src/lib/drive/quyet-dinh-lh3.ts` thành
 * `return false;` (mô phỏng bản vá bị revert — không bao giờ điều hướng nữa)
 * → mọi ca "PHẢI điều hướng" bên dưới phải ĐỎ. Khôi phục lại rồi chạy lại
 * thấy XANH.
 */
import { describe, it, expect } from "vitest";
import { nenDieuHuongLh3 } from "@/lib/drive/quyet-dinh-lh3";

describe("BB-314: nenDieuHuongLh3 — điều hướng lh3 hay đi qua proxy", () => {
  it("w=200 (lưới nhỏ nhất), không tải gốc, không qua=1 -> điều hướng", () => {
    expect(nenDieuHuongLh3(200, false, false)).toBe(true);
  });

  it("w=400, không tải gốc, không qua=1 -> điều hướng", () => {
    expect(nenDieuHuongLh3(400, false, false)).toBe(true);
  });

  it("w=800 (biên trên của cỡ NHỎ), không tải gốc, không qua=1 -> điều hướng", () => {
    expect(nenDieuHuongLh3(800, false, false)).toBe(true);
  });

  it("w=1600 (bìa BB-311) -> KHÔNG điều hướng, dù không tải gốc và không qua=1", () => {
    expect(nenDieuHuongLh3(1600, false, false)).toBe(false);
  });

  it("w=2048 (xem lớn) -> KHÔNG điều hướng", () => {
    expect(nenDieuHuongLh3(2048, false, false)).toBe(false);
  });

  it("w=200 nhưng taiVe=true (?tai=1, tải ảnh gốc) -> KHÔNG điều hướng", () => {
    expect(nenDieuHuongLh3(200, true, false)).toBe(false);
  });

  it("w=800 nhưng taiVe=true -> KHÔNG điều hướng", () => {
    expect(nenDieuHuongLh3(800, true, false)).toBe(false);
  });

  it("w=200 nhưng quaProxy=true (?qua=1, trình duyệt đã thử lh3 lỗi) -> KHÔNG điều hướng", () => {
    expect(nenDieuHuongLh3(200, false, true)).toBe(false);
  });

  it("w=800 nhưng quaProxy=true -> KHÔNG điều hướng", () => {
    expect(nenDieuHuongLh3(800, false, true)).toBe(false);
  });

  it("w=1600, taiVe=true, quaProxy=true cùng lúc -> vẫn KHÔNG điều hướng", () => {
    expect(nenDieuHuongLh3(1600, true, true)).toBe(false);
  });

  it("w=200, taiVe=true và quaProxy=true cùng lúc -> KHÔNG điều hướng (cả hai cờ đều chặn)", () => {
    expect(nenDieuHuongLh3(200, true, true)).toBe(false);
  });
});
