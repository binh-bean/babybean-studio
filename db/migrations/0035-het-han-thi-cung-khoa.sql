-- ============================================================================
-- Migration: 0035 — bộ ảnh hết hạn thì cũng khoá chọn ảnh
--
-- BB-121. Tìm ra khi viết phép thử so danh sách trạng thái khoá giữa SQL và
-- TypeScript: hai bên lệch nhau đúng một giá trị, `expired`.
--
-- ---------------------------------------------------------------------------
-- Lỗ hổng
-- ---------------------------------------------------------------------------
-- Bộ ảnh ở trạng thái 'expired' đã bị chặn ở hai đường:
--   POST /api/g/addons   — không mua thêm được
--   POST /api/g/submit   — không chốt được
-- nhưng `app.gallery_is_locked()` trả false, nên `patch_selection_batch` VẪN
-- cho đổi lựa chọn. Khách mở lại link cũ còn hạn thì thêm bớt ảnh thoải mái,
-- chỉ là không chốt được — tức là danh sách ảnh đổi sau lưng studio, trong khi
-- người chỉnh ảnh có thể đã làm theo danh sách cũ.
--
-- Phiên đăng nhập kiểm tra LINK CHIA SẺ, không kiểm trạng thái bộ ảnh, nên
-- trạng thái 'expired' không tự chặn được gì.
--
-- ---------------------------------------------------------------------------
-- Vì sao khoá là đúng, không phải mở
-- ---------------------------------------------------------------------------
-- Mở lại cho khách chọn là việc studio làm bằng cách đổi trạng thái sang
-- 'reopened' — trạng thái đó không khoá. Nên khoá 'expired' không chặn mất
-- đường nào của nghiệp vụ.
--
-- Giữ NGUYÊN chữ ký hàm: đổi tham số là Postgres tạo bản CHỒNG chứ không thay
-- thế, và bản mới mặc định cho PUBLIC gọi.
-- ============================================================================

begin;

create or replace function app.gallery_is_locked(p_status gallery_status)
returns boolean
language sql immutable as $$
  select p_status in ('submitted', 'in_retouch', 'awaiting_approval',
                      'approved', 'delivered', 'expired', 'archived');
$$;

revoke all on function app.gallery_is_locked(gallery_status) from public;
grant execute on function app.gallery_is_locked(gallery_status) to authenticated, service_role;

commit;
