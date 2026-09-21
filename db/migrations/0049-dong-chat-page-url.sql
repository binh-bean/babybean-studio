-- ============================================================================
-- 0049 — Dòng settings cho nút "Nhắn cho studio" (BB-180, BB-181)
--
-- Vì sao cần một migration cho MỘT dòng dữ liệu:
--
-- `chat.page_url` từ trước tới nay chỉ nằm trong `db/seed.sql` (dòng 168), mà
-- seed thì không bao giờ chạy trên production — nó nạp khách giả, bé giả, bộ
-- ảnh giả. Nên bb-dev có dòng này (nhờ seed), bb-prod thì không, và không có
-- migration nào bắc cầu. Soát ngày 21/09/2026 đo ra đúng khoảng trống đó.
--
-- Hậu quả trên bb-prod: `chat.page_url` không có -> nút "Nhắn cho studio" trên
-- màn khách KHÔNG hiện. Ba mẹ không có đường hỏi lại studio ngay tại chỗ đang
-- xem ảnh. Không có lỗi nào được ném ra — đúng lớp "hỏng trong im lặng".
--
-- Giá trị: trang Messenger của studio, giống hệt giá trị đang chạy trên bb-dev.
-- Đây là địa chỉ công khai, không phải khoá bí mật.
--
-- `do nothing`: môi trường nào đã có dòng này (bb-dev) thì migration không đụng
-- vào giá trị đang có. Chạy lại bao nhiêu lần cũng cho cùng một kết quả.
-- ============================================================================

insert into settings (key, branch_id, value)
values ('chat.page_url', null, '"https://m.me/113878833349843"'::jsonb)
on conflict (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;
