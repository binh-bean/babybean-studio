import { z } from "zod";

/**
 * Chuỗi base64url thô — khoá `p256dh`/`auth` trình duyệt trả về từ
 * `PushSubscription.getKey()`. Không giải mã ở đây, chỉ chặn ký tự lạ (dấu
 * `+`/`/` của base64 thường, khoảng trắng...) lọt vào cột `text`.
 */
/**
 * Máy chủ push thật của các trình duyệt (Chrome/Edge qua FCM, Firefox, Safari,
 * Windows). Máy chủ app sẽ POST tới `endpoint` mỗi lần báo tin — nhận mọi địa
 * chỉ https là để bất kỳ ai cầm link bộ ảnh bắt máy chủ gọi tới địa chỉ họ
 * chọn (Opus soát BB-246). Trình duyệt mới dùng máy chủ khác thì thêm vào đây.
 */
const MAY_CHU_PUSH = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /\.notify\.windows\.com$/,
];

export function laMayChuPush(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && MAY_CHU_PUSH.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

const Base64UrlKey = z
  .string()
  .min(1, "Thiếu khoá mã hoá")
  .regex(/^[A-Za-z0-9_-]+=*$/, "Khoá phải ở dạng base64url");

/**
 * Đăng ký Web Push đúng hình dạng `PushSubscription.toJSON()` của trình
 * duyệt.
 *
 * `endpoint` BẮT BUỘC https: dịch vụ đẩy thật (FCM, APNs, Mozilla...) luôn
 * trả endpoint https — một endpoint http chỉ có thể là dữ liệu giả hoặc lỗi
 * ở phía khách, và gửi thử tới đó chỉ tốn một lượt gọi mạng vô ích.
 */
export const DangKyThongBaoSchema = z.object({
  endpoint: z
    .string()
    .url("endpoint phải là URL hợp lệ")
    .refine((u) => u.startsWith("https://"), "endpoint phải dùng https")
    .refine(laMayChuPush, "endpoint không phải máy chủ push của trình duyệt"),
  keys: z.object({
    p256dh: Base64UrlKey,
    auth: Base64UrlKey,
  }),
});

export type DangKyThongBaoInput = z.infer<typeof DangKyThongBaoSchema>;

/** Huỷ đăng ký — chỉ cần biết endpoint nào để xoá. */
export const HuyThongBaoSchema = z.object({
  endpoint: z.string().url("endpoint phải là URL hợp lệ"),
});

export type HuyThongBaoInput = z.infer<typeof HuyThongBaoSchema>;
