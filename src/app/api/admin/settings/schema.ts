/**
 * Danh sách cài đặt được sửa qua màn hình, và luật kiểm từng giá trị.
 *
 * OWNER: DEV-BE. Task BB-197.
 *
 * ---------------------------------------------------------------------------
 * Vì sao có một danh sách trắng thay vì cho sửa mọi khoá
 * ---------------------------------------------------------------------------
 * `settings` không chỉ chứa cài đặt. Nó còn chứa `lark_hook_queue` — hàng đợi
 * của đường kéo Lark, một cấu trúc dữ liệu đang chạy. Cho nó lên màn hình là
 * mời người ta sửa thứ không ai định sửa.
 *
 * Danh sách trắng cũng là chỗ ghi KIỂU của từng khoá. Nhận bừa một `jsonb` rồi
 * ghi thẳng xuống là cách nhanh nhất để một hôm nào đó màn khách 500 vì
 * `reminder_days` bỗng là chuỗi thay vì mảng số.
 */
import { z } from "zod";

/** Nhóm để màn hình xếp ô, không ảnh hưởng gì tới dữ liệu. */
export type NhomCaiDat = "album" | "anh" | "quang-cao" | "lien-lac";

export interface DinhNghiaCaiDat {
  key: string;
  nhom: NhomCaiDat;
  /** Giá trị này là bí mật: đọc ra thì che bớt. */
  biMat?: boolean;
  schema: z.ZodTypeAny;
}

const soNgay = (min: number, max: number) => z.number().int().min(min).max(max);

/**
 * `https` hoặc chuỗi rỗng.
 *
 * Rỗng có nghĩa: `chat.page_url` rỗng thì nút "Nhắn cho studio" của ba mẹ không
 * hiện — đó là một lựa chọn hợp lệ, không phải lỗi nhập liệu.
 */
const diaChiHttps = z.union([
  z.literal(""),
  z.string().url().refine((v) => v.startsWith("https://"), {
    message: "Địa chỉ phải bắt đầu bằng https://",
  }),
]);

export const CAI_DAT_SUA_DUOC: DinhNghiaCaiDat[] = [
  // --- Album ---------------------------------------------------------------
  { key: "gallery.default_due_days", nhom: "album", schema: soNgay(1, 90) },
  {
    key: "gallery.reminder_days",
    nhom: "album",
    // Tối đa 5 lần nhắc: quá số đó thì không còn là nhắc, mà là làm phiền.
    schema: z
      .array(soNgay(0, 90))
      .max(5)
      .refine((a) => new Set(a).size === a.length, { message: "Ngày nhắc bị trùng" })
      .transform((a) => [...a].sort((x, y) => x - y)),
  },
  { key: "gallery.link_ttl_days", nhom: "album", schema: soNgay(1, 365) },
  { key: "gallery.invite_default", nhom: "album", schema: z.boolean() },

  // --- Ảnh -----------------------------------------------------------------
  { key: "gallery.watermark_default", nhom: "anh", schema: z.boolean() },
  { key: "gallery.allow_download_default", nhom: "anh", schema: z.boolean() },
  { key: "photo.expected_long_edge_px", nhom: "anh", schema: z.number().int().min(512).max(4096) },
  {
    // Giá một ảnh chọn thêm mặc định, dùng khi TẠO bộ ảnh mới (BB-214c).
    // Đổi ở đây không đổi giá của bộ ảnh đã có — cột galleries.extra_photo_price
    // giữ nguyên giá trị đã ghi lúc tạo, không đọc lại settings sau đó.
    key: "gallery.extra_photo_price_default",
    nhom: "anh",
    schema: z.number().int().min(0).max(10_000_000),
  },

  /*
    --- Quảng cáo của studio trong màn xem ảnh lớn ---------------------------

    Chủ studio 22/09/2026 khoanh vùng trống bên trái tấm ảnh: "phần màu đỏ là
    banner quảng cáo". Để trống hai ô này thì không có gì hiện ra — không dựng
    sẵn một ô xám ghi "quảng cáo tại đây".

    Chỉ nhận https: dải ảnh này nằm trong trang của khách, và một địa chỉ http
    làm trình duyệt báo trang không an toàn ngay giữa lúc ba mẹ đang chọn ảnh.
  */
  { key: "gallery.banner_image_url", nhom: "quang-cao", schema: diaChiHttps },
  { key: "gallery.banner_link_url", nhom: "quang-cao", schema: diaChiHttps },

  // --- Liên lạc ------------------------------------------------------------
  { key: "chat.page_url", nhom: "lien-lac", schema: diaChiHttps },
  { key: "lark.webhook_url", nhom: "lien-lac", biMat: true, schema: diaChiHttps },
];

export const KHOA_SUA_DUOC = new Set(CAI_DAT_SUA_DUOC.map((c) => c.key));

export function timDinhNghia(key: string): DinhNghiaCaiDat | undefined {
  return CAI_DAT_SUA_DUOC.find((c) => c.key === key);
}

/**
 * Thân của PATCH: một hoặc nhiều khoá cùng lúc.
 *
 * Kiểm tên khoá ở đây, kiểm GIÁ TRỊ ở `timDinhNghia(...).schema` — hai việc
 * khác nhau, và gộp lại thì thông báo lỗi không nói được khoá nào sai.
 */
export const PatchSettingsSchema = z.object({
  thayDoi: z
    .array(
      z.object({
        key: z.string().refine((k) => KHOA_SUA_DUOC.has(k), {
          message: "Khoá này không sửa được qua màn hình",
        }),
        value: z.unknown(),
      }),
    )
    .min(1)
    .max(CAI_DAT_SUA_DUOC.length),
});

/** Che bớt một địa chỉ bí mật: giữ đầu và đuôi, bỏ ruột. */
export function cheBot(giaTri: unknown): string {
  const s = typeof giaTri === "string" ? giaTri : "";
  if (s.length <= 24) return s ? "••••" : "";
  return `${s.slice(0, 16)}••••${s.slice(-6)}`;
}
