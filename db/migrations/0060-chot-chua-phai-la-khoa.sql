-- ============================================================================
-- Migration: 0060 — khách chốt xong CHƯA phải là khoá
--
-- Chủ studio chốt ngày 22/09/2026, trả lời thẳng câu hỏi "sau khi khách bấm
-- Chốt thì họ còn sửa được tới đâu":
--
--     "Mở tự do cho tới khi nhân sự chốt."
--
-- Tức mốc khoá là lúc CSKH bấm XÁC NHẬN (`/confirm`, đẩy bộ ảnh sang
-- 'in_retouch'), không phải lúc ba mẹ bấm Chốt.
--
-- ---------------------------------------------------------------------------
-- Vì sao đổi, nói theo việc thật
-- ---------------------------------------------------------------------------
-- Ba mẹ vừa bấm Chốt xong, mở lại xem và thấy thiếu một tấm bà nội thích. Với
-- luật cũ, tấm đó vĩnh viễn không thêm được: bộ ảnh khoá ngay khi bấm, và
-- đường duy nhất là gọi CSKH để mở lại.
--
-- Nhưng lúc đó CSKH còn chưa xem tới bộ ảnh — chưa ai làm gì với danh sách
-- của họ cả. Khoá vào lúc đó không bảo vệ điều gì; nó chỉ tạo ra một cuộc gọi.
--
-- Mốc đáng khoá là lúc CSKH ĐÃ xác nhận và chuyển cho thợ chỉnh ảnh: từ giây
-- đó, công đã bắt đầu đổ vào đúng danh sách ấy, và đổi danh sách là đổi việc
-- của người khác.
--
-- ---------------------------------------------------------------------------
-- Hai bản danh sách phải khớp nhau
-- ---------------------------------------------------------------------------
-- Bản TypeScript nằm ở `src/lib/gallery-status.ts` và có phép thử so từng giá
-- trị với hàm này (`tests/unit/gallery-status-khop-sql.test.ts`). Chính phép
-- thử đó từng tìm ra `expired` lệch giữa hai bên ở 0035. Sửa một bên mà quên
-- bên kia là lỗi im lặng: giao diện cho bấm, cơ sở dữ liệu từ chối.
-- ============================================================================

create or replace function app.gallery_is_locked(p_status gallery_status)
returns boolean
language sql
immutable
as $$
  -- 'submitted' CỐ Ý không nằm ở đây: khách đã chốt nhưng CSKH chưa xác nhận
  -- thì vẫn còn sửa được. Xem ghi chú đầu tệp.
  select p_status in ('in_retouch', 'awaiting_approval',
                      'approved', 'delivered', 'expired', 'archived');
$$;

comment on function app.gallery_is_locked(gallery_status) is
  'Bộ ảnh có còn cho khách đổi lựa chọn không. Khoá tính từ lúc CSKH xác nhận '
  '(in_retouch), không phải lúc khách bấm Chốt — quyết định của chủ studio '
  '22/09/2026, xem migration 0060.';
