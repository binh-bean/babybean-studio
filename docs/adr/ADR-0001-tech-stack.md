# ADR-0001 — Chọn tech stack

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-09-08
- **Người quyết định**: PM + ARCH

## Bối cảnh

Studio nhỏ, 3 chi nhánh, không có đội IT nội bộ. Sản phẩm phải: chạy tốt trên điện thoại qua 4G; xử lý album vài nghìn ảnh; chi phí vận hành thấp; **đội thực thi là agent AI**, nên stack phải phổ biến để model viết đúng ngay lần đầu.

## Các phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| **Next.js + Supabase** | Một codebase cho cả FE/BE; RLS giải quyết đa chi nhánh; Vercel deploy 1 click; agent AI thạo nhất | Ràng buộc vào Vercel + Supabase |
| Remix + Postgres tự quản | Linh hoạt hơn | Phải tự lo hạ tầng, auth, backup — quá sức studio |
| Laravel + Blade | Đội PHP Việt Nam dễ thuê | Trải nghiệm ảnh mobile kém hơn; agent Google viết TS tốt hơn PHP |
| No-code (Softr/Glide + Airtable) | Nhanh nhất | Không kiểm soát được hiệu năng lưới ảnh nghìn tấm; không mở rộng thành ERP được |
| Flutter app | Trải nghiệm mượt | Khách phải cài app — rào cản chí mạng cho khách một lần |

## Quyết định

**Next.js 15 (App Router) + TypeScript strict + Tailwind v4 + shadcn/ui + Supabase + Vercel.**

Lý do quyết định:
1. **Khách không phải cài gì.** Mở link là dùng — điều kiện sống còn.
2. **RLS của Postgres** cho đa chi nhánh là hàng rào ở tầng dữ liệu, không phụ thuộc việc code có nhớ lọc hay không. Quan trọng khi code do agent viết.
3. **Một ngôn ngữ, một repo** — giảm bề mặt sai sót khi nhiều agent làm song song.
4. **Server Components** cho phép render lưới ảnh ở server, JS gửi xuống client ít.
5. Stack này có lượng ví dụ khổng lồ trong dữ liệu huấn luyện → agent viết đúng ngay lần đầu nhiều hơn.

## Hệ quả

**Tích cực**: chi phí ~50 USD/tháng; deploy tự động theo PR; preview cho mỗi PR giúp QA-BOT verify; auth/storage/realtime có sẵn.

**Tiêu cực**: phụ thuộc hai nhà cung cấp. Giảm thiểu: Supabase là Postgres thuần — có thể tự host; Next.js chạy được trên Node bất kỳ nếu rời Vercel (mất cron và edge cache, phải thay bằng thứ khác).

**Ràng buộc phát sinh**: mọi agent phải dùng TypeScript strict, không `any`. Route handler thay vì server action cho các thao tác ghi quan trọng — dễ test và dễ đặt rate limit hơn.
