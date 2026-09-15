-- ============================================================================
-- Migration: 0042-bat-tai-anh-mac-dinh
-- BB-158 — cho phép ba mẹ tải ảnh, mặc định BẬT cho mọi bộ ảnh.
--
-- Chủ studio chốt 15/09/2026, đổi quyết định số 4 ở docs/13 (trước đó: tắt ở
-- Phase 1, bật lẻ từ Phase 2).
--
-- Ba chỗ phải đổi cùng lúc, thiếu một là bật hụt:
--   1. mặc định của cột, cho mọi bộ ảnh tạo về sau
--   2. 456 bộ ảnh ĐANG CÓ, vì cột được khai not null default false từ đầu
--   3. thiết lập gallery.allow_download_default, thứ wizard tạo bộ ảnh đọc
--
-- Đây KHÔNG mở thêm cửa nào về quyền: đường tải vẫn là /api/img với đúng tầng
-- xét quyền của BB-133 — phải có phiên đã ký mới lấy được ảnh.
-- ============================================================================

alter table galleries alter column download_enabled set default true;

update galleries set download_enabled = true where download_enabled = false;

update settings
   set value = 'true'::jsonb
 where key = 'gallery.allow_download_default';

insert into settings (key, branch_id, value)
select 'gallery.allow_download_default', null, 'true'::jsonb
where not exists (
  select 1 from settings where key = 'gallery.allow_download_default' and branch_id is null
);
