/**
 * Mã hoá / giải mã mã link gửi khách để lưu lại (BB-201, migration 0070).
 *
 * OWNER: SEC-ARCH (Opus làm). Chỉ dùng phía máy chủ.
 *
 * Tệp LÕI không có `server-only` để script khôi phục (scripts/khoi-phuc-ma-link-tu-lark.mjs)
 * nạp được ngoài Next. Mã trong app nạp qua `ma-link.ts` (có chốt server-only).
 *
 * Vì sao MÃ HOÁ mà không lưu mã gốc: mã link là thứ DUY NHẤT che ảnh của một
 * nhà (không còn PIN). Lưu mã gốc thì ai đọc được bảng là mở được mọi bộ ảnh.
 * Mã hoá bằng khoá chỉ máy chủ có (dẫn xuất từ APP_SECRET) thì lộ riêng cơ sở
 * dữ liệu vẫn vô dụng.
 *
 * AES-256-GCM: có thẻ xác thực — bản mã bị sửa một bit là giải mã hỏng, không
 * ra một mã link "gần đúng". Khoá dẫn xuất bằng HKDF với nhãn riêng, KHÔNG dùng
 * thẳng APP_SECRET (APP_SECRET còn ký phiên khách — gallery-session.ts); đổi
 * mục đích dùng khoá mà dùng chung một khoá là thói quen nên tránh.
 *
 * Định dạng: "v1:<iv>:<tag>:<bản mã>", mỗi phần base64url. Có tiền tố phiên bản
 * để ngày nào đổi thuật toán/khoá thì đọc được cả bản cũ lẫn mới.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const NHAN_KHOA = "babybean/share-link-token/v1";

function khoa(): Buffer {
  const goc = process.env.APP_SECRET;
  if (!goc || goc.length < 32) throw new Error("APP_SECRET thiếu hoặc ngắn hơn 32 ký tự");
  return Buffer.from(hkdfSync("sha256", goc, "babybean-studio", NHAN_KHOA, 32));
}

export function maHoaMaLink(ma: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", khoa(), iv);
  const ct = Buffer.concat([c.update(ma, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(":");
}

/** Giải mã; sai khoá, bị sửa, sai định dạng → null (không ném — màn hình chỉ cần biết "không hiện được"). */
export function giaiMaMaLink(chuoi: string | null | undefined): string | null {
  if (!chuoi) return null;
  const phan = chuoi.split(":");
  if (phan.length !== 4 || phan[0] !== "v1") return null;
  try {
    const [, iv, tag, ct] = phan as [string, string, string, string];
    const d = createDecipheriv("aes-256-gcm", khoa(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
