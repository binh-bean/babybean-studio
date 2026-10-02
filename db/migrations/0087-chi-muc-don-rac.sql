-- 0087 — BB-356: chỉ mục cho người dọn dữ liệu vận hành (`src/lib/van-hanh/don-rac.ts`).
--
-- VIẾT NHƯNG CHƯA ÁP (02/10/2026). Người áp: chủ dự án / PM, sau khi duyệt.
--
-- Vì sao: người dọn chạy mỗi đêm trong cron 01:00 (Hobby, 60 giây cho cả route) và
-- chọn ứng viên theo `created_at` cũ nhất. Hôm nay bảng còn nhỏ (activity_logs 26k
-- dòng, notifications 0,5k) nên quét tuần tự vẫn dưới 1 giây — người dọn CHẠY ĐƯỢC
-- KHI CHƯA ÁP tệp này. Chỉ mục để giữ nó nhanh khi bb-prod có vài trăm nghìn dòng.
--
--   * activity_logs: hai chỉ mục sẵn có đều bắt đầu bằng cột khác (branch_id, action),
--     không phục vụ được `where created_at < … order by created_at limit …`.
--   * notifications: chỉ có chỉ mục một phần cho status = 'pending'.
--
-- Không có hàm nào được tạo, nên không có dòng revoke (AGENTS.md §5b).
-- Đảo ngược: drop index if exists idx_activity_logs_created_at, idx_notifications_xong_created_at;

create index if not exists idx_activity_logs_created_at
  on activity_logs (created_at);

create index if not exists idx_notifications_xong_created_at
  on notifications (created_at)
  where status in ('sent', 'skipped', 'failed');
