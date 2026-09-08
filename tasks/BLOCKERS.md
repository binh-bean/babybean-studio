# Blockers

Khi một agent không thể tiếp tục, ghi một dòng vào đây **thay vì đoán rồi làm tiếp**.

| Mã task | Agent | Bị chặn bởi điều gì | Cần ai quyết | Ngày | Trạng thái |
|---|---|---|---|---|---|
| BB-003b | ARCH | `SUPABASE_DB_URL` chưa xác thực được — Supabase trả `password authentication failed` với mọi đường (pooler 5432/6543, direct 5432). Chuỗi và mã hoá đã đúng, mật khẩu mới là thứ không khớp. Schema đã áp bằng SQL Editor nên **không chặn Phase 0**; chỉ chặn việc chạy `npm run db:push` tự động. | PM: Settings → Database → Reset database password → **Generate a password** (không tự gõ), copy ngay trong hộp thoại | 2026-09-08 | OPEN |

Trạng thái: `OPEN` → `RESOLVED` (ghi kết luận vào cột "Bị chặn bởi") → xoá sau khi task `DONE`.
