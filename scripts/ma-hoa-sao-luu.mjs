#!/usr/bin/env node
/**
 * ma-hoa-sao-luu — mã hoá / giải mã tệp sao lưu (.sql do scripts/backup.mjs
 * kết xuất) bằng một mật khẩu (passphrase), không phụ thuộc nhị phân ngoài.
 *
 * OWNER: DEV-OPS. Task BB-273. Spec: docs/24-sao-luu-tu-dong.md.
 *
 * ---------------------------------------------------------------------------
 * Vì sao cần cái này
 * ---------------------------------------------------------------------------
 * Repo `binh-bean/babybean-studio` là CÔNG KHAI: log của GitHub Actions ai
 * cũng xem được, artifact của Actions thì ai đăng nhập GitHub cũng tải được
 * (kể cả người không có quyền gì trên repo). Tệp `scripts/backup.mjs` kết
 * xuất chứa tên và số điện thoại khách hàng thật — nên tệp đó KHÔNG BAO GIỜ
 * được rời máy dưới dạng đọc được. Script này mã hoá nó trước khi
 * `sao-luu.yml` đăng lên artifact.
 *
 * ---------------------------------------------------------------------------
 * Định dạng tệp mã hoá
 * ---------------------------------------------------------------------------
 * Tệp ra là nhị phân, gồm:
 *   [8 byte magic "BBSAOLUU"] [1 byte phiên bản = 1]
 *   [16 byte salt scrypt]     [12 byte iv GCM]
 *   [16 byte auth tag GCM]    [phần còn lại: ciphertext của bản gzip]
 *
 * Có magic + phiên bản để về sau đổi tham số (vd tăng N của scrypt) mà đọc
 * lại tệp cũ vẫn biết cách giải. AES-256-GCM cho cả bí mật lẫn toàn vẹn: sai
 * một byte hay sai mật khẩu đều lộ ra ở bước xác thực tag, không âm thầm ra
 * một tệp .sql hỏng trông như thật.
 *
 * Nén gzip TRƯỚC khi mã hoá (không phải sau): ciphertext trông ngẫu nhiên
 * tuyệt đối, nén sau khi mã hoá gần như không ăn thua.
 *
 * ---------------------------------------------------------------------------
 * Vì sao scrypt, vì sao N ≥ 2^15
 * ---------------------------------------------------------------------------
 * Mật khẩu do chủ studio tự đặt — không phải một khoá 256-bit ngẫu nhiên.
 * scrypt cố ý CHẬM và TỐN BỘ NHỚ để một lượt dò mật khẩu trên phần cứng dò
 * hàng loạt (GPU/ASIC) không rẻ hơn dò trên máy thường bao nhiêu. N = 2^15 mất
 * cỡ vài trăm mili-giây trên máy thường — chấp nhận được cho một lượt sao lưu
 * mỗi ngày, quá chậm để dò được hàng triệu lần.
 *
 * ---------------------------------------------------------------------------
 * Cách dùng
 * ---------------------------------------------------------------------------
 *   BACKUP_PASSPHRASE="..." node scripts/ma-hoa-sao-luu.mjs ma-hoa <vào> <ra>
 *   BACKUP_PASSPHRASE="..." node scripts/ma-hoa-sao-luu.mjs giai-ma <vào> <ra>
 *
 * `npm run db:giai-ma -- <vào> <ra>` gọi lại đúng lệnh giai-ma, để chủ studio
 * không phải nhớ tên tệp script.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

const MAGIC = Buffer.from("BBSAOLUU", "utf8"); // 8 byte
const PHIEN_BAN = 1;
const DO_DAI_SALT = 16;
const DO_DAI_IV = 12;
const DO_DAI_TAG = 16;
const SCRYPT_N = 1 << 15; // 32768, "N ≥ 2^15"
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const DO_DAI_KHOA = 32; // AES-256
const DO_DAI_MK_TOI_THIEU = 20;

function layMatKhau() {
  const mk = process.env.BACKUP_PASSPHRASE;
  if (!mk || mk.length < DO_DAI_MK_TOI_THIEU) {
    throw new LoiRoRang(
      [
        `Biến BACKUP_PASSPHRASE thiếu hoặc quá ngắn (< ${DO_DAI_MK_TOI_THIEU} ký tự).`,
        "",
        "Đặt mật khẩu dài ít nhất 20 ký tự vào biến môi trường BACKUP_PASSPHRASE",
        "rồi chạy lại. Mật khẩu ngắn dò được nhanh hơn nhiều so với 20 ký tự.",
      ].join("\n"),
    );
  }
  return mk;
}

/** Lỗi đã có thông điệp tiếng Việt rõ ràng — main() chỉ in message, không in stack. */
class LoiRoRang extends Error {}

function danKhoa(matKhau, salt) {
  return crypto.scryptSync(matKhau, salt, DO_DAI_KHOA, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    // scrypt cần bộ nhớ ~ 128 * N * r byte; mặc định của Node giới hạn thấp hơn
    // mức N=2^15, r=8 cần (~32MB), nên phải nới maxmem.
    maxmem: 256 * 1024 * 1024,
  });
}

function ghiTepAnToan(duongRa, buf) {
  // Ghi ra tệp tạm rồi đổi tên: tránh để lại một tệp ra dở dang nếu tiến
  // trình bị ngắt giữa chừng khi đang ghi.
  const tamThoi = `${duongRa}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(duongRa), { recursive: true });
  fs.writeFileSync(tamThoi, buf);
  fs.renameSync(tamThoi, duongRa);
}

function xoaTepDoDang(duong) {
  try {
    if (duong && fs.existsSync(duong)) fs.rmSync(duong, { force: true });
  } catch {
    // best-effort — không phải lỗi chính cần báo
  }
}

function maHoa(duongVao, duongRa) {
  const matKhau = layMatKhau();
  if (!fs.existsSync(duongVao)) {
    throw new LoiRoRang(`Không thấy tệp vào: ${duongVao}`);
  }

  const banRo = fs.readFileSync(duongVao);
  const banNen = zlib.gzipSync(banRo, { level: 9 });

  const salt = crypto.randomBytes(DO_DAI_SALT);
  const iv = crypto.randomBytes(DO_DAI_IV);
  const khoa = danKhoa(matKhau, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", khoa, iv);
  const maHoaXong = Buffer.concat([cipher.update(banNen), cipher.final()]);
  const tag = cipher.getAuthTag();

  const dauDe = Buffer.concat([
    MAGIC,
    Buffer.from([PHIEN_BAN]),
    salt,
    iv,
    tag,
  ]);
  const tepRa = Buffer.concat([dauDe, maHoaXong]);

  const tamThoi = `${duongRa}.tmp-${process.pid}`;
  try {
    ghiTepAnToan(duongRa, tepRa);
  } catch (e) {
    xoaTepDoDang(tamThoi);
    xoaTepDoDang(duongRa);
    throw e;
  }

  return { vaoByte: banRo.length, raByte: tepRa.length };
}

function giaiMa(duongVao, duongRa) {
  const matKhau = layMatKhau();
  if (!fs.existsSync(duongVao)) {
    throw new LoiRoRang(`Không thấy tệp vào: ${duongVao}`);
  }

  const tep = fs.readFileSync(duongVao);
  const doDaiDauDe = MAGIC.length + 1 + DO_DAI_SALT + DO_DAI_IV + DO_DAI_TAG;
  if (tep.length < doDaiDauDe) {
    throw new LoiRoRang(
      `Tệp quá ngắn hoặc hỏng, không phải tệp do ma-hoa-sao-luu tạo ra: ${duongVao}`,
    );
  }

  let vt = 0;
  const magic = tep.subarray(vt, vt + MAGIC.length);
  vt += MAGIC.length;
  if (!magic.equals(MAGIC)) {
    throw new LoiRoRang(
      `Không nhận ra đầu tệp (magic) — tệp này không phải tệp sao lưu đã mã hoá bằng` +
        ` ma-hoa-sao-luu, hoặc đã bị hỏng: ${duongVao}`,
    );
  }

  const phienBan = tep.readUInt8(vt);
  vt += 1;
  if (phienBan !== PHIEN_BAN) {
    throw new LoiRoRang(
      `Phiên bản định dạng ${phienBan} không được hỗ trợ (script này hỗ trợ phiên bản ${PHIEN_BAN}).`,
    );
  }

  const salt = tep.subarray(vt, vt + DO_DAI_SALT);
  vt += DO_DAI_SALT;
  const iv = tep.subarray(vt, vt + DO_DAI_IV);
  vt += DO_DAI_IV;
  const tag = tep.subarray(vt, vt + DO_DAI_TAG);
  vt += DO_DAI_TAG;
  const ciphertext = tep.subarray(vt);

  const khoa = danKhoa(matKhau, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", khoa, iv);
  decipher.setAuthTag(tag);

  let banNen;
  try {
    banNen = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new LoiRoRang(
      [
        "Giải mã thất bại: sai mật khẩu (BACKUP_PASSPHRASE) hoặc tệp đã bị hỏng/sửa.",
        "AES-GCM phát hiện được cả hai trường hợp và từ chối trả dữ liệu sai.",
      ].join("\n"),
    );
  }

  let banRo;
  try {
    banRo = zlib.gunzipSync(banNen);
  } catch {
    throw new LoiRoRang(
      "Giải nén thất bại sau khi giải mã — tệp mã hoá có vẻ bị hỏng.",
    );
  }

  const tamThoi = `${duongRa}.tmp-${process.pid}`;
  try {
    ghiTepAnToan(duongRa, banRo);
  } catch (e) {
    xoaTepDoDang(tamThoi);
    xoaTepDoDang(duongRa);
    throw e;
  }

  return { vaoByte: tep.length, raByte: banRo.length };
}

function inCachDung() {
  console.error(
    [
      "Dùng:",
      "  BACKUP_PASSPHRASE=... node scripts/ma-hoa-sao-luu.mjs ma-hoa <vào> <ra>",
      "  BACKUP_PASSPHRASE=... node scripts/ma-hoa-sao-luu.mjs giai-ma <vào> <ra>",
    ].join("\n"),
  );
}

async function main() {
  const [lenh, duongVao, duongRa] = process.argv.slice(2);

  if (!lenh || !duongVao || !duongRa) {
    inCachDung();
    process.exit(2);
  }

  if (lenh === "ma-hoa") {
    const { vaoByte, raByte } = maHoa(duongVao, duongRa);
    console.log(`Đã mã hoá ${duongVao} (${vaoByte} byte) -> ${duongRa} (${raByte} byte).`);
    return;
  }

  if (lenh === "giai-ma") {
    const { raByte } = giaiMa(duongVao, duongRa);
    console.log(`Đã giải mã ${duongVao} -> ${duongRa} (${raByte} byte).`);
    return;
  }

  console.error(`Lệnh không nhận ra: "${lenh}"`);
  inCachDung();
  process.exit(2);
}

main().catch((e) => {
  if (e instanceof LoiRoRang) {
    console.error(e.message);
  } else {
    console.error(e && e.stack ? e.stack : String(e));
  }
  process.exit(1);
});
