-- ============================================================================
-- 0054 — Bỏ dòng cài đặt đã chết: `gallery.require_pin_default` (BB-197)
--
-- Mã PIN gỡ hẳn ở BB-169 và migration `0045`. Nhưng dòng cài đặt của nó vẫn
-- nằm đó, vẫn `true`. Quét cả `src/` lẫn `db/` ngày 21/09/2026: **không chỗ nào
-- đọc nó nữa**.
--
-- Vì sao đáng xoá chứ không kệ: màn Cài đặt (BB-197) liệt kê bảng này cho chủ
-- studio. Một công tắc ghi "Bắt nhập mã PIN — ĐANG BẬT" mà bật hay tắt đều
-- không đổi gì là thứ tệ hơn cả không có: người dùng tin mình vừa bật một lớp
-- bảo vệ không tồn tại.
--
-- Chạy lại nhiều lần cũng cho cùng kết quả.
-- ============================================================================

delete from settings
 where key = 'gallery.require_pin_default'
   and branch_id is null;
