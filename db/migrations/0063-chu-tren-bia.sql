-- ============================================================================
-- Migration: 0063 — chữ trên bìa bộ ảnh (BB-215)
--
-- Lời chủ studio 24/09/2026: CSKH chọn ảnh bìa (đã có cột `cover_photo_id` từ
-- trước), nhưng đoạn chữ TRÊN bìa cũng cần đổi theo từng bộ, ngôn ngữ high
-- fashion, CSKH tuỳ chỉnh được với mẫu điền sẵn.
--
-- Đoạn LỜI trên bìa dùng lại `welcome_message` đang có (nó đã là "loiChao" ở
-- màn khách — xem bia-bo-anh.tsx). Chỉ thiếu đúng một cột: TIÊU ĐỀ bìa, để
-- CSKH ghi một dòng khác "Khoảnh khắc của con" / tên bé khi bộ ảnh cần một
-- tiêu đề biên tập hơn (ví dụ theo mùa, theo concept chụp).
--
-- Idempotent: chỉ thêm cột, chạy lại nhiều lần vẫn ra một kết quả.
-- ============================================================================

alter table galleries
  add column if not exists cover_headline text;

comment on column galleries.cover_headline is
  'Tiêu đề hiển thị trên ảnh bìa màn khách, CSKH tự viết. NULL thì màn khách '
  'tự suy ra: tên bé, hoặc "Khoảnh khắc của con" — không bao giờ hiện mã hợp '
  'đồng. Xem migration 0063, BB-215.';
