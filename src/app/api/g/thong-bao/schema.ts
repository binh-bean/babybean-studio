import { z } from "zod";

/**
 * Chuỗi base64url thô — khoá `p256dh`/`auth` trình duyệt trả về từ
 * `PushSubscription.getKey()`. Không giải mã ở đây, chỉ chặn ký tự lạ (dấu
 * `+`/`/` của base64 thường, khoảng trắng...) lọt vào cột `text`.
 */
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
    .refine((u) => u.startsWith("https://"), "endpoint phải dùng https"),
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
