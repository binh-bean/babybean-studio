/**
 * Dựng buffer "ảnh giả" dùng trong phép thử — chỉ đúng PHẦN HEADER cần cho
 * `src/lib/drive/kiem-tra-anh.ts` đọc ra kích thước, KHÔNG phải ảnh giải mã
 * được thật (không có IDAT/EOI hợp lệ). Đủ để đi qua chốt "ảnh hợp lệ" của
 * BB-311 mà không cần vẽ ảnh thật.
 *
 * BB-311: sau khi thêm chốt kiểm ảnh trước khi ghi đệm, các phép thử giả lập
 * `driveFetch` trả về một mẩu byte vài chục byte (đủ để qua các phép thử CŨ)
 * giờ sẽ bị chốt mới từ chối (quá nhỏ / không đọc được kích thước). Dùng hàm
 * này thay cho mảng byte tay viết.
 */

/** PNG có IHDR hợp lệ (rộng × cao khai đúng), đệm thêm byte rác cho đủ > 1KB. */
export function pngGiaHopLe(rong = 100, cao = 100, tongByte = 1200): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.max(tongByte, 24));
  const chuKy = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  bytes.set(chuKy, 0);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(8, 13, false); // length khối IHDR (không quan trọng với validator)
  bytes[12] = 0x49; // I
  bytes[13] = 0x48; // H
  bytes[14] = 0x44; // D
  bytes[15] = 0x52; // R
  dv.setUint32(16, rong, false);
  dv.setUint32(20, cao, false);
  return bytes;
}

/** Buffer quá nhỏ / sai định dạng — mô phỏng đúng thứ mock cũ (PNG 78 byte trong suốt) từng ghi vào Storage. */
export function anhGiaQuaNho(): Uint8Array<ArrayBuffer> {
  // PNG chữ ký thật, IHDR khai 10×10 — nhưng CHỈ có 78 byte, dưới ngưỡng 1KB.
  const bytes = pngGiaHopLe(10, 10, 78);
  return bytes;
}
