/**
 * BB-285 — "App nói cùng một sự thật với Lark".
 *
 * Phép thử THUẦN (không I/O) cho ba luật:
 * 1. Nhãn/khoá hiệu lực khi Lark đã sang "Đã chọn hình" (giai đoạn ≥ 2), áp
 *    cho MỌI trạng thái app — không chỉ ba trạng thái cũ (in_retouch/
 *    approved/delivered).
 * 2. Luật 60 ngày (docs/21 GĐ1): biên 59/60/61 ngày.
 * 3. `isGalleryLocked` khi truyền kèm mã Lark: chỉ THÊM lý do khoá, không bao
 *    giờ mở khoá một trạng thái đã khoá theo `LOCKED_STATUSES`.
 *
 * Thước đo (AGENTS.md §5a): hoàn nguyên bản vá BB-285 rồi chạy lại thì các ca
 * dưới đây phải ĐỎ — xem ghi chú "HOÀN NGUYÊN" ở báo cáo bàn giao.
 */

import { describe, it, expect } from "vitest";
import {
  nhanHienThi,
  laKhoaTheoLark,
  qua60NgayFileGoc,
  SO_NGAY_DONG_FILE_GOC,
} from "@/lib/lark/trang-thai-hau-ky";
import { isGalleryLocked, LOCKED_STATUSES, GALLERY_STATUSES } from "@/lib/gallery-status";

// Mã lựa chọn thật của bảng Hậu Kỳ (trang-thai-hau-ky.ts) — dùng đúng mã, vì
// hàm khớp theo mã, không theo tên hiển thị.
const MA_DA_GUI_FILE_GOC = "optDAI9nFV"; // giai đoạn 1
const MA_DA_CHON_HINH = "optl5DyKLx"; // giai đoạn 2
const MA_DANG_LAM = "optmhzW4sL"; // giai đoạn 3
const MA_DA_GIAO = "opttHXFpgy"; // giai đoạn 10

describe("BB-285 — laKhoaTheoLark", () => {
  it("giai đoạn 1 (đã gửi file gốc) CHƯA khoá — khách còn đang chọn", () => {
    expect(laKhoaTheoLark(MA_DA_GUI_FILE_GOC)).toBe(false);
  });

  it("giai đoạn 2 trở lên (đã chọn hình) thì khoá", () => {
    expect(laKhoaTheoLark(MA_DA_CHON_HINH)).toBe(true);
    expect(laKhoaTheoLark(MA_DANG_LAM)).toBe(true);
    expect(laKhoaTheoLark(MA_DA_GIAO)).toBe(true);
  });

  it("chưa đọc được Lark (null/undefined/mã lạ) thì không tự khoá", () => {
    expect(laKhoaTheoLark(null)).toBe(false);
    expect(laKhoaTheoLark(undefined)).toBe(false);
    expect(laKhoaTheoLark("ma-khong-ton-tai")).toBe(false);
  });
});

describe("BB-285 — nhanHienThi áp cho MỌI trạng thái app khi Lark ≥ giai đoạn 2", () => {
  const nhanApp = (s: string) => `[app:${s}]`;

  it("bộ 'ready' (mời chọn) mà Lark đã 'Đã giao' → hiện nhãn theo Lark, không còn 'mời chọn'", () => {
    const r = nhanHienThi("ready", MA_DA_GIAO, nhanApp);
    expect(r.giaiDoan).toBe(10);
    expect(r.khach).not.toBeNull();
    expect(r.quanTri).not.toBe("[app:ready]");
  });

  it("bộ 'in_review' mà Lark đã 'Đang làm' → nhãn theo Lark", () => {
    const r = nhanHienThi("in_review", MA_DANG_LAM, nhanApp);
    expect(r.giaiDoan).toBe(3);
    expect(r.khach).toBe("Đang chỉnh sửa");
  });

  it("bộ 'submitted' mà Lark đã 'Đã chọn hình' → nhãn theo Lark (giai đoạn 2)", () => {
    const r = nhanHienThi("submitted", MA_DA_CHON_HINH, nhanApp);
    expect(r.giaiDoan).toBe(2);
  });

  it("Lark còn giai đoạn 1 (đã gửi file gốc): app 'ready' vẫn giữ nhãn app — chưa có gì để theo", () => {
    const r = nhanHienThi("ready", MA_DA_GUI_FILE_GOC, nhanApp);
    expect(r.giaiDoan).toBeNull();
    expect(r.quanTri).toBe("[app:ready]");
  });

  it("app đã 'delivered' mà Lark còn chậm (< giai đoạn 10) → tin app, không lùi nhãn", () => {
    const r = nhanHienThi("delivered", MA_DANG_LAM, nhanApp);
    expect(r.giaiDoan).toBeNull();
    expect(r.quanTri).toBe("[app:delivered]");
  });
});

describe("BB-285 — luật 60 ngày (docs/21 GĐ1), biên 59/60/61", () => {
  const vaoGiaiDoan1 = new Date("2026-01-01T00:00:00+07:00");

  it("59 ngày: CHƯA quá hạn", () => {
    const homNay = new Date(vaoGiaiDoan1.getTime() + 59 * 86_400_000);
    expect(qua60NgayFileGoc(MA_DA_GUI_FILE_GOC, vaoGiaiDoan1, homNay)).toBe(false);
  });

  it("đúng 60 ngày: CHƯA quá hạn (luật là 'quá 60 ngày', không phải 'đủ 60 ngày')", () => {
    const homNay = new Date(vaoGiaiDoan1.getTime() + SO_NGAY_DONG_FILE_GOC * 86_400_000);
    expect(qua60NgayFileGoc(MA_DA_GUI_FILE_GOC, vaoGiaiDoan1, homNay)).toBe(false);
  });

  it("61 ngày: ĐÃ quá hạn", () => {
    const homNay = new Date(vaoGiaiDoan1.getTime() + 61 * 86_400_000);
    expect(qua60NgayFileGoc(MA_DA_GUI_FILE_GOC, vaoGiaiDoan1, homNay)).toBe(true);
  });

  it("giai đoạn khác 1 (đã chọn hình) thì luật này không áp, dù đã rất lâu", () => {
    const homNay = new Date(vaoGiaiDoan1.getTime() + 200 * 86_400_000);
    expect(qua60NgayFileGoc(MA_DA_CHON_HINH, vaoGiaiDoan1, homNay)).toBe(false);
  });

  it("chưa biết mốc vào giai đoạn (tu = null) thì KHÔNG coi là quá hạn", () => {
    expect(qua60NgayFileGoc(MA_DA_GUI_FILE_GOC, null, new Date())).toBe(false);
  });
});

describe("BB-285 — isGalleryLocked(status, larkMa) chỉ THÊM lý do khoá", () => {
  it("trạng thái app đã khoá sẵn (LOCKED_STATUSES) thì vẫn khoá dù không truyền larkMa", () => {
    for (const s of LOCKED_STATUSES) {
      expect(isGalleryLocked(s)).toBe(true);
    }
  });

  it("app 'ready' + Lark 'Đã chọn hình' → khoá (đây là điểm chính BB-285 sửa)", () => {
    expect(isGalleryLocked("ready", MA_DA_CHON_HINH)).toBe(true);
  });

  it("app 'ready' + Lark 'Đã gửi file gốc' (giai đoạn 1) → CHƯA khoá", () => {
    expect(isGalleryLocked("ready", MA_DA_GUI_FILE_GOC)).toBe(false);
  });

  it("app 'ready' + không có mã Lark → hành vi y hệt trước BB-285 (không khoá)", () => {
    expect(isGalleryLocked("ready")).toBe(false);
    expect(isGalleryLocked("ready", null)).toBe(false);
  });

  it("không trạng thái app hợp lệ nào bị MỞ khoá bởi mã Lark", () => {
    // Bảng Lark × app đầy đủ: với mọi trạng thái app đã khoá, truyền thêm bất
    // kỳ mã Lark nào (kể cả giai đoạn 1, kể cả rỗng) vẫn phải khoá.
    const maLarkThu = [null, MA_DA_GUI_FILE_GOC, MA_DA_CHON_HINH, MA_DA_GIAO];
    for (const s of GALLERY_STATUSES) {
      if (!LOCKED_STATUSES.includes(s as (typeof LOCKED_STATUSES)[number])) continue;
      for (const ma of maLarkThu) {
        expect(isGalleryLocked(s, ma)).toBe(true);
      }
    }
  });
});
