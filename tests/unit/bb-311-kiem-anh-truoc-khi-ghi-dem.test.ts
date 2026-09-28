/**
 * BB-311 (P0, mục 1a) — `kiemAnhTruocKhiGhiDem()` (`src/lib/drive/kiem-tra-anh.ts`).
 *
 * Chốt thứ hai trong đường ghi đệm ảnh: nội dung tải về từ Drive phải LỚN HƠN
 * 1KB và đọc được thành PNG/JPEG/WebP hợp lệ có cạnh > 16px thì mới được ghi
 * vào Storage dùng chung. Đây chính là thứ đáng lẽ đã chặn được PNG trong
 * suốt 78 byte mà mock `/api/img` của phép thử trình duyệt từng ghi đè lên 42
 * ảnh thật (xem báo cáo vận hành vòng 4, §6 "Dữ liệu thật bị phép thử làm
 * bẩn").
 *
 * KIỂM NGƯỢC (chạy tay, dán kết quả vào bàn giao): xoá điều kiện
 * `buffer.byteLength < NGUONG_BYTE_TOI_THIEU` trong `kiemAnhTruocKhiGhiDem` →
 * ca "PNG 78 byte bị từ chối" phải ĐỎ.
 */
import { describe, it, expect } from "vitest";
import { kiemAnhTruocKhiGhiDem } from "@/lib/drive/kiem-tra-anh";
import { pngGiaHopLe, anhGiaQuaNho } from "../fixtures/anh-gia";

function jpegGiaHopLe(rong = 200, cao = 150, damThem = 1200): Uint8Array {
  // SOI (FFD8) + APP0 tối giản + SOF0 (C0) khai đúng width/height + phần đệm.
  const soi = [0xff, 0xd8];
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0Header = [0xff, 0xc0, 0x00, 0x11, 0x08];
  const kichThuoc = [(cao >> 8) & 0xff, cao & 0xff, (rong >> 8) & 0xff, rong & 0xff];
  const conLai = [0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  const dauBai = [...soi, ...app0, ...sof0Header, ...kichThuoc, ...conLai];
  const bytes = new Uint8Array(Math.max(dauBai.length, damThem));
  bytes.set(dauBai, 0);
  return bytes;
}

describe("kiemAnhTruocKhiGhiDem — hai điều kiện, thiếu một là từ chối", () => {
  it("từ chối buffer PNG 78 byte — đúng dạng mock cũ từng ghi đè ảnh thật", () => {
    const kq = kiemAnhTruocKhiGhiDem(anhGiaQuaNho().buffer as ArrayBuffer);
    expect(kq.hopLe).toBe(false);
    expect(kq.lyDo).toBe("qua_nho");
  });

  it("từ chối buffer rỗng", () => {
    const kq = kiemAnhTruocKhiGhiDem(new ArrayBuffer(0));
    expect(kq.hopLe).toBe(false);
    expect(kq.lyDo).toBe("qua_nho");
  });

  it("từ chối nội dung > 1KB nhưng không phải ảnh (vd trang lỗi HTML)", () => {
    const html = "<!doctype html><html><body>lỗi</body></html>".repeat(50); // > 1KB
    const buffer = new TextEncoder().encode(html).buffer as ArrayBuffer;
    expect(buffer.byteLength).toBeGreaterThan(1024);
    const kq = kiemAnhTruocKhiGhiDem(buffer);
    expect(kq.hopLe).toBe(false);
    expect(kq.lyDo).toBe("sai_dinh_dang");
  });

  it("từ chối PNG hợp lệ nhưng kích thước quá nhỏ (10×10, > 1KB đệm)", () => {
    const buf = pngGiaHopLe(10, 10, 1200);
    const kq = kiemAnhTruocKhiGhiDem(buf.buffer as ArrayBuffer);
    expect(kq.hopLe).toBe(false);
    expect(kq.lyDo).toBe("kich_thuoc_qua_nho");
    expect(kq.rong).toBe(10);
    expect(kq.cao).toBe(10);
  });

  it("chấp nhận PNG hợp lệ, kích thước thật (800×533, > 1KB)", () => {
    const buf = pngGiaHopLe(800, 533, 20_000);
    const kq = kiemAnhTruocKhiGhiDem(buf.buffer as ArrayBuffer);
    expect(kq.hopLe).toBe(true);
    expect(kq.rong).toBe(800);
    expect(kq.cao).toBe(533);
  });

  it("chấp nhận JPEG hợp lệ (200×150, > 1KB)", () => {
    const buf = jpegGiaHopLe(200, 150, 1500);
    const kq = kiemAnhTruocKhiGhiDem(buf.buffer as ArrayBuffer);
    expect(kq.hopLe).toBe(true);
    expect(kq.rong).toBe(200);
    expect(kq.cao).toBe(150);
  });

  it("từ chối JPEG kích thước quá nhỏ dù > 1KB (1×1)", () => {
    const buf = jpegGiaHopLe(1, 1, 1500);
    const kq = kiemAnhTruocKhiGhiDem(buf.buffer as ArrayBuffer);
    expect(kq.hopLe).toBe(false);
    expect(kq.lyDo).toBe("kich_thuoc_qua_nho");
  });
});
