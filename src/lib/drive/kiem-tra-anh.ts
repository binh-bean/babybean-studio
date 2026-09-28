/**
 * Kiểm nội dung tải về từ Drive có ĐÁNG ghi vào bộ đệm ảnh dùng chung
 * (Supabase Storage, bucket `thumbnails`) hay không — trước khi ghi.
 *
 * OWNER: DEV-INT. Task BB-311 (P0).
 *
 * ---------------------------------------------------------------------------
 * Vì sao cần chốt này
 * ---------------------------------------------------------------------------
 * 28/09/2026: mock `/api/img` của phép thử trình duyệt (Playwright, chạy
 * `next dev` — không có `VITEST`, không nhận diện được bằng `dangChayPhepThu()`)
 * trả về một PNG trong suốt 10×10 (78 byte) cho MỌI lượt gọi Drive. Đường ghi
 * đệm cũ không kiểm nội dung — cứ tải được là ghi — nên 42 ảnh đệm của 19 bộ
 * ảnh THẬT (20 là ảnh bìa) bị THAY bằng ô trống trong suốt.
 *
 * Chốt "đang chạy phép thử" (`src/lib/kiem-thu.ts`) chặn được phần lớn
 * trường hợp, nhưng đây là lớp phòng thủ THỨ HAI, độc lập: bắt luôn cả
 * trường hợp Drive (thật) trả về nội dung lỗi (trang HTML báo lỗi, ảnh rỗng,
 * v.v.) mà `driveFetch` vẫn coi là phản hồi `ok`.
 *
 * Hai điều kiện, HOẶC là bị từ chối:
 *   1. Nội dung nhỏ hơn 1 KB — mọi ảnh thumbnail thật (kể cả cỡ 200w) đo được
 *      tối thiểu ~18,8 KB (xem báo cáo vận hành vòng 4, §5).
 *   2. Không đọc được thành PNG/JPEG/WebP hợp lệ có cạnh (rộng và cao) đều
 *      lớn hơn 16px — chặn ảnh 1×1 hay icon lỗi giả dạng ảnh thật.
 */

const NGUONG_BYTE_TOI_THIEU = 1024; // 1 KB
const NGUONG_PX_TOI_THIEU = 16;

export interface KetQuaKiemAnh {
  hopLe: boolean;
  lyDo?: "qua_nho" | "sai_dinh_dang" | "kich_thuoc_qua_nho";
  rong?: number;
  cao?: number;
}

function docKichThuocPNG(bytes: Uint8Array): { rong: number; cao: number } | null {
  // Chữ ký PNG (8 byte) rồi chunk IHDR: length(4) + "IHDR"(4) + width(4) + height(4), big-endian.
  if (bytes.length < 24) return null;
  const chuKy = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (bytes[i] !== chuKy[i]) return null;
  if (!(bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { rong: dv.getUint32(16, false), cao: dv.getUint32(20, false) };
}

function docKichThuocJPEG(bytes: Uint8Array): { rong: number; cao: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    // `offset + 4 <= bytes.length` ở đầu vòng lặp đảm bảo offset+1 trong biên —
    // `?? 0` chỉ để thoả noUncheckedIndexedAccess, không đổi hành vi thật.
    const marker = bytes[offset + 1] ?? 0;
    // SOI/EOI và RSTn không mang trường length — chỉ 2 byte, bỏ qua.
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) return null;
    const segLen = dv.getUint16(offset + 2, false);
    // SOFn (0-15) TRỪ DHT(C4), JPG(C8), DAC(CC) — những marker mang kích thước ảnh.
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      if (offset + 9 > bytes.length) return null;
      const cao = dv.getUint16(offset + 5, false);
      const rong = dv.getUint16(offset + 7, false);
      return { rong, cao };
    }
    if (marker === 0xda) return null; // SOS — hết phần header, không có SOF trước đó
    offset += 2 + segLen;
  }
  return null;
}

function docKichThuocWebP(bytes: Uint8Array): { rong: number; cao: number } | null {
  if (bytes.length < 30) return null;
  if (!(bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)) return null; // "RIFF"
  if (!(bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)) return null; // "WEBP"
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fourcc = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);

  if (fourcc === "VP8X") {
    // width-1, height-1: mỗi cái 3 byte little-endian, ở offset 24 và 27.
    const rong = (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)) + 1;
    const cao = (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)) + 1;
    return { rong, cao };
  }
  if (fourcc === "VP8 ") {
    // Lossy đơn giản: start code 3 byte (9d 01 2a) ở offset 23, rồi width/height 14-bit LE.
    if (!(bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)) return null;
    const rong = dv.getUint16(26, true) & 0x3fff;
    const cao = dv.getUint16(28, true) & 0x3fff;
    return { rong, cao };
  }
  if (fourcc === "VP8L") {
    // Lossless: byte chữ ký 0x2f ở offset 20, rồi 14-bit width-1 + 14-bit height-1.
    if (bytes[20] !== 0x2f) return null;
    const bits =
      (bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8) | ((bytes[23] ?? 0) << 16) | ((bytes[24] ?? 0) << 24);
    const rong = (bits & 0x3fff) + 1;
    const cao = ((bits >>> 14) & 0x3fff) + 1;
    return { rong, cao };
  }
  return null;
}

/** Kiểm một buffer tải về từ Drive trước khi cho phép ghi vào bộ đệm Storage. */
export function kiemAnhTruocKhiGhiDem(buffer: ArrayBuffer): KetQuaKiemAnh {
  if (buffer.byteLength < NGUONG_BYTE_TOI_THIEU) {
    return { hopLe: false, lyDo: "qua_nho" };
  }
  const bytes = new Uint8Array(buffer);
  const kt = docKichThuocPNG(bytes) ?? docKichThuocJPEG(bytes) ?? docKichThuocWebP(bytes);
  if (!kt) return { hopLe: false, lyDo: "sai_dinh_dang" };
  if (kt.rong <= NGUONG_PX_TOI_THIEU || kt.cao <= NGUONG_PX_TOI_THIEU) {
    return { hopLe: false, lyDo: "kich_thuoc_qua_nho", rong: kt.rong, cao: kt.cao };
  }
  return { hopLe: true, rong: kt.rong, cao: kt.cao };
}
