# Bảng kiểm thiết lập môi trường Production (bb-prod) cho PM

Tài liệu này hướng dẫn các bước để khởi tạo và đưa môi trường Production (`bb-prod`) vào hoạt động, đảm bảo dữ liệu thật từ Lark được đồng bộ và cô lập hoàn toàn với `bb-dev`.

## 1. Chuẩn bị biến môi trường
1. Tạo file `.env.prod` tại thư mục gốc (nếu chưa có).
2. Lấy các thông tin kết nối từ dự án `bb-prod` trên Supabase Dashboard (Settings -> API / Database) và điền vào `.env.prod`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://[YOUR_PROD_PROJECT_ID].supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=[YOUR_PROD_ANON_KEY]
   SUPABASE_SERVICE_ROLE_KEY=[YOUR_PROD_SERVICE_ROLE_KEY]
   SUPABASE_DB_URL=postgresql://postgres.[YOUR_PROD_PROJECT_ID]:[YOUR_PROD_DB_PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
3. Khai báo API Key của Google Drive (dùng cho production):
   ```bash
   GOOGLE_DRIVE_API_KEY=[YOUR_PROD_DRIVE_API_KEY]
   ```

## 2. Chạy kịch bản thiết lập một lệnh
Mở terminal và chạy **đúng một lệnh duy nhất** sau:

```bash
node --env-file=.env.prod scripts/setup-prod.mjs
```

**Kịch bản này sẽ làm gì?**
- Bật cờ `ALLOW_PROD_PUSH=1` để cho phép đẩy cấu trúc vào môi trường production.
- Áp dụng file `db/schema.sql` (tạo bảng, view, hàm) và `db/policies.sql` (phân quyền RLS).
- Nạp các hằng số vận hành (Chi nhánh, Gói chụp, Cấu hình) từ `db/seed-prod.sql`. KHÔNG nạp dữ liệu khách hàng ảo hay giả lập.

**Kiểm chứng:**
- Chạy lệnh thành công sẽ in ra dòng "🎉 HOÀN TẤT THIẾT LẬP BB-PROD."
- Lên Supabase Dashboard `bb-prod` -> Table Editor, kiểm tra bảng `branches` và `packages` đã có dữ liệu. Các bảng như `customers`, `galleries` sẽ là 0 dòng.

## 3. Tạo tài khoản Admin hệ thống
1. Vào Supabase Dashboard `bb-prod` -> Authentication -> Users.
2. Bấm "Add user" -> "Create new user".
3. Nhập Email (VD: `admin@staff.babybeanstudio.vn`) và Password, bỏ chọn "Auto Confirm User?" nếu không muốn gửi email, sau đó thủ công confirm user.
4. Lấy `UUID` của user vừa tạo.
5. Vào bảng `staff_profiles` -> Insert row, dán UUID vào cột `id`, điền `full_name`, `email` và đặt `role` là `owner`.
6. (Tuỳ chọn) Gắn chi nhánh cho Admin trong bảng `staff_branches`.

## 4. Kéo dữ liệu thật từ Lark (BB-139)
Thực hiện các lệnh sau để bắt đầu nạp danh mục sản phẩm và hợp đồng thật từ hệ thống Lark:

```bash
# 1. Kéo danh mục sản phẩm, đồng bộ bảng packages, addons...
node --env-file=.env.prod scripts/sync-lark-catalog.mjs

# 2. Kéo danh sách hợp đồng, khách hàng, em bé và bộ ảnh thô
node --env-file=.env.prod scripts/sync-lark-contracts.mjs

# 3. Kéo thông tin hậu kỳ (nếu cần)
node --env-file=.env.prod scripts/sync-lark-hauky.mjs
```

**Kiểm chứng:** 
Kiểm tra bảng `customers`, `babies`, `galleries` trên Dashboard xem đã xuất hiện thông tin khách hàng từ Lark chưa.

## 5. Xác nhận & Vận hành
- Mở web môi trường Production (`npm run dev` trỏ tới `.env.prod` hoặc link Vercel Prod).
- Đăng nhập bằng tài khoản Admin ở bước 3.
- Chạy xem trang báo cáo, danh sách bộ ảnh, kiểm tra không có dữ liệu lạ (Fixtures).
- Khi tất cả mọi thứ hiển thị đúng, hoàn thành và xác nhận bàn giao.
