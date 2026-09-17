-- ============================================================================
-- 0046 — Thêm cấu hình hạn sử dụng link xem ảnh (BB-183)
-- ============================================================================

insert into settings (key, branch_id, value)
values ('gallery.link_ttl_days', null, '60'::jsonb)
on conflict (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;
