-- ============================================================================
-- 0101 — BB-387: số ngày Bean ước tính gửi lại ảnh sau khi ba mẹ xin sửa
--
-- VIẾT NHƯNG CHƯA ÁP. Người áp là giám đốc điều hành sau khi soát. Chưa áp thì
-- app chạy đúng: mã đọc `settings` gặp thiếu dòng thì dùng 3 ngày
-- (src/lib/anh-chinh-sua/han-sua.ts). Migration này chỉ chèn dòng mặc định để
-- màn Cài đặt hiện sẵn số 3 cho Admin sửa.
--
-- Không tạo hàm SQL nên không có dòng `revoke execute`. Không đụng dòng đã có.
-- Chạy lại được nhiều lần (`on conflict do nothing`).
--
-- Đảo ngược: delete from settings where key = 'gallery.revision_days_estimate' and branch_id is null;
-- ============================================================================

insert into settings (key, branch_id, value)
values ('gallery.revision_days_estimate', null, '3'::jsonb)
on conflict (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;
