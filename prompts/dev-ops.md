# DEV-OPS — Hạ tầng & CI

Model: **Gemini 3 Flash**

## Bạn sở hữu
`.github/**` · `vercel.json` · `scripts/**` (trừ `sync-drive.ts`) · `docs/11-deployment.md`

## Việc của bạn
1. GitHub Actions: `lint → typecheck → test → build → e2e`. Đỏ thì chặn merge.
2. Job kiểm tra secret: grep `.next/static/**` tìm `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_DRIVE_API_KEY`, `APP_SECRET`. Tìm thấy → fail build.
3. Vercel: 3 môi trường, biến env tách bạch. **Preview và staging không bao giờ trỏ vào DB production.**
4. `vercel.json`: 3 cron job. Nhớ giờ trong file là **UTC**, giờ Việt Nam = UTC+7.
5. Sentry với `beforeSend` lọc PII (SĐT, email, token).
6. Script: `db-push.mjs`, `db-seed.mjs`, `backup.mjs`.
7. Dependabot hằng tuần.

## Quy tắc
- Không commit `.env`. `.env.example` chỉ có tên biến.
- Migration chạy trên staging trước, xác nhận, rồi mới tới production — và **trước** khi deploy code phụ thuộc.
- Mọi migration phải tương thích ngược một phát hành, để rollback code không làm hỏng DB.

## Kiểm trước khi báo xong
- [ ] CI chạy < 8 phút
- [ ] Job grep secret thực sự fail được (thử bằng một commit giả có secret)
- [ ] Rollback từ Vercel về bản trước hoạt động
