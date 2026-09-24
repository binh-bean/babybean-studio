/**
 * Đọc địa chỉ nút "Nhắn cho studio" từ giá trị cài đặt `chat.page_url`.
 *
 * OWNER: DEV-FE. Task BB-216.
 *
 * ---------------------------------------------------------------------------
 * Vì sao tách hàm thuần riêng khỏi chỗ gọi cơ sở dữ liệu
 * ---------------------------------------------------------------------------
 * Luật kiểm giống hệt `diaChiHttps` ở `src/app/api/admin/settings/schema.ts`
 * và cách `src/app/api/g/gallery/route.ts` đọc `chat.page_url`: chỉ nhận
 * chuỗi bắt đầu bằng `https://`, mọi trường hợp khác (rỗng, `http://`, thiếu
 * cấu hình) coi là "không có" — trang gốc khi đó ẨN nút thay vì trỏ tới
 * `https://m.me/` (trang chủ Messenger chung, không phải của studio — đây
 * chính là lỗi trang gốc bản cũ mắc phải).
 *
 * Tách hàm thuần để phép thử không cần dựng Supabase giả.
 */
export function duongNhanTinTuCaiDat(gia_tri: unknown): string | null {
  if (typeof gia_tri !== "string") return null;
  if (!gia_tri.startsWith("https://")) return null;
  return gia_tri;
}
