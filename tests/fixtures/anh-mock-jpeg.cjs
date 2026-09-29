/**
 * Sinh ảnh JPEG "giống thật" cho phép thử BB-316 — vòng 5.
 *
 * OWNER: QA-BOT. Chỉ dùng trong tests/**, không phải mã sản phẩm.
 *
 * Yêu cầu rubric §4: ảnh mock Drive phải là JPEG trung tính (không người),
 * 60–135 KB, không phải ô xám. Một gradient trơn nén xuống ~13 KB (quá nhỏ,
 * "phẳng" khác hẳn ảnh thật) — nên phủ thêm một lớp nhiễu (noise) độ mờ thấp
 * lên trên gradient trước khi nén JPEG, để histogram giống ảnh chụp thật và
 * dung lượng rơi đúng khoảng 60–135 KB ở kích thước gốc ~1500×1000.
 *
 * `sharp` đã có sẵn trong node_modules (phụ thuộc bắc cầu của một gói khác),
 * KHÔNG phải dependency của app — chỉ dùng ở đây, trong hạ tầng phép thử.
 */

const sharp = require("sharp");

const MAU = [
  ["#F3E6DC", "#E8A598", "#C4645A"],
  ["#EEF1EA", "#7FA99B", "#4F5B45"],
  ["#F7EFE6", "#D9C2A7", "#8C6E54"],
  ["#EDE7F0", "#C9B7CF", "#7E6A86"],
  ["#F1ECE4", "#B9C8C0", "#6F8C80"],
  ["#FBF3EC", "#EBC3A6", "#B7866A"],
];

function seedTuHex(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function svgNen(seed, w, h) {
  const [a, b, c] = MAU[seed % MAU.length];
  const r = (n) => ((seed * (n * 7 + 3)) % 100) / 100;
  // Nền dịu + ba mảng màu nhoè lớn (màu nước trừu tượng) — KHÔNG có hình tròn/elip
  // riêng lẻ vì chúng trông như đầu và thân người.
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.round(Math.min(w, h) * 0.09)}"/></filter>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#D9C6B0"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<g filter="url(#b)">
<ellipse cx="${w * (0.15 + r(1) * 0.3)}" cy="${h * (0.15 + r(2) * 0.3)}" rx="${w * 0.28}" ry="${h * 0.16}" fill="${b}"/>
<ellipse cx="${w * (0.55 + r(3) * 0.3)}" cy="${h * (0.55 + r(4) * 0.3)}" rx="${w * 0.32}" ry="${h * 0.18}" fill="${c}" opacity="0.8"/>
<ellipse cx="${w * (0.2 + r(5) * 0.3)}" cy="${h * 0.88}" rx="${w * 0.3}" ry="${h * 0.1}" fill="#FFFFFF" opacity="0.7"/>
</g></svg>`,
  );
}

async function lopNhieu(w, h) {
  const div = 10;
  const nw = Math.max(2, Math.round(w / div));
  const nh = Math.max(2, Math.round(h / div));
  const noise = Buffer.alloc(nw * nh);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(Math.random() * 256);
  return sharp(noise, { raw: { width: nw, height: nh, channels: 1 } })
    .resize(w, h, { kernel: "cubic" })
    .jpeg()
    .toBuffer();
}

const dem = new Map();

/**
 * Trả JPEG buffer trung tính, kích thước gốc mặc định (không người), cỡ
 * 60–135 KB ở 1500×1000/1000×1500. Cỡ nhỏ hơn (thumbnail) tự nhiên nhẹ hơn —
 * hợp lý với ảnh thật, không cần ép về đúng khoảng cho mọi cỡ.
 *
 * Có bộ nhớ đệm theo (driveFileId, w, h) trong tiến trình — tránh sinh lại ảnh
 * mỗi khi trình duyệt xin lại đúng một ảnh (cuộn qua cuộn lại).
 */
async function taoAnhJpeg(driveFileId, w, h) {
  const key = `${driveFileId}:${w}x${h}`;
  if (dem.has(key)) return dem.get(key);

  const seed = seedTuHex(driveFileId || "x");
  const nen = svgNen(seed, w, h);
  const noiseBuf = await lopNhieu(w, h);
  const quality = 54 + (seed % 8);
  const buf = await sharp(nen)
    .composite([{ input: noiseBuf, blend: "soft-light" }])
    .jpeg({ quality })
    .toBuffer();

  dem.set(key, buf);
  return buf;
}

/** Chiều rộng/cao "gốc" hợp lý cho một driveFileId — dùng khi request là =s0 (ảnh gốc). */
function kichThuocGoc(driveFileId) {
  // Khớp ĐÚNG hướng ảnh trong CSDL fixture: id có dạng dg5-<run>-<bộ>-<x>, x%6==2 là ảnh NGANG.
  const m = /-(\d+)$/.exec(driveFileId || "");
  const ngang = m ? parseInt(m[1], 10) % 6 === 2 : seedTuHex(driveFileId || "x") % 20 < 3;
  return ngang ? { w: 1500, h: 1000 } : { w: 1000, h: 1500 };
}

module.exports = { taoAnhJpeg, kichThuocGoc, seedTuHex };
