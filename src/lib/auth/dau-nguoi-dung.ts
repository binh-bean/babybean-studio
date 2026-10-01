/**
 * BB-341 — "middleware đã hỏi Supabase Auth rồi": dấu ký chuyển từ middleware
 * xuống `requireStaff()` trong CÙNG một request, để trang quản trị chỉ gọi
 * `auth.getUser()` MỘT lần thay vì hai.
 *
 * OWNER: SEC-ARCH.
 *
 * Trước đây mỗi lượt mở một trang /admin hỏi Supabase Auth hai lần nối đuôi:
 * `getUser()` ở middleware (để đẩy người chưa đăng nhập về /login và làm mới
 * phiên), rồi `getUser()` lần nữa trong `requireStaff()` của layout. Lượt thứ
 * hai hỏi đúng câu đã có lời đáp.
 *
 * Dấu này AN TOÀN vì bốn lớp, không lớp nào đứng một mình:
 *   1. Middleware XOÁ header này khỏi MỌI request từ ngoài vào trước khi làm
 *      gì khác — trình duyệt không gửi giả được.
 *   2. Giá trị ký HMAC-SHA256 bằng `APP_SECRET` (chỉ máy chủ biết), có tiền tố
 *      riêng nên không lẫn với chữ ký phiên khách.
 *   3. Gắn với băm của CHÍNH header `cookie` của request đó — lọt ra ngoài cũng
 *      vô dụng với một cookie khác.
 *   4. Sống 30 giây.
 * Bất kỳ lớp nào không khớp → `requireStaff()` quay về `getUser()` như cũ. Dấu
 * chỉ giúp NHANH hơn, không bao giờ cho thêm quyền: hồ sơ và bộ quyền vẫn đọc
 * bằng phiên của người dùng, dưới RLS.
 *
 * Chạy được ở cả Edge (middleware) lẫn Node — chỉ dùng Web Crypto.
 */

export const HEADER_NGUOI_DUNG = "x-bb-nguoi-dung-da-xac-thuc";

const TIEN_TO = "bb341-mw-uid:";
const HIEU_LUC_GIAY = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bimat(): string | null {
  const s = process.env.APP_SECRET;
  return s && s.length >= 32 ? s : null;
}

function b64url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function bam(text: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function ky(noiDung: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(TIEN_TO + noiDung)));
}

function bangNhau(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let khac = 0;
  for (let i = 0; i < a.length; i++) khac |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return khac === 0;
}

/** Middleware: ký "người dùng `uid` đã được Supabase Auth xác thực cho cookie này". */
export async function kyNguoiDung(
  uid: string,
  cookieHeader: string,
  now: number = Date.now(),
): Promise<string | null> {
  const secret = bimat();
  if (!secret || !UUID.test(uid)) return null;
  const exp = Math.floor(now / 1000) + HIEU_LUC_GIAY;
  const than = `${uid}.${exp}.${await bam(cookieHeader)}`;
  return `${than}.${await ky(than, secret)}`;
}

/** `requireStaff()`: trả `uid` nếu dấu hợp lệ cho đúng cookie này, không thì `null`. */
export async function docNguoiDung(
  giaTri: string | null | undefined,
  cookieHeader: string,
  now: number = Date.now(),
): Promise<string | null> {
  const secret = bimat();
  if (!secret || !giaTri) return null;
  const phan = giaTri.split(".");
  if (phan.length !== 4) return null;
  const [uid, expText, bamCookie, chuKy] = phan as [string, string, string, string];
  if (!UUID.test(uid)) return null;
  const exp = Number(expText);
  if (!Number.isInteger(exp) || exp < Math.floor(now / 1000)) return null;
  if (!bangNhau(chuKy, await ky(`${uid}.${expText}.${bamCookie}`, secret))) return null;
  if (!bangNhau(bamCookie, await bam(cookieHeader))) return null;
  return uid;
}
